import { ANTHROPIC_REQUIRED_HEADERS, type Connection, type Protocol } from "./connection";
import type { ModelRequest } from "./modelRequest";

/**
 * The Protocol table. This is the only place that knows a wire format, and it
 * is what keeps the rest of the app ignorant of which Provider is in use.
 *
 * All three Protocols are implemented here: `openai-shaped`, `anthropic-shaped`
 * and `gemini-native`. Each adapter owns its endpoint path, auth placement,
 * system-prompt placement, request body field names, structured-output
 * translation and response text extraction, so the same ModelRequest serves
 * every Provider unchanged.
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
    const system = systemPrompt(request);
    if (system !== null) messages.push({ role: "system", content: system });
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
    return requireText(openAIText(body), "choices[0].message.content");
  },
  buildModelListRequest: modelsRequest,
  parseModelList(body) {
    return idsFrom(body, "data");
  },
};

const anthropicAdapter: ProtocolAdapter = {
  protocol: "anthropic-shaped",
  buildRequest(request) {
    const body: Record<string, unknown> = {
      model: request.model,
      // Anthropic requires `max_tokens`; there is no default.
      max_tokens: request.maxOutputTokens,
      messages: request.messages,
    };
    // The system prompt is a top-level field, not a message: the Messages API
    // has no `system` role.
    const system = systemPrompt(request);
    if (system !== null) body.system = system;
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.jsonSchema !== undefined) {
      // `output_config.format` takes the schema directly; there is no `name`
      // and no `strict` here, unlike the OpenAI-shaped `response_format`.
      body.output_config = {
        format: { type: "json_schema", schema: request.jsonSchema },
      };
    }

    return {
      url: joinUrl(request.connection.baseUrl, "/messages"),
      init: {
        method: "POST",
        headers: headersFor(request.connection),
        body: JSON.stringify(body),
      },
    };
  },
  parseResponse(body) {
    return requireText(anthropicText(body), "content[].text");
  },
  buildModelListRequest: modelsRequest,
  parseModelList(body) {
    return idsFrom(body, "data");
  },
};

const geminiAdapter: ProtocolAdapter = {
  protocol: "gemini-native",
  buildRequest(request) {
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: request.maxOutputTokens,
    };
    if (request.temperature !== undefined) generationConfig.temperature = request.temperature;
    if (request.jsonSchema !== undefined) {
      // Gemini's native surface takes the schema as `responseJsonSchema` and
      // requires `responseMimeType` alongside it.
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseJsonSchema = request.jsonSchema;
    }

    const body: Record<string, unknown> = {
      // Gemini calls the assistant turn "model".
      contents: request.messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      generationConfig,
    };
    // The system prompt is a top-level `systemInstruction`, not a turn.
    const system = systemPrompt(request);
    if (system !== null) {
      body.systemInstruction = { parts: [{ text: system }] };
    }

    return {
      url: joinUrl(
        request.connection.baseUrl,
        `/models/${geminiModelId(request.model)}:generateContent`,
      ),
      init: {
        method: "POST",
        headers: headersFor(request.connection),
        body: JSON.stringify(body),
      },
    };
  },
  parseResponse(body) {
    return requireText(geminiText(body), "candidates[0].content.parts[].text");
  },
  buildModelListRequest: modelsRequest,
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

/** The system prompt, or null when there is none to send. */
function systemPrompt(request: ModelRequest): string | null {
  return request.system !== undefined && request.system !== "" ? request.system : null;
}

/** Every Protocol lists models with the same keyed GET of `/models`. */
function modelsRequest(connection: Connection): BuiltRequest {
  return {
    url: joinUrl(connection.baseUrl, "/models"),
    init: { method: "GET", headers: headersFor(connection) },
  };
}

/**
 * Turn a Protocol's possibly-absent text into the seam's string, naming where
 * the text was expected when it is missing.
 */
function requireText(text: string | null, where: string): string {
  if (text === null) throw new Error(`The Provider returned no text in ${where}.`);
  return text;
}

/** The `choices[0].message.content` string from an OpenAI-shaped response. */
function openAIText(body: unknown): string | null {
  const message = choicesMessage(body);
  return message !== null && typeof message.content === "string" ? message.content : null;
}

/** The `choices[0].message` object from an OpenAI-shaped response. */
function choicesMessage(body: unknown): Record<string, unknown> | null {
  const choices = recordAt(body, "choices");
  if (choices === null || choices.length === 0) return null;
  const first = choices[0];
  if (!isRecord(first)) return null;
  return isRecord(first.message) ? first.message : null;
}

/**
 * Concatenated text blocks from an Anthropic-shaped `content` array. Thinking
 * and tool-use blocks carry no prose to analyze and are skipped.
 */
function anthropicText(body: unknown): string | null {
  const content = recordAt(body, "content");
  if (content === null) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") continue;
    parts.push(block.text);
  }
  return parts.length > 0 ? parts.join("") : null;
}

/**
 * Concatenated text parts from a Gemini-shaped response. Thought parts are
 * skipped so reasoning never leaks into the returned prose.
 */
function geminiText(body: unknown): string | null {
  const candidates = recordAt(body, "candidates");
  if (candidates === null || candidates.length === 0) return null;
  const first = candidates[0];
  if (!isRecord(first) || !isRecord(first.content)) return null;
  const parts = first.content.parts;
  if (!Array.isArray(parts)) return null;
  const texts: string[] = [];
  for (const part of parts) {
    if (!isRecord(part) || part.thought === true) continue;
    if (typeof part.text === "string") texts.push(part.text);
  }
  return texts.length > 0 ? texts.join("") : null;
}

/**
 * The model id as a single URL path segment. `models/` is stripped and the
 * rest percent-encoded, so the free-text model field cannot put a slash into
 * the path and escape the Connection's base URL.
 */
function geminiModelId(model: string): string {
  return encodeURIComponent(model.replace(/^models\//, ""));
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
