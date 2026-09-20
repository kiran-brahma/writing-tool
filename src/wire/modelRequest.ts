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

export interface ModelRequest {
  connection: Connection;
  model: string;
  system?: string;
  messages: ModelMessage[];
  maxOutputTokens: number;
  temperature?: number;
  jsonSchema?: object;
}
