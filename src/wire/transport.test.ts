import { afterEach, describe, expect, it, vi } from "vitest";
import { CONNECTION_PREFILLS, connectionFromPrefill, type Connection } from "./connection";
import type { ModelRequest, ModelUsage } from "./modelRequest";
import {
  CancelledError,
  ConcurrencyGate,
  ProviderError,
  TimedOutError,
  UnreachableError,
  assertWithinConnection,
  createFetchTransport,
  isCancelledError,
  parseRetryAfter,
  testConnection,
} from "./transport";

function connection(id: string, overrides: Partial<Connection> = {}): Connection {
  const prefill = CONNECTION_PREFILLS.find((entry) => entry.id === id);
  if (prefill === undefined) throw new Error(`No prefill "${id}"`);
  return { ...connectionFromPrefill(prefill), model: "m", apiKey: "secret", ...overrides };
}

function request(conn: Connection): ModelRequest {
  return {
    connection: conn,
    model: "m",
    messages: [{ role: "user", content: "hi" }],
    maxOutputTokens: 16,
  };
}

function okResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(status: number, body: string, retryAfter?: string): Response {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (retryAfter !== undefined) headers["retry-after"] = retryAfter;
  return new Response(body, { status, headers });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("parseRetryAfter", () => {
  it("reads seconds and HTTP dates", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter("0.5")).toBe(500);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("nonsense")).toBeNull();
  });
});

describe("send", () => {
  it("reports the output ceiling, not unreadable JSON, when a thinker runs out", async () => {
    // The whole budget went to the reasoning trace, so `content` came back
    // empty and `finish_reason` was "length". Before, this reached the Writer
    // as "no JSON Obelus could read" and pointed at the prompt.
    const body = JSON.stringify({
      choices: [
        {
          message: { role: "assistant", content: "", reasoning_content: "Thinking..." },
          finish_reason: "length",
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
      ),
    );

    await expect(createFetchTransport().send(request(connection("openai")))).rejects.toThrow(
      /output ceiling.*reasoning trace/is,
    );
  });

  it("reports no text, not unreadable JSON, when only a reasoning trace comes back", async () => {
    const body = JSON.stringify({
      choices: [
        {
          message: { role: "assistant", content: "", reasoning_content: "Thinking..." },
          finish_reason: "stop",
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
      ),
    );

    await expect(createFetchTransport().send(request(connection("openai")))).rejects.toThrow(
      /no text.*reasoning trace/is,
    );
  });

  it("returns the parsed text from a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse("the text")));
    const transport = createFetchTransport();
    await expect(transport.send(request(connection("openai")))).resolves.toBe("the text");
  });

  it("surfaces a non-retryable Provider error verbatim (story 55)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(errorResponse(400, '{"error":{"message":"bad model"}}')),
    );
    const transport = createFetchTransport();
    await expect(transport.send(request(connection("openai")))).rejects.toMatchObject({
      name: "ProviderError",
      status: 400,
      body: '{"error":{"message":"bad model"}}',
    });
  });

  it("reports an unreachable Connection honestly when fetch throws (story 55)", async () => {
    // The OpenAI bad-key case: a 401 without Access-Control-Allow-Origin reaches
    // the browser as an opaque network failure. It must be reported as
    // unreachable, pointing at "Test connection", and never guessed at.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const transport = createFetchTransport();
    const error = await transport.send(request(connection("openai"))).catch((thrown) => thrown);
    expect(error).toBeInstanceOf(UnreachableError);
    expect((error as Error).message).toContain("OpenAI");
    expect((error as Error).message).toContain("Test connection");
    expect((error as Error).message).toContain("Failed to fetch");
  });

  it("refuses a URL outside the configured Connection (privacy, story 13)", () => {
    expect(() => assertWithinConnection(connection("openai"), "https://evil.example/v1")).toThrow(
      /outside the configured Connection/,
    );
    expect(() =>
      assertWithinConnection(connection("openai"), "https://api.openai.com/v1/models"),
    ).not.toThrow();
  });

  it("reports Provider usage to the request's onUsage callback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "the text" } }],
            usage: { prompt_tokens: 11, completion_tokens: 7 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const seen: ModelUsage[] = [];

    await createFetchTransport().send({
      ...request(connection("openai")),
      onUsage: (usage) => seen.push(usage),
    });

    expect(seen).toEqual([{ inputTokens: 11, outputTokens: 7 }]);
  });
});

describe("cancellation (story 54)", () => {
  it("aborts an in-flight request and reports it as cancelled, not unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (signal?.aborted) {
              reject(new DOMException("aborted", "AbortError"));
              return;
            }
            signal?.addEventListener(
              "abort",
              () => reject(new DOMException("aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );
    const controller = new AbortController();

    const pending = createFetchTransport().send({
      ...request(connection("openai")),
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(CancelledError);
    await expect(pending).rejects.toThrow(/cancelled/i);
  });

  it("stops retrying once the Run is aborted", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(500, "boom"));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createFetchTransport({ baseDelayMs: 1000, maxAttempts: 4 });
    const controller = new AbortController();

    const pending = transport.send({
      ...request(connection("openai")),
      signal: controller.signal,
    });
    // Let the first attempt fail and the Run enter its backoff.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(CancelledError);

    // The backoff would have fired by now; an aborted Run must not retry.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recognises a browser AbortError", () => {
    expect(isCancelledError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isCancelledError(new CancelledError())).toBe(true);
    expect(isCancelledError(new Error("nope"))).toBe(false);
  });
});

/** A `fetch` that accepts the request and then never answers, as a stalled Provider does. */
function stalledFetch(honourSignal: boolean) {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        if (!honourSignal) return;
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new DOMException("aborted", "AbortError"));
          return;
        }
        signal?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      }),
  );
}

describe("request timeout (#46)", () => {
  it("fails a Provider that never responds with a timeout rather than blocking", async () => {
    vi.useFakeTimers();
    const fetchMock = stalledFetch(true);
    vi.stubGlobal("fetch", fetchMock);
    const transport = createFetchTransport({ requestTimeoutMs: 60_000 });

    const pending = transport.send(request(connection("openai")));
    const settled = expect(pending).rejects.toBeInstanceOf(TimedOutError);
    await vi.advanceTimersByTimeAsync(60_000);

    await settled;
    await expect(pending).rejects.toThrow(/did not respond within 1 minute/);
    // A stall is not retried: each retry would hold the Library for another window.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("times out even when the request ignores its abort signal", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", stalledFetch(false));
    const transport = createFetchTransport({ requestTimeoutMs: 1_000 });

    const pending = transport.send(request(connection("openai")));
    const settled = expect(pending).rejects.toBeInstanceOf(TimedOutError);
    await vi.advanceTimersByTimeAsync(1_000);

    await settled;
  });

  it("times out a response whose body never finishes arriving", async () => {
    vi.useFakeTimers();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"choices":'));
        // Never closed: the Provider sent headers and then stalled.
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    const transport = createFetchTransport({ requestTimeoutMs: 1_000 });

    const pending = transport.send(request(connection("openai")));
    const settled = expect(pending).rejects.toBeInstanceOf(TimedOutError);
    await vi.advanceTimersByTimeAsync(1_000);

    await settled;
  });

  it("reports the Writer's cancel as a cancel, not a timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", stalledFetch(true));
    const transport = createFetchTransport({ requestTimeoutMs: 60_000 });
    const controller = new AbortController();

    const pending = transport.send({ ...request(connection("openai")), signal: controller.signal });
    const settled = expect(pending).rejects.toBeInstanceOf(CancelledError);
    await vi.advanceTimersByTimeAsync(1_000);
    controller.abort();

    await settled;
  });

  it("bounds a Connection test the same way", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", stalledFetch(true));
    const transport = createFetchTransport({ requestTimeoutMs: 1_000 });

    const pending = testConnection(transport, connection("openai"));
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/did not respond/),
    });
  });

  it("clears its timer once a request answers in time", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse("the text")));
    const transport = createFetchTransport({ requestTimeoutMs: 1_000 });

    await expect(transport.send(request(connection("openai")))).resolves.toBe("the text");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("retry (story 56)", () => {
  it("honours Retry-After on 429 before retrying", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429, "slow down", "2"))
      .mockResolvedValueOnce(okResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const transport = createFetchTransport({ baseDelayMs: 500 });
    const pending = transport.send(request(connection("openai")));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries 5xx with exponential backoff", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(500, "boom"))
      .mockResolvedValueOnce(errorResponse(503, "still"))
      .mockResolvedValueOnce(okResponse("recovered"));
    vi.stubGlobal("fetch", fetchMock);

    const transport = createFetchTransport({ baseDelayMs: 100 });
    const pending = transport.send(request(connection("openai")));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(200);
    await expect(pending).resolves.toBe("recovered");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up after the attempt budget and reports the last error", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(500, "always down"));
    vi.stubGlobal("fetch", fetchMock);

    const transport = createFetchTransport({ baseDelayMs: 1, maxAttempts: 3 });
    const pending = transport.send(request(connection("openai")));
    const assertion = expect(pending).rejects.toBeInstanceOf(ProviderError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(401, "no"));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createFetchTransport();
    await expect(transport.send(request(connection("openai")))).rejects.toBeInstanceOf(
      ProviderError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("the concurrency cap (story 57)", () => {
  it("caps in-flight requests per Connection and shows the queue", async () => {
    const gate = new ConcurrencyGate();
    const conn = connection("openai", { concurrency: 3 });
    const releases: (() => void)[] = [];
    let inFlight = 0;
    let peak = 0;

    const tasks = Array.from({ length: 5 }, () =>
      gate.run(conn, async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise<void>((resolve) => releases.push(resolve));
        inFlight -= 1;
      }),
    );

    await tick();
    expect(peak).toBe(3);
    expect(gate.view(conn.id)).toEqual({ active: 3, queued: 2 });
    expect(gate.total()).toEqual({ active: 3, queued: 2 });

    releases.shift()?.();
    await tick();
    expect(peak).toBe(3);
    expect(gate.view(conn.id)).toEqual({ active: 3, queued: 1 });

    while (releases.length > 0) {
      releases.shift()?.();
      await tick();
    }
    await Promise.all(tasks);
    expect(gate.total()).toEqual({ active: 0, queued: 0 });
  });

  it("honours a per-Connection cap of one", async () => {
    const gate = new ConcurrencyGate();
    const conn = connection("openai", { concurrency: 1 });
    const releases: (() => void)[] = [];
    const tasks = Array.from({ length: 2 }, () =>
      gate.run(conn, () => new Promise<void>((resolve) => releases.push(resolve))),
    );
    await tick();
    expect(gate.view(conn.id)).toEqual({ active: 1, queued: 1 });
    releases.shift()?.();
    await tick();
    releases.shift()?.();
    await Promise.all(tasks);
  });

  it("notifies subscribers when the queue changes", async () => {
    const gate = new ConcurrencyGate();
    const conn = connection("openai", { concurrency: 1 });
    const listener = vi.fn();
    gate.subscribe(listener);
    const release = await new Promise<() => void>((resolve) => {
      void gate.run(conn, () => new Promise<void>((inner) => resolve(inner)));
    });
    expect(listener).toHaveBeenCalled();
    release();
    await tick();
  });
});

/** Lets queued microtasks and immediate timers settle. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("testConnection (story 10)", () => {
  it("reports the model list when the Connection answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "gpt-a" }, { id: "gpt-b" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(testConnection(createFetchTransport(), connection("openai"))).resolves.toEqual({
      ok: true,
      models: ["gpt-a", "gpt-b"],
      error: null,
    });
  });

  it("reports a failure as a non-ok result rather than throwing", async () => {
    // The opaque network failure a bad key produces without CORS: the Writer
    // gets a result they can act on, pointing at "Test connection".
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const result = await testConnection(createFetchTransport(), connection("openai"));

    expect(result.ok).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.error).toContain("Test connection");
  });
});
