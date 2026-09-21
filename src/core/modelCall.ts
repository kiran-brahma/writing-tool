import type { Connection } from "../wire/connection";
import type { ModelRequest } from "../wire/modelRequest";
import type { Provenance } from "./finding";
import { passAcceptsFrame, type Pass } from "./pass";
import { SCREENING_FRAME } from "./screeningFrame";

/**
 * The pieces every model Pass builds the same way, so `critique` and
 * `readSection` cannot drift apart in the request they send or the provenance
 * they attach. The Judge is deliberately not a caller: its inputs are a closed
 * list and it carries no Pass, so sharing a builder with it would only imply a
 * similarity the spec denies.
 */

export const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

export interface PassRequestOptions {
  pass: Pass;
  connection: Connection;
  /** The already-filled prompt, from the Pass and its Target. */
  prompt: string;
  /** The JSON Schema for this output shape. */
  schema: object;
  screeningFrame: boolean;
  maxOutputTokens?: number;
}

/**
 * The provider-agnostic request for one Pass call. The Screening frame is the
 * Critic's and is applied here, so a new output shape cannot forget it or apply
 * it to a Pass that is not a Critic.
 */
export function buildPassRequest(options: PassRequestOptions): ModelRequest {
  const { pass, connection, prompt, schema, screeningFrame, maxOutputTokens } = options;
  return {
    connection,
    model: connection.model,
    messages: [{ role: "user", content: prompt }],
    maxOutputTokens: maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: 0,
    jsonSchema: schema,
    ...(screeningFrame && pass.slot === "critic" && passAcceptsFrame(pass)
      ? { system: SCREENING_FRAME }
      : {}),
  };
}

/** What produced a Finding or a Reader account: the same shape for both. */
export function provenanceFor(
  connection: Connection,
  revisionId: string,
  at: number,
): Provenance {
  return { providerId: connection.id, model: connection.model, at, revisionId };
}
