import type { Connection } from "../wire/connection";
import type { ModelRequest } from "../wire/modelRequest";
import type { Provenance } from "./finding";
import { isFindingsPass, passAcceptsFrame, type Pass } from "./pass";
import { frameText } from "./screeningFrame";
import { voiceListClause } from "./voiceList";

/**
 * The pieces every model Pass builds the same way, so `critique` and
 * `readSection` cannot drift apart in the request they send or the provenance
 * they attach. The Judge is deliberately not a caller: its inputs are a closed
 * list and it carries no Pass, so sharing a builder with it would only imply a
 * similarity the spec denies.
 */

/**
 * The machine-readable shape instruction appended to every pass prompt. Some
 * Providers honour the request's `jsonSchema` and some silently ignore it —
 * Ollama Cloud does not support structured outputs at all — so a model that
 * never sees the schema answers in prose and the Run fails as unreadable JSON.
 * Naming the exact shape in the prompt makes the request self-contained. It is
 * an output-format instruction only: the closed schema still carries no field
 * for rewritten prose, and the parser still tolerates a model that wraps the
 * object in prose.
 */
export function jsonShapeInstruction(schema: object): string {
  return [
    "Reply with only a JSON object matching this JSON Schema exactly.",
    "Do not write prose around it and do not wrap it in a code fence.",
    JSON.stringify(schema),
  ].join("\n");
}

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
    // Story 153: the Pass chooses which reader the Critic writes for; unset
    // means the existing default. The global toggle is the master switch, so
    // turning it off sends no frame at all (story 77).
    system.push(frameText(pass.frame));
  }
  if (isFindingsPass(pass) && voiceList !== undefined && voiceList.length > 0) {
    system.push(voiceListClause(voiceList));
  }
  return {
    connection,
    model: connection.model,
    messages: [{ role: "user", content: `${prompt}\n\n${jsonShapeInstruction(schema)}` }],
    maxOutputTokens: maxOutputTokens ?? connection.maxOutputTokens,
    temperature: 0,
    // Only sent when the Writer's Connection asks for it: OpenAI answers 400
    // to `reasoning_effort` on a model that does not reason, so attaching it
    // to every request would break the Connections that never needed it.
    ...(connection.reasoningEffort === "" ? {} : { reasoningEffort: connection.reasoningEffort }),
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
