import type { Connection } from "../wire/connection";
import type { ModelRequest } from "../wire/modelRequest";
import type { Provenance } from "./finding";
import { isFindingsPass, passAcceptsFrame, type Pass } from "./pass";
import { SCREENING_FRAME } from "./screeningFrame";
import { voiceListClause } from "./voiceList";

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
  /**
   * Story 151: the Writer's Voice list. A Findings pass is told not to report
   * these words; the Reader and the Audit are not, because the Voice list is
   * about the copyedit queue and their output is not a Finding.
   */
  voiceList?: string[];
  maxOutputTokens?: number;
}

/**
 * The provider-agnostic request for one Pass call. The Screening frame and the
 * Voice list are the Critic's and are applied here, so a new output shape cannot
 * forget them or apply them to a Pass that does not take them. The two share one
 * system message when both are present, so a Provider sees a single standing
 * instruction rather than several.
 */
export function buildPassRequest(options: PassRequestOptions): ModelRequest {
  const { pass, connection, prompt, schema, screeningFrame, voiceList, maxOutputTokens } = options;
  const system: string[] = [];
  if (screeningFrame && pass.slot === "critic" && passAcceptsFrame(pass)) {
    system.push(SCREENING_FRAME);
  }
  if (isFindingsPass(pass) && voiceList !== undefined && voiceList.length > 0) {
    system.push(voiceListClause(voiceList));
  }
  return {
    connection,
    model: connection.model,
    messages: [{ role: "user", content: prompt }],
    maxOutputTokens: maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: 0,
    jsonSchema: schema,
    ...(system.length === 0 ? {} : { system: system.join("\n\n") }),
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
