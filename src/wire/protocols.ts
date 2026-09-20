import { ANTHROPIC_REQUIRED_HEADERS, type Connection, type Protocol } from "./connection";
import type { ModelRequest } from "./modelRequest";

/**
 * The Protocol table. This is the only place that knows a wire format, and it
 * is what keeps the rest of the app ignorant of which Provider is in use.
 *
 * Only `openai-shaped` is implemented here; `anthropic-shaped` and
 * `gemini-native` carry their listing endpoint because "test connection" and
 * "list models" work on every Connection, but their chat adapters arrive with
 * ticket #17 (Anthropic and Gemini Protocols).
 */

export interface BuiltRequest {
  url: string;
  init: RequestInit;
}

export interface ProtocolAdapter {
  readonly protocol: Protocol;
  buildRequest(request: ModelRequest): BuiltRequest;
  parseResponse(body: unknown): string;
  buildModelListRequest(connection: Connection): BuiltRequest;
  parseModelList(body: unknown): string[];
}

export function protocolFor(protocol: Protocol): ProtocolAdapter {
  return ADAPTERS[protocol];
}

/**
 * Joins a path onto a Connection's base URL and nothing else. Every request URL
 * is derived from `connection.baseUrl`, so the Transport can assert that a
 * request never leaves the configured Connection's origin.
 */
export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

/** Auth placement per Protocol, plus the Writer's extra headers. */
function headersFor(connection: Connection): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  switch (connection.protocol) {
    case "openai-shaped":
      if (connection.apiKey !== "") headers.Authorization = `Bearer ${connection.apiKey}`;
      break;
    case "anthropic-shaped":
      if (connection.apiKey !== "") headers["x-api-key"] = connection.apiKey;
      break;
    case "gemini-native":
      if (connection.apiKey !== "") headers["x-goog-api-key"] = connection.apiKey;
      break;
  }
  const merged = { ...headers, ...connection.extraHeaders };
  // Anthropic's version and browser-access headers are required; the adapter
  // owns them so a stale record cannot drop them.
  if (connection.protocol === "anthropic-shaped") {
    Object.assign(merged, ANTHROPIC_REQUIRED_HEADERS);
  }
  return merged;
}

const openAIAdapter: ProtocolAdapter = {
  protocol: "openai-shaped",
  buildRequest(request) {
    const messages: Array<{ role: string; content: string }> = [];
    // The system prompt is a leading message with role "system".
    if (request.system !== undefined && request.system !== "") {
      messages.push({ role: "system", content: request.system });
    }
    messages.push(...request.messages);

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      // `max_tokens` is accepted by OpenAI (deprecated but supported),
      // OpenRouter, and Ollama's OpenAI-compatible surface, which is what a
      // shared OpenAI-shaped adapter needs.
      max_tokens: request.maxOutputTokens,
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.jsonSchema !== undefined) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "obelus", strict: true, schema: request.jsonSchema },
      };
    }

    return {
      url: joinUrl(request.connection.baseUrl, "/chat/completions"),
      init: {
        method: "POST",
        headers: headersFor(request.connection),
        body: JSON.stringify(body),
      },
    };
  },
  parseResponse(body) {
    const message = choicesMessage(body);
    if (message === null || typeof message.content !== "string") {
      throw new Error("The Provider returned no text in choices[0].message.content.");
    }
    return message.content;
  },
  buildModelListRequest(connection) {
    return {
      url: joinUrl(connection.baseUrl, "/models"),
      init: { method: "GET", headers: headersFor(connection) },
    };
  },
  parseModelList(body) {
    return idsFrom(body, "data");
  },
};

const anthropicAdapter: ProtocolAdapter = {
  protocol: "anthropic-shaped",
  buildRequest() {
    throw new Error(
      "The anthropic-shaped Protocol adapter arrives with ticket #17 (Anthropic and Gemini " +
        "Protocols). Until then, configure an OpenAI-shaped Connection to run model Passes.",
    );
  },
  parseResponse() {
    throw new Error(
      "The anthropic-shaped Protocol adapter arrives with ticket #17 (Anthropic and Gemini " +
        "Protocols).",
    );
  },
  buildModelListRequest(connection) {
    return {
      url: joinUrl(connection.baseUrl, "/models"),
      init: { method: "GET", headers: headersFor(connection) },
    };
  },
  parseModelList(body) {
    return idsFrom(body, "data");
  },
};

const geminiAdapter: ProtocolAdapter = {
  protocol: "gemini-native",
  buildRequest() {
    throw new Error(
      "The gemini-native Protocol adapter arrives with ticket #17 (Anthropic and Gemini " +
        "Protocols). Until then, configure an OpenAI-shaped Connection to run model Passes.",
    );
  },
  parseResponse() {
    throw new Error(
      "The gemini-native Protocol adapter arrives with ticket #17 (Anthropic and Gemini " +
        "Protocols).",
    );
  },
  buildModelListRequest(connection) {
    return {
      url: joinUrl(connection.baseUrl, "/models"),
      init: { method: "GET", headers: headersFor(connection) },
    };
  },
  parseModelList(body) {
    const models = recordAt(body, "models");
    if (models === null) return [];
    return models
      .map((entry) => (isRecord(entry) && typeof entry.name === "string" ? entry.name : ""))
      .filter((name) => name !== "")
      .map((name) => (name.startsWith("models/") ? name.slice("models/".length) : name));
  },
};

const ADAPTERS: Record<Protocol, ProtocolAdapter> = {
  "openai-shaped": openAIAdapter,
  "anthropic-shaped": anthropicAdapter,
  "gemini-native": geminiAdapter,
};

/** The `choices[0].message` object from an OpenAI-shaped response. */
function choicesMessage(body: unknown): Record<string, unknown> | null {
  const choices = recordAt(body, "choices");
  if (choices === null || choices.length === 0) return null;
  const first = choices[0];
  if (!isRecord(first)) return null;
  return isRecord(first.message) ? first.message : null;
}

/** Model ids from an OpenAI/Anthropic-shaped `{ data: [{ id }] }` body. */
function idsFrom(body: unknown, key: string): string[] {
  const entries = recordAt(body, key);
  if (entries === null) return [];
  return entries
    .map((entry) => (isRecord(entry) && typeof entry.id === "string" ? entry.id : ""))
    .filter((id) => id !== "");
}

function recordAt(body: unknown, key: string): unknown[] | null {
  if (!isRecord(body)) return null;
  const value = body[key];
  return Array.isArray(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
