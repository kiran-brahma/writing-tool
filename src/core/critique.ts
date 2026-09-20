import type { Connection } from "../wire/connection";
import type { ModelRequest } from "../wire/modelRequest";
import type { Transport } from "../wire/transport";
import { describeError } from "../errors";
import { resolveAnchor } from "./anchor";
import { chunkTarget, DEFAULT_CHARACTER_LIMIT } from "./chunking";
import { applyContainment } from "./containment";
import type { Finding, Violation } from "./finding";
import { FINDINGS_SCHEMA } from "./findingsSchema";
import { hashPass, type Pass } from "./pass";
import { parseFindings, UnsupportedOutputShapeError } from "./parseFindings";
import { fillPrompt, type PromptValues } from "./prompt";
import { SCREENING_FRAME } from "./screeningFrame";
import type { Target } from "./target";

/** The Target shape is part of the entry point's contract; export it here too. */
export type { Target } from "./target";

export interface RunConfig {
  /** The single seam. Everything a model Run does leaves through this. */
  transport: Transport;
  /** Story 77: the screening frame is settable and applies to critic Passes. */
  screeningFrame: boolean;
  /** The Revision current when the Run was triggered. */
  revisionId: string;
  now?: number;
  maxOutputTokens?: number;
  /**
   * Story 50: above this many characters a document-scope Run is chunked
   * Section by Section rather than sent as one call. Defaults to
   * `DEFAULT_CHARACTER_LIMIT`; the setting lets the Writer raise or lower it.
   */
  characterLimit?: number;
}

/** The spec's RunResult. `violations` are surfaced, never silently removed. */
export interface RunResult {
  findings: Finding[];
  violations: Violation[];
  droppedAnchors: number;
  rawResponse: string;
  fromCache: boolean;
  /**
   * Story 50: how many model calls the Run made. `1` for a Document that fit in
   * a single call; more when the Run was chunked Section by Section.
   */
  chunks: number;
}

const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

/**
 * What the most recent Run reported for one Pass: its Containment count and the
 * linter's aggregate drift, which the panel surfaces rather than a caller
 * rebuilding the shape.
 */
export interface RunReport {
  passId: string;
  droppedAnchors: number;
  violations: Violation[];
  /** Story 50: how many calls the Run made; more than one means it was chunked. */
  chunks: number;
}

/**
 * The entry point above the seam: one model Pass end to end. It builds the
 * prompt from the Target and context, sends it through `send`, parses the
 * response tolerantly, anchors the Findings and applies Containment, and
 * records the `promptHash` on every Finding so a cache can never return
 * Findings the current Pass would not have produced.
 *
 * The `{{document}}` placeholder comes from the Target (`target.documentText`),
 * which the scope resolver fills: empty for a local Pass, the whole Document for
 * a structural one (or one chunk of it when the Run is chunked). A
 * non-`findings` output shape is not implemented yet and raises.
 *
 * Story 50: a document-scope Target longer than the character limit is split
 * Section by Section with overlap and sent as several calls, and the Findings
 * are merged back into one Run. Chunking lives here, above the one seam, so
 * every Run — single call or chunked — is still observed through `critique`.
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

  const limit = config.characterLimit ?? DEFAULT_CHARACTER_LIMIT;
  const targets = chunkTarget(target, limit);

  if (targets.length === 1) return critiqueOnce(targets[0], pass, connection, config);

  const results: RunResult[] = [];
  for (const [index, chunk] of targets.entries()) {
    try {
      results.push(await critiqueOnce(chunk, pass, connection, config));
    } catch (error) {
      // A chunked Run is all-or-nothing, like a single call: the caller stores
      // nothing, so a half-examined Document cannot masquerade as a finished
      // Run. Naming the chunk makes the cost of the retry visible.
      throw new Error(
        `Chunk ${index + 1} of ${targets.length} of the "${pass.name}" Run failed; ` +
          `no Findings were stored. ${describeError(error)}`,
        { cause: error },
      );
    }
  }
  return mergeChunks(results, target.canonical);
}

/** One model call: the body of `critique` before chunking existed. */
async function critiqueOnce(
  target: Target,
  pass: Pass,
  connection: Connection,
  config: RunConfig,
): Promise<RunResult> {
  const prompt = fillPrompt(pass.prompt ?? "", valuesFor(target));
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
    ...(draft.violations.length === 0 ? {} : { violations: draft.violations }),
  }));

  return {
    findings,
    violations: parsed.violations,
    droppedAnchors: contained.dropped,
    rawResponse,
    // The Run cache is #16's; a Run is never a cache hit yet.
    fromCache: false,
    chunks: 1,
  };
}

/**
 * Merges the chunks of one chunked Run back into a single result. Findings are
 * de-duplicated by resolved interval and prose, so a boundary problem the
 * overlap showed to both chunks is reported once while two distinct problems on
 * the same span are both kept. Violations and dropped Anchors are summed, and
 * the raw responses are joined so the raw-response toggle shows everything the
 * Run received.
 */
function mergeChunks(results: RunResult[], canonical: string): RunResult {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    for (const finding of result.findings) {
      const interval = resolveAnchor(finding.anchor, canonical);
      if (interval !== null) {
        // De-duplicate a boundary Finding that the overlap showed to both
        // chunks. The full finding is part of the key so two distinct problems
        // on the same span are both kept, as a single call would keep them.
        const key = `${interval.start}:${interval.end}:${finding.issue}:${finding.diagnosis}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      findings.push(finding);
    }
  }

  return {
    findings,
    violations: results.flatMap((result) => result.violations),
    droppedAnchors: results.reduce((sum, result) => sum + result.droppedAnchors, 0),
    rawResponse: results.map((result) => result.rawResponse).join("\n\n--- chunk ---\n\n"),
    fromCache: false,
    chunks: results.length,
  };
}

/** The placeholder values a Pass's scope permits, all carried on the Target. */
function valuesFor(target: Target): PromptValues {
  return {
    title: target.title,
    outline: target.outline,
    // The Target placeholder is always the text the Run was asked about.
    target: target.text,
    context_above: target.contextAbove,
    context_below: target.contextBelow,
    // The Document text this Target exposes: the whole Document for a
    // structural Target sent in one call, one chunk of it for a chunked Run,
    // empty for a local Target. The Target decides it, not the caller.
    document: target.documentText,
  };
}
