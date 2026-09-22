import type { Connection } from "./connection";

/**
 * The provider-agnostic request the Transport seam accepts. It carries the
 * Connection rather than a loose protocol/base-URL/key bag, which is what makes
 * "nothing above the seam knows which Provider is in use" true: a test can read
 * the Connection's base URL off every recorded request.
 */
export interface ModelMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Token counts a Provider reported for one call. Both are optional: Protocols
 * and Providers differ in what they return, and a Provider that reports none
 * leaves the Run's session total to fall back to the pre-run estimate.
 */
export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ModelRequest {
  connection: Connection;
  model: string;
  system?: string;
  messages: ModelMessage[];
  maxOutputTokens: number;
  temperature?: number;
  jsonSchema?: object;
  /**
   * How much of `maxOutputTokens` the model may spend thinking before it
   * answers, for the Providers that expose the control (Ollama's
   * OpenAI-compatible surface, OpenAI's reasoning models). A thinking model
   * otherwise spends the whole ceiling on its trace and returns empty or
   * half-finished `content`. It comes from the Writer's Connection and is sent
   * only when set, because OpenAI answers 400 to the field on a model that
   * does not reason.
   */
  reasoningEffort?: string;
  /**
   * Story 54: the Run's cancellation signal. The Transport passes it to `fetch`
   * and stops retrying when it aborts, so a cancelled Run stops costing money.
   */
  signal?: AbortSignal;
  /**
   * Called once by the Transport when the Provider reported token usage. It is
   * a callback rather than a widened return type so the seam's primary contract
   * stays `send(ModelRequest) -> Promise<string>`; Core captures the usage the
   * Run needs for the session total without the string-returning seam changing.
   */
  onUsage?: (usage: ModelUsage) => void;
}
