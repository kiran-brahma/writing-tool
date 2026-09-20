import { afterEach, describe, expect, it, vi } from "vitest";
import { CONNECTION_PREFILLS, connectionFromPrefill, type Connection } from "./connection";
import type { ModelRequest } from "./modelRequest";
import { joinUrl, protocolFor } from "./protocols";
import { createFetchTransport } from "./transport";

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

function bodyOf(built: { init: RequestInit }): Record<string, unknown> {
  return JSON.parse(built.init.body as string) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

    const body = bodyOf(built) as { model: string; max_tokens: number; temperature: number };
    expect(body.model).toBe("test-model");
    expect(body.max_tokens).toBe(256);
    expect(body.temperature).toBe(0.4);
  });

  it("places the system prompt first, as a system message", () => {
    const built = protocolFor("openai-shaped").buildRequest(request(connectionFor("openai")));
    const body = bodyOf(built) as { messages: { role: string; content: string }[] };
    expect(body.messages).toEqual([
      { role: "system", content: "You are terse." },
      { role: "user", content: "Hello" },
    ]);
  });

  it("omits the system message when there is no system prompt", () => {
    const without = { ...request(connectionFor("openai")), system: undefined };
    const built = protocolFor("openai-shaped").buildRequest(without);
    const body = bodyOf(built) as { messages: unknown[] };
    expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("maps a jsonSchema to a strict response_format", () => {
    const schema = { type: "object" };
    const built = protocolFor("openai-shaped").buildRequest({
      ...request(connectionFor("openai")),
      jsonSchema: schema,
    });
    const body = bodyOf(built) as { response_format: unknown };
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
    expect(() => protocolFor("openai-shaped").parseResponse({ choices: [] })).toThrow(/no text/i);
  });

  it("lists model ids from an OpenAI-shaped response", () => {
    const ids = protocolFor("openai-shaped").parseModelList({
      data: [{ id: "gpt-a" }, { id: "gpt-b" }],
    });
    expect(ids).toEqual(["gpt-a", "gpt-b"]);
  });
});

describe("the anthropic-shaped adapter", () => {
  it("constructs the endpoint, required headers and body without a network", () => {
    const built = protocolFor("anthropic-shaped").buildRequest(request(connectionFor("anthropic")));

    expect(built.url).toBe("https://api.anthropic.com/v1/messages");
    expect(built.url).not.toContain("secret");
    expect(built.init.method).toBe("POST");

    const headers = built.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("secret");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");

    const body = bodyOf(built) as { model: string; max_tokens: number; temperature: number };
    expect(body.model).toBe("test-model");
    expect(body.max_tokens).toBe(256);
    expect(body.temperature).toBe(0.4);
  });

  it("keeps the version and browser-access headers even if a Connection record lost them", () => {
    const built = protocolFor("anthropic-shaped").buildRequest(
      request(connectionFor("anthropic", { extraHeaders: {} })),
    );
    const headers = built.init.headers as Record<string, string>;
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  });

  it("places the system prompt at the top level, not as a message", () => {
    const built = protocolFor("anthropic-shaped").buildRequest(request(connectionFor("anthropic")));
    const body = bodyOf(built) as {
      system: string;
      messages: { role: string; content: string }[];
    };
    expect(body.system).toBe("You are terse.");
    expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("omits the system field when there is no system prompt", () => {
    const without = { ...request(connectionFor("anthropic")), system: undefined };
    const built = protocolFor("anthropic-shaped").buildRequest(without);
    const body = bodyOf(built) as { system?: unknown };
    expect(body.system).toBeUndefined();
  });

  it("maps a jsonSchema to output_config.format", () => {
    const schema = { type: "object" };
    const built = protocolFor("anthropic-shaped").buildRequest({
      ...request(connectionFor("anthropic")),
      jsonSchema: schema,
    });
    const body = bodyOf(built) as { output_config: unknown };
    expect(body.output_config).toEqual({
      format: { type: "json_schema", schema },
    });
  });

  it("extracts and concatenates text blocks, skipping thinking and tool use", () => {
    const text = protocolFor("anthropic-shaped").parseResponse({
      content: [
        { type: "thinking", thinking: "not prose" },
        { type: "text", text: "the " },
        { type: "tool_use", name: "x", input: {} },
        { type: "text", text: "text" },
      ],
    });
    expect(text).toBe("the text");
  });

  it("fails loudly rather than returning empty text when the shape is wrong", () => {
    expect(() => protocolFor("anthropic-shaped").parseResponse({ content: [] })).toThrow(/no text/i);
    expect(() => protocolFor("anthropic-shaped").parseResponse({})).toThrow(/no text/i);
  });

  it("lists model ids from an Anthropic-shaped response, with the key out of the URL", () => {
    const built = protocolFor("anthropic-shaped").buildModelListRequest(connectionFor("anthropic"));
    expect(built.url).toBe("https://api.anthropic.com/v1/models");
    expect(built.url).not.toContain("secret");
    expect((built.init.headers as Record<string, string>)["x-goog-api-key"]).toBeUndefined();

    expect(protocolFor("anthropic-shaped").parseModelList({ data: [{ id: "claude-a" }] })).toEqual([
      "claude-a",
    ]);
  });
});

describe("the gemini-native adapter", () => {
  it("constructs the endpoint with the model in the path and the key in a header", () => {
    const built = protocolFor("gemini-native").buildRequest(request(connectionFor("gemini")));

    expect(built.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent",
    );
    expect(built.url).not.toContain("secret");
    expect(built.url).not.toContain("?key=");
    expect(built.init.method).toBe("POST");

    const headers = built.init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("secret");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers.Authorization).toBeUndefined();

    const body = bodyOf(built) as {
      generationConfig: { maxOutputTokens: number; temperature: number };
    };
    expect(body.generationConfig.maxOutputTokens).toBe(256);
    expect(body.generationConfig.temperature).toBe(0.4);
  });

  it("strips a leading models/ prefix and encodes the model into one path segment", () => {
    const prefixed = protocolFor("gemini-native").buildRequest({
      ...request(connectionFor("gemini")),
      model: "models/gemini-3.8-flash",
    });
    expect(prefixed.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    );

    const escaped = protocolFor("gemini-native").buildRequest({
      ...request(connectionFor("gemini")),
      model: "../../evil",
    });
    expect(escaped.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/..%2F..%2Fevil:generateContent",
    );
  });

  it("places the system prompt in systemInstruction and maps the assistant role to model", () => {
    const built = protocolFor("gemini-native").buildRequest({
      ...request(connectionFor("gemini")),
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Sure" },
        { role: "user", content: "More" },
      ],
    });
    const body = bodyOf(built) as {
      systemInstruction: unknown;
      contents: { role: string; parts: { text: string }[] }[];
    };
    expect(body.systemInstruction).toEqual({ parts: [{ text: "You are terse." }] });
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "Hello" }] },
      { role: "model", parts: [{ text: "Sure" }] },
      { role: "user", parts: [{ text: "More" }] },
    ]);
  });

  it("omits systemInstruction when there is no system prompt", () => {
    const without = { ...request(connectionFor("gemini")), system: undefined };
    const built = protocolFor("gemini-native").buildRequest(without);
    const body = bodyOf(built) as { systemInstruction?: unknown };
    expect(body.systemInstruction).toBeUndefined();
  });

  it("maps a jsonSchema to generationConfig.responseMimeType and responseJsonSchema", () => {
    const schema = { type: "object" };
    const built = protocolFor("gemini-native").buildRequest({
      ...request(connectionFor("gemini")),
      jsonSchema: schema,
    });
    const body = bodyOf(built) as {
      generationConfig: { responseMimeType: string; responseJsonSchema: unknown };
    };
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema).toEqual(schema);
  });

  it("extracts and concatenates text parts, skipping thoughts", () => {
    const text = protocolFor("gemini-native").parseResponse({
      candidates: [
        {
          content: {
            parts: [
              { thought: true, text: "not prose" },
              { text: "the " },
              { functionCall: { name: "x" } },
              { text: "text" },
            ],
          },
        },
      ],
    });
    expect(text).toBe("the text");
  });

  it("fails loudly rather than returning empty text when the shape is wrong", () => {
    expect(() => protocolFor("gemini-native").parseResponse({ candidates: [] })).toThrow(/no text/i);
    expect(() => protocolFor("gemini-native").parseResponse({ candidates: [{}] })).toThrow(/no text/i);
  });

  it("strips the models/ prefix from a Gemini listing and keeps the key out of the URL", () => {
    const built = protocolFor("gemini-native").buildModelListRequest(connectionFor("gemini"));
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

describe("one model Pass on all three Protocols", () => {
  const jsonSchema = { type: "object" };
  const text = '{"findings":[]}';

  // The same returned text, in each Protocol's own response shape.
  const responses: Record<string, unknown> = {
    "openai-shaped": { choices: [{ message: { role: "assistant", content: text } }] },
    "anthropic-shaped": {
      content: [
        { type: "thinking", thinking: "not prose" },
        { type: "text", text },
      ],
    },
    "gemini-native": { candidates: [{ content: { parts: [{ text }] } }] },
  };

  // One ModelRequest, built once, handed unchanged to every Protocol.
  function sharedRequest(connection: Connection): ModelRequest {
    return {
      connection,
      model: "test-model",
      system: "You are terse.",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Sure" },
        { role: "user", content: "Critique this paragraph." },
      ],
      maxOutputTokens: 256,
      temperature: 0.4,
      jsonSchema,
    };
  }

  it("returns the same text and places the prompt and schema per Protocol, through the seam", async () => {
    for (const id of ["openai", "anthropic", "gemini"]) {
      const connection = connectionFor(id);
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(responses[connection.protocol]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await createFetchTransport().send(sharedRequest(connection));
      vi.unstubAllGlobals();

      expect(result, connection.protocol).toBe(text);

      // The request really crossed the seam, built by the adapter for this
      // Protocol: assert where the system prompt and the schema landed.
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      const body = JSON.parse(init.body as string) as Record<string, any>;

      switch (connection.protocol) {
        case "openai-shaped":
          expect(url).toBe("https://api.openai.com/v1/chat/completions");
          expect(headers.Authorization).toBe("Bearer secret");
          expect(body.messages[0]).toEqual({ role: "system", content: "You are terse." });
          expect(body.response_format.json_schema.schema).toEqual(jsonSchema);
          break;
        case "anthropic-shaped":
          expect(url).toBe("https://api.anthropic.com/v1/messages");
          expect(headers["x-api-key"]).toBe("secret");
          expect(headers["anthropic-version"]).toBe("2023-06-01");
          expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
          expect(body.system).toBe("You are terse.");
          expect(body.messages[0]).toEqual({ role: "user", content: "Hello" });
          expect(body.output_config.format.schema).toEqual(jsonSchema);
          break;
        case "gemini-native":
          expect(url).toBe(
            "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent",
          );
          expect(url).not.toContain("secret");
          expect(url).not.toContain("?key=");
          expect(headers["x-goog-api-key"]).toBe("secret");
          expect(body.systemInstruction).toEqual({ parts: [{ text: "You are terse." }] });
          expect(body.contents[1]).toEqual({ role: "model", parts: [{ text: "Sure" }] });
          expect(body.generationConfig.responseMimeType).toBe("application/json");
          expect(body.generationConfig.responseJsonSchema).toEqual(jsonSchema);
          break;
      }
    }
  });
});
