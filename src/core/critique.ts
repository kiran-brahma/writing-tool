import type { Connection } from "../wire/connection";
import type { ModelRequest, ModelUsage } from "../wire/modelRequest";
import type { Transport } from "../wire/transport";
import { resolveAnchor } from "./anchor";
import { DEFAULT_CHARACTER_LIMIT } from "./chunking";
import { chunkedResults } from "./chunkedRun";
import { applyContainment } from "./containment";
import type { Finding, Violation } from "./finding";
import { FINDINGS_SCHEMA } from "./findingsSchema";
import { buildPassRequest, provenanceFor } from "./modelCall";
import { hashPass, type Pass } from "./pass";
import { parseFindings, UnsupportedOutputShapeError } from "./parseFindings";
import { fillPrompt, promptValues } from "./prompt";
import type { Target } from "./target";
import { isInsideVoiceList, voiceListIntervals } from "./voiceList";

/** The Target shape is part of the entry point's contract; export it here too. */
export type { Target } from "./target";

export interface RunConfig {
  /** The single seam. Everything a model Run does leaves through this. */
  transport: Transport;
  /** Story 77: the screening frame is settable and applies to critic Passes. */
  screeningFrame: boolean;
  /**
   * Story 151: the Writer's Voice list, sent to a Findings pass so it does not
   * report the words the Writer has declared theirs. Omitted or empty, no clause
   * is attached.
   */
  voiceList?: string[];
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
  /**
   * Story 54: the Run's cancellation signal, threaded to the Transport and on
   * to `fetch`. An aborted Run stores nothing and reports as cancelled.
   */
  signal?: AbortSignal;
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
  /**
   * Story 52: the Provider's token usage when it reported any, so the session
   * total can use the real count instead of the estimate.
   */
  usage?: ModelUsage;
}

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
  /** Story 53: true when the Run was served from the cache and cost nothing. */
  fromCache: boolean;
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
  const results = await chunkedResults(target, limit, pass, "Run", (chunk) =>
    critiqueOnce(chunk, pass, connection, config),
  );
  if (results.length === 1) return results[0];
  return mergeChunks(results, target.canonical);
}

/** One model call: the body of `critique` before chunking existed. */
async function critiqueOnce(
  target: Target,
  pass: Pass,
  connection: Connection,
  config: RunConfig,
): Promise<RunResult> {
  const prompt = fillPrompt(pass.prompt ?? "", promptValues(target));
  const voiceList = config.voiceList ?? [];
  const built = buildPassRequest({
    pass,
    connection,
    prompt,
    schema: FINDINGS_SCHEMA,
    screeningFrame: config.screeningFrame,
    voiceList,
    ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
  });
  let reportedUsage: ModelUsage | undefined;
  // The signal and the usage callback travel with the request, so the seam's
  // `send(ModelRequest) -> Promise<string>` contract is unchanged.
  const request: ModelRequest = {
    ...built,
    ...(config.signal === undefined ? {} : { signal: config.signal }),
    onUsage: (usage) => {
      reportedUsage = usage;
    },
  };

  const rawResponse = await config.transport.send(request);
  const parsed = parseFindings(rawResponse, pass.output);
  const contained = applyContainment(parsed.findings, target.canonical, target.interval);

  const now = config.now ?? Date.now();
  const promptHash = hashPass(pass);
  // Story 152: a model Finding that still duplicates a Voice-list entry is
  // annotated, never hidden, so a model that ignored the list stays visible. The
  // check uses the interval Containment resolved, not the model's offset hint.
  const voiceEntries = voiceListIntervals(target.canonical, voiceList);
  const findings: Finding[] = contained.kept.map(({ draft, interval }) => ({
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
    provenance: provenanceFor(connection, config.revisionId, now),
    ...(draft.violations.length === 0 ? {} : { violations: draft.violations }),
    ...(isInsideVoiceList(interval, voiceEntries) ? { inVoiceList: true as const } : {}),
  }));

  return {
    findings,
    violations: parsed.violations,
    droppedAnchors: contained.dropped,
    rawResponse,
    // The Run cache is #16's; the storage boundary fills `fromCache`.
    fromCache: false,
    chunks: 1,
    ...(reportedUsage === undefined ? {} : { usage: reportedUsage }),
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
    ...sumUsage(results),
  };
}

/** The summed usage across chunks, or nothing when no chunk reported any. */
function sumUsage(results: RunResult[]): { usage?: ModelUsage } {
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  for (const result of results) {
    if (result.usage?.inputTokens !== undefined) {
      inputTokens = (inputTokens ?? 0) + result.usage.inputTokens;
    }
    if (result.usage?.outputTokens !== undefined) {
      outputTokens = (outputTokens ?? 0) + result.usage.outputTokens;
    }
  }
  if (inputTokens === undefined && outputTokens === undefined) return {};
  return {
    usage: {
      ...(inputTokens === undefined ? {} : { inputTokens }),
      ...(outputTokens === undefined ? {} : { outputTokens }),
    },
  };
}
