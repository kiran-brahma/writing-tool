import { describe, expect, it } from "vitest";
import { CONNECTION_PREFILLS, connectionFromPrefill, type Connection } from "./connection";
import type { ModelRequest } from "./modelRequest";
import { joinUrl, protocolFor } from "./protocols";

function connectionFor(id: string, overrides: Partial<Connection> = {}): Connection {
  const prefill = CONNECTION_PREFILLS.find((entry) => entry.id === id);
  if (prefill === undefined) throw new Error(`No prefill "${id}"`);
  return { ...connectionFromPrefill(prefill), model: "test-model", apiKey: "secret", ...overrides };
}

function request(connection: Connection): ModelRequest {
  return {
    connection,
    model: "test-model",
    system: "You are terse.",
    messages: [{ role: "user", content: "Hello" }],
    maxOutputTokens: 256,
    temperature: 0.4,
  };
}

describe("the Protocol table", () => {
  it("routes each Protocol to its adapter", () => {
    expect(protocolFor("openai-shaped").protocol).toBe("openai-shaped");
    expect(protocolFor("anthropic-shaped").protocol).toBe("anthropic-shaped");
    expect(protocolFor("gemini-native").protocol).toBe("gemini-native");
  });

  it("joins a path inside the Connection's base URL", () => {
    expect(joinUrl("https://api.openai.com/v1", "/chat/completions")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(joinUrl("https://api.openai.com/v1/", "/models")).toBe(
      "https://api.openai.com/v1/models",
    );
  });
});

describe("the openai-shaped adapter", () => {
  it("constructs the endpoint, auth header and body without a network", () => {
    const built = protocolFor("openai-shaped").buildRequest(request(connectionFor("openai")));

    expect(built.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(built.url).not.toContain("secret");
    expect(built.init.method).toBe("POST");

    const headers = built.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret");
    expect(headers["content-type"]).toBe("application/json");

    const body = JSON.parse(built.init.body as string) as {
      model: string;
      max_tokens: number;
      temperature: number;
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe("test-model");
    expect(body.max_tokens).toBe(256);
    expect(body.temperature).toBe(0.4);
  });

  it("places the system prompt first, as a system message", () => {
    const built = protocolFor("openai-shaped").buildRequest(request(connectionFor("openai")));
    const body = JSON.parse(built.init.body as string) as {
      messages: { role: string; content: string }[];
    };
    expect(body.messages).toEqual([
      { role: "system", content: "You are terse." },
      { role: "user", content: "Hello" },
    ]);
  });

  it("omits the system message when there is no system prompt", () => {
    const without = { ...request(connectionFor("openai")), system: undefined };
    const built = protocolFor("openai-shaped").buildRequest(without);
    const body = JSON.parse(built.init.body as string) as { messages: unknown[] };
    expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("maps a jsonSchema to a strict response_format", () => {
    const schema = { type: "object" };
    const built = protocolFor("openai-shaped").buildRequest({
      ...request(connectionFor("openai")),
      jsonSchema: schema,
    });
    const body = JSON.parse(built.init.body as string) as { response_format: unknown };
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "obelus", strict: true, schema },
    });
  });

  it("sends no auth header for a keyless local Ollama Connection", () => {
    const built = protocolFor("openai-shaped").buildRequest(
      request(connectionFor("ollama", { apiKey: "" })),
    );
    const headers = built.init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("extracts the text from choices[0].message.content", () => {
    const text = protocolFor("openai-shaped").parseResponse({
      choices: [{ message: { role: "assistant", content: "the text" } }],
    });
    expect(text).toBe("the text");
  });

  it("fails loudly rather than returning empty text when the shape is wrong", () => {
    expect(() => protocolFor("openai-shaped").parseResponse({ choices: [] })).toThrow(
      /no text/i,
    );
  });

  it("lists model ids from an OpenAI-shaped response", () => {
    const ids = protocolFor("openai-shaped").parseModelList({
      data: [{ id: "gpt-a" }, { id: "gpt-b" }],
    });
    expect(ids).toEqual(["gpt-a", "gpt-b"]);
  });
});

describe("the deferred Protocol adapters", () => {
  it("refuse a chat call with a pointer to ticket #17", () => {
    expect(() => protocolFor("anthropic-shaped").buildRequest(request(connectionFor("anthropic")))).toThrow(
      /#17/,
    );
    expect(() => protocolFor("gemini-native").buildRequest(request(connectionFor("gemini")))).toThrow(
      /#17/,
    );
  });

  it("still answer model listing, so test connection works on every Connection", () => {
    const anthropic = connectionFor("anthropic");
    const built = protocolFor("anthropic-shaped").buildModelListRequest(anthropic);
    expect(built.url).toBe("https://api.anthropic.com/v1/models");
    expect(built.url).not.toContain("secret");
    const headers = built.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("secret");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");

    expect(protocolFor("anthropic-shaped").parseModelList({ data: [{ id: "claude-a" }] })).toEqual([
      "claude-a",
    ]);
  });

  it("strips the models/ prefix from a Gemini listing", () => {
    const gemini = connectionFor("gemini");
    const built = protocolFor("gemini-native").buildModelListRequest(gemini);
    expect(built.url).toBe("https://generativelanguage.googleapis.com/v1beta/models");
    expect(built.url).not.toContain("secret");
    expect((built.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret");

    expect(
      protocolFor("gemini-native").parseModelList({
        models: [{ name: "models/gemini-3.8-flash" }, { name: "models/gemini-2.5-pro" }],
      }),
    ).toEqual(["gemini-3.8-flash", "gemini-2.5-pro"]);
  });
});
