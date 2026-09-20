import { describe, expect, it } from "vitest";
import { CONNECTION_PREFILLS, connectionFromPrefill, type Connection } from "./connection";
import { createFixtureTransport } from "./fixtureTransport";
import type { ModelRequest } from "./modelRequest";

function connection(id: string, overrides: Partial<Connection> = {}): Connection {
  const prefill = CONNECTION_PREFILLS.find((entry) => entry.id === id);
  if (prefill === undefined) throw new Error(`No prefill "${id}"`);
  return { ...connectionFromPrefill(prefill), model: "m", apiKey: "secret", ...overrides };
}

function request(conn: Connection): ModelRequest {
  return {
    connection: conn,
    model: "m",
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    maxOutputTokens: 32,
  };
}

describe("the fixture player", () => {
  it("replays a fixture response", async () => {
    const transport = createFixtureTransport({ respond: () => "fixture text" });
    await expect(transport.send(request(connection("openai")))).resolves.toBe("fixture text");
  });

  it("records every request, with the built URL, headers and body", async () => {
    const transport = createFixtureTransport({ respond: () => "x" });
    await transport.send(request(connection("openai")));
    await transport.listModels(connection("openai"));

    expect(transport.requests).toHaveLength(2);
    const [call, listing] = transport.requests;
    expect(call?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(call?.headers.Authorization).toBe("Bearer secret");
    expect(call?.body).toMatchObject({ model: "m", max_tokens: 32 });
    expect(listing?.url).toBe("https://api.openai.com/v1/models");
    expect(listing?.method).toBe("GET");
  });

  it("returns listed models from a function of the Connection", async () => {
    const transport = createFixtureTransport({ models: () => ["gpt-a", "gpt-b"] });
    await expect(transport.listModels(connection("openai"))).resolves.toEqual(["gpt-a", "gpt-b"]);
  });

  it("never sees a base URL other than the configured Connection's", async () => {
    const transport = createFixtureTransport({ respond: () => "x", models: [] });
    const first = connection("openai");
    const second = connection("ollama", { apiKey: "" });

    await transport.send(request(first));
    await transport.listModels(second);

    // Exact URLs, independent of the adapter's join, plus the stronger claim:
    // no recorded request sits under any Connection's base but its own.
    expect(transport.requests.map((recorded) => recorded.url)).toEqual([
      "https://api.openai.com/v1/chat/completions",
      "http://localhost:11434/v1/models",
    ]);
    const bases = transport.requests.map((recorded) =>
      recorded.connection.baseUrl.replace(/\/+$/, ""),
    );
    transport.requests.forEach((recorded, index) => {
      for (const [otherIndex, base] of bases.entries()) {
        if (otherIndex === index) continue;
        expect(recorded.url.startsWith(`${base}/`)).toBe(false);
      }
    });
    expect(transport.requests.map((recorded) => recorded.connection.id)).toEqual([
      "openai",
      "ollama",
    ]);
  });
});
