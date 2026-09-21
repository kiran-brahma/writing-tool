import { afterEach, describe, expect, it, vi } from "vitest";
import { CONNECTION_PREFILLS, connectionFromPrefill, type Connection } from "./connection";
import type { ModelRequest } from "./modelRequest";
import { concurrencyGate, transport } from "./productionTransport";

function connection(): Connection {
  const prefill = CONNECTION_PREFILLS.find((entry) => entry.id === "openai");
  if (prefill === undefined) throw new Error("no openai prefill");
  return { ...connectionFromPrefill(prefill), model: "m", apiKey: "secret", concurrency: 1 };
}

function request(conn: Connection): ModelRequest {
  return {
    connection: conn,
    model: "m",
    messages: [{ role: "user", content: "hi" }],
    maxOutputTokens: 16,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The one Transport and the one gate must be the same pair for every caller.
 * The Connections panel renders `concurrencyGate`; a model Run uses `transport`.
 * If they were separate gates the visible queue would lie and the per-Connection
 * cap would not be shared, which is the bug #16 fixes.
 */
describe("the shared transport and concurrency gate", () => {
  it("queues a model call behind the gate the Connections panel shows", async () => {
    const conn = connection();
    let release: (() => void) | undefined;
    const held = concurrencyGate.run(
      conn,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await tick();
    expect(concurrencyGate.view(conn.id)).toEqual({ active: 1, queued: 0 });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = transport.send(request(conn));
    await tick();

    // The Connection's cap is one, and the held task owns the only slot.
    expect(concurrencyGate.view(conn.id)).toEqual({ active: 1, queued: 1 });
    expect(fetchMock).not.toHaveBeenCalled();

    release?.();
    await expect(pending).resolves.toBe("ok");
    await held;
    expect(concurrencyGate.total()).toEqual({ active: 0, queued: 0 });
  });
});

/** Lets queued microtasks and immediate timers settle. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
