/**
 * A Connection is the Writer's configured route to a Provider: a Protocol, a
 * base URL, a key (or none, for local Ollama) and a model. The Protocol decides
 * how the key is placed and where the system prompt goes; nothing above the
 * wire layer needs to know which Provider a Connection points at.
 *
 * The prefilled Connections carry everything except the key and model. The
 * Writer supplies only those two for OpenAI, Anthropic, Gemini and OpenRouter;
 * local Ollama needs no key at all. Custom is the escape hatch: an
 * OpenAI-shaped Connection whose base URL the Writer edits.
 */

export type Protocol = "openai-shaped" | "anthropic-shaped" | "gemini-native";

/**
 * `persisted` keeps the key in IndexedDB in this browser. `session` keeps it in
 * memory only and never writes it, so a reload ends the model Passes that
 * depended on it.
 */
export type KeyMode = "persisted" | "session";

export interface Connection {
  id: string;
  /** A label for the Writer, e.g. "OpenAI" or "My proxy". */
  name: string;
  protocol: Protocol;
  baseUrl: string;
  /** Free text, so a model released today works without an app update. */
  model: string;
  /** Empty for local Ollama, and for a session-mode Connection after a reload. */
  apiKey: string;
  keyMode: KeyMode;
  /** Protocol-level headers the Writer should not have to type. */
  extraHeaders: Record<string, string>;
  /** The per-Connection concurrency cap; the Transport enforces it. */
  concurrency: number;
  /** Prefilled Connections ship with the app and cannot be removed. */
  builtIn: boolean;
}

/** Story 57: no more than a small number of requests in flight per Connection. */
export const DEFAULT_CONCURRENCY = 3;

export interface ConnectionPrefill {
  id: string;
  name: string;
  protocol: Protocol;
  baseUrl: string;
  extraHeaders: Record<string, string>;
}

/**
 * Anthropic's required headers, from the wire notes (2026-09-19). Defined once
 * here so the prefill and the Protocol adapter cannot drift apart.
 */
export const ANTHROPIC_REQUIRED_HEADERS: Record<string, string> = {
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
};

/**
 * The five prefills, with the header facts from the wire notes (verified
 * 2026-09-19). Anthropic's two headers and Gemini's absence of one are the
 * things the Writer would otherwise have to know.
 */
export const CONNECTION_PREFILLS: readonly ConnectionPrefill[] = [
  {
    id: "openai",
    name: "OpenAI",
    protocol: "openai-shaped",
    baseUrl: "https://api.openai.com/v1",
    extraHeaders: {},
  },
  {
    id: "anthropic",
    name: "Anthropic",
    protocol: "anthropic-shaped",
    baseUrl: "https://api.anthropic.com/v1",
    extraHeaders: { ...ANTHROPIC_REQUIRED_HEADERS },
  },
  {
    id: "gemini",
    name: "Gemini",
    protocol: "gemini-native",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    extraHeaders: {},
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    protocol: "openai-shaped",
    baseUrl: "https://openrouter.ai/api/v1",
    extraHeaders: {},
  },
  {
    id: "ollama",
    name: "Ollama (local)",
    protocol: "openai-shaped",
    baseUrl: "http://localhost:11434/v1",
    extraHeaders: {},
  },
];

/** A prefilled Connection with no key and no model yet: the Writer adds both. */
export function connectionFromPrefill(prefill: ConnectionPrefill): Connection {
  return {
    id: prefill.id,
    name: prefill.name,
    protocol: prefill.protocol,
    baseUrl: prefill.baseUrl,
    model: "",
    apiKey: "",
    keyMode: "persisted",
    extraHeaders: { ...prefill.extraHeaders },
    concurrency: DEFAULT_CONCURRENCY,
    builtIn: true,
  };
}

/** Story 7: a Custom Connection whose base URL the Writer edits. */
export function createCustomConnection(id: string): Connection {
  return {
    id,
    name: "Custom",
    protocol: "openai-shaped",
    baseUrl: "http://localhost:8080/v1",
    model: "",
    apiKey: "",
    keyMode: "persisted",
    extraHeaders: {},
    concurrency: DEFAULT_CONCURRENCY,
    builtIn: false,
  };
}
