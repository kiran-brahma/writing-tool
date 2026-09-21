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
}
