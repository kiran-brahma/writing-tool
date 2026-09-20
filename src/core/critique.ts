import type { Connection } from "../wire/connection";
import type { ModelRequest } from "../wire/modelRequest";
import type { Transport } from "../wire/transport";
import { applyContainment } from "./containment";
import type { Finding, Interval, Violation } from "./finding";
import { FINDINGS_SCHEMA } from "./findingsSchema";
import { hashPass, type Pass } from "./pass";
import { parseFindings, UnsupportedOutputShapeError } from "./parseFindings";
import { fillPrompt, type PromptValues } from "./prompt";
import { SCREENING_FRAME } from "./screeningFrame";

/**
 * The Target a Run is asked about: the Paragraph's canonical text and its
 * half-open interval in the whole Document's canonical string, plus the context
 * a local Pass is allowed to see. The canonical string is the one coordinate
 * system, so Containment measures the model's Anchors against the same string
 * every other feature uses.
 */
export interface Target {
  /** The whole Document's canonical string. */
  canonical: string;
  /** The Target's half-open interval within `canonical`. */
  interval: Interval;
  /** The Target Paragraph's canonical source. */
  text: string;
  title: string;
  outline: string;
  contextAbove: string;
  contextBelow: string;
}

export interface RunConfig {
  /** The single seam. Everything a model Run does leaves through this. */
  transport: Transport;
  /** Story 77: the screening frame is settable and applies to critic Passes. */
  screeningFrame: boolean;
  /** The Revision current when the Run was triggered. */
  revisionId: string;
  now?: number;
  maxOutputTokens?: number;
}

/** The spec's RunResult. `violations` are surfaced, never silently removed. */
export interface RunResult {
  findings: Finding[];
  violations: Violation[];
  droppedAnchors: number;
  rawResponse: string;
  fromCache: boolean;
}

export const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

/**
 * The entry point above the seam: one model Pass end to end. It builds the
 * prompt from the Target and context, sends it through `send`, parses the
 * response tolerantly, anchors the Findings and applies Containment, and
 * records the `promptHash` on every Finding so a cache can never return
 * Findings the current Pass would not have produced.
 *
 * The `{{document}}` placeholder is empty for a paragraph-scope Pass: the rule
 * that local Passes never receive body text is enforced here, not in the
 * prompt. A non-`findings` output shape is not implemented yet and raises.
 */
export async function critique(
  target: Target,
  pass: Pass,
  connection: Connection,
  config: RunConfig,
): Promise<RunResult> {
  if (pass.kind !== "model") {
    throw new Error(`Pass "${pass.id}" is a rule Pass; a model Run cannot run it.`);
  }
  // Only the findings output shape is implemented; refuse before spending a
  // request rather than sending and then throwing away the response.
  if (pass.output !== "findings") throw new UnsupportedOutputShapeError(pass.output);

  const prompt = fillPrompt(pass.prompt ?? "", valuesFor(target, pass));
  const request: ModelRequest = {
    connection,
    model: connection.model,
    messages: [{ role: "user", content: prompt }],
    maxOutputTokens: config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: 0,
    jsonSchema: FINDINGS_SCHEMA,
    ...(config.screeningFrame && pass.slot === "critic" ? { system: SCREENING_FRAME } : {}),
  };

  const rawResponse = await config.transport.send(request);
  const parsed = parseFindings(rawResponse, pass.output);
  const contained = applyContainment(parsed.findings, target.canonical, target.interval);

  const now = config.now ?? Date.now();
  const promptHash = hashPass(pass);
  const findings: Finding[] = contained.kept.map(({ draft, interval: _interval }) => ({
    id: crypto.randomUUID(),
    passId: pass.id,
    promptHash,
    // Containment kept it, so it resolved inside the Target: `attached` is
    // computed from resolution, never authored.
    anchor: { quote: draft.quote, offset: draft.offset, state: "attached" },
    issue: draft.issue,
    diagnosis: draft.diagnosis,
    ...(draft.pattern === undefined ? {} : { pattern: draft.pattern }),
    status: "open",
    provenance: {
      providerId: connection.id,
      model: connection.model,
      at: now,
      revisionId: config.revisionId,
    },
  }));

  return {
    findings,
    violations: parsed.violations,
    droppedAnchors: contained.dropped,
    rawResponse,
    // The Run cache is #16's; a Run is never a cache hit yet.
    fromCache: false,
  };
}

/** The placeholder values a Pass's scope permits. */
function valuesFor(target: Target, pass: Pass): PromptValues {
  const documentScope = pass.scope !== "paragraph";
  return {
    title: target.title,
    outline: target.outline,
    target: documentScope ? target.canonical : target.text,
    context_above: target.contextAbove,
    context_below: target.contextBelow,
    // Local Passes receive headings only, never body text.
    document: documentScope ? target.canonical : "",
  };
}
