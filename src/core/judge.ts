import type { Connection } from "../wire/connection";
import type { ModelRequest } from "../wire/modelRequest";
import type { Transport } from "../wire/transport";
import { JUDGE_SCHEMA } from "./judgeSchema";
import { extractJson } from "./parseFindings";
import { isRecord } from "./parseJson";

/**
 * The Judge is the mechanism the whole tool is built to protect, so its inputs
 * are a closed list. It receives two passages labelled `A` and `B` and one
 * neutral instruction, and nothing else: no Document, no surrounding context,
 * no prior turns, no Findings, no statement that an edit occurred, no statement
 * about who wrote either passage, no Screening frame and no persona.
 *
 * It answers twice with the labels swapped. A model told that a passage was
 * rewritten prefers the rewrite, so a single answer is worthless for the
 * decision it exists to support. When the two answers disagree the result is
 * reported as Unstable rather than as a preference (ADR-0004). The local label
 * mapping lives in `labelOrder` and is never revealed to the model.
 */

export type JudgeLabel = "A" | "B";
export type JudgePreference = JudgeLabel | "tie";
/** The Writer's two versions, in the order the Writer picked them. */
export type JudgeSide = "before" | "after";

export interface JudgeReason {
  /** An exact quote from one of the two passages. */
  evidence_quote: string;
  explanation: string;
}

/** One call's answer, in the label space the model was given. */
export interface JudgeAnswer {
  preference: JudgePreference;
  confidence: number;
  reasons: JudgeReason[];
  problemsInA: string[];
  problemsInB: string[];
}

/** The Judge's answer mapped back to the Writer's view. */
export interface JudgeVerdict {
  preference: JudgeSide | "tie";
  confidence: number;
  reasons: JudgeReason[];
  problemsInBefore: string[];
  problemsInAfter: string[];
}

export interface JudgeResult {
  first: JudgeAnswer;
  swapped: JudgeAnswer;
  /** False when the two calls disagree: the UI reports Unstable, not a preference. */
  stable: boolean;
  /** `[label for before, label for after]` in the first call; never sent. */
  labelOrder: [JudgeLabel, JudgeLabel];
  /**
   * The Writer's-view Verdict, or `null` when the calls disagree. A null
   * Verdict is the Unstable condition, surfaced by the UI rather than reported
   * as a preference.
   */
  verdict: JudgeVerdict | null;
}

export interface JudgeConfig {
  /** The single seam. Both calls leave through it. */
  transport: Transport;
  /** Injectable for deterministic tests; randomised per call otherwise. */
  labelOrder?: [JudgeLabel, JudgeLabel];
  maxOutputTokens?: number;
}

const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

/**
 * The one neutral instruction. It asks for a comparison and forbids recency,
 * which is the bias ADR-0004 exists to defeat: `Do not assume either is newer
 * or better.` It says nothing about an edit, authorship, a model, or the
 * Document the passages came from.
 */
export const NEUTRAL_INSTRUCTION =
  "Two versions of the same passage. Which is clearer and more effective prose? " +
  "Do not assume either is newer or better.";

/**
 * The two passages, labelled, with the neutral instruction and nothing else.
 * `labelOrder[0]` is the label assigned to the Writer's `before` version, so
 * the caller controls the mapping while the model sees only `A` and `B`.
 */
export function buildJudgePrompt(
  before: string,
  after: string,
  labelOrder: [JudgeLabel, JudgeLabel],
): string {
  const passageA = labelOrder[0] === "A" ? before : after;
  const passageB = labelOrder[0] === "A" ? after : before;
  return `${NEUTRAL_INSTRUCTION}\n\nPassage A:\n${passageA}\n\nPassage B:\n${passageB}`;
}

/**
 * The entry point above the seam: two calls, labels swapped, unmapped back to
 * the Writer's view. `before` and `after` are the two extracted passages; the
 * caller has already shown both to the Writer.
 */
export async function judge(
  before: string,
  after: string,
  connection: Connection,
  config: JudgeConfig,
): Promise<JudgeResult> {
  const labelOrder = config.labelOrder ?? randomLabelOrder();
  const swappedOrder = swapOrder(labelOrder);

  // The two calls share no state, so they run together: two answers, not an
  // order. The labels differ, so neither call can inform the other anyway.
  const [first, swapped] = await Promise.all([
    config.transport
      .send(judgeRequest(before, after, labelOrder, connection, config))
      .then(parseJudgeAnswer),
    config.transport
      .send(judgeRequest(before, after, swappedOrder, connection, config))
      .then(parseJudgeAnswer),
  ]);

  return assembleResult(first, swapped, labelOrder);
}

/** The same label order with the two labels exchanged. */
function swapOrder(order: [JudgeLabel, JudgeLabel]): [JudgeLabel, JudgeLabel] {
  return [order[1], order[0]];
}

/**
 * The label order for one run, randomised per call. The mapping is local: the
 * model receives only the labels, never which version sits behind them.
 */
export function randomLabelOrder(): [JudgeLabel, JudgeLabel] {
  return Math.random() < 0.5 ? ["A", "B"] : ["B", "A"];
}

/**
 * Builds the model request for one call. There is deliberately no `system`:
 * the Screening frame and every persona are Critic-only, so omitting the field
 * is the structural guarantee, not a promise in the prompt.
 */
function judgeRequest(
  before: string,
  after: string,
  labelOrder: [JudgeLabel, JudgeLabel],
  connection: Connection,
  config: JudgeConfig,
): ModelRequest {
  return {
    connection,
    model: connection.model,
    messages: [{ role: "user", content: buildJudgePrompt(before, after, labelOrder) }],
    maxOutputTokens: config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: 0,
    jsonSchema: JUDGE_SCHEMA,
  };
}

/**
 * Unmaps the two label-space answers to the Writer's view. The two calls agree
 * when both point at the same version (or both say `tie`); when they disagree
 * the result is Unstable and there is no Verdict. When stable, the Verdict's
 * confidence is the lower of the two calls, so agreement with an unsure second
 * answer does not read as confidence.
 */
function assembleResult(
  first: JudgeAnswer,
  swapped: JudgeAnswer,
  labelOrder: [JudgeLabel, JudgeLabel],
): JudgeResult {
  const swappedOrder = swapOrder(labelOrder);
  const firstSide = sideFor(first.preference, labelOrder);
  const swappedSide = sideFor(swapped.preference, swappedOrder);
  const stable = firstSide === swappedSide;

  const problems = unmapProblems(first, labelOrder);
  const verdict: JudgeVerdict | null = stable
    ? {
        preference: firstSide,
        confidence: Math.min(first.confidence, swapped.confidence),
        reasons: first.reasons,
        problemsInBefore: problems.before,
        problemsInAfter: problems.after,
      }
    : null;

  return { first, swapped, stable, labelOrder, verdict };
}

/** The Writer's version a preference names under a given label order. */
function sideFor(
  preference: JudgePreference,
  order: [JudgeLabel, JudgeLabel],
): JudgeSide | "tie" {
  if (preference === "tie") return "tie";
  return order[0] === preference ? "before" : "after";
}

/** A label-space answer's problem lists, keyed by the Writer's versions. */
function unmapProblems(
  answer: JudgeAnswer,
  order: [JudgeLabel, JudgeLabel],
): { before: string[]; after: string[] } {
  const beforeIsA = order[0] === "A";
  return {
    before: beforeIsA ? answer.problemsInA : answer.problemsInB,
    after: beforeIsA ? answer.problemsInB : answer.problemsInA,
  };
}

/**
 * Tolerant parsing: extract JSON from surrounding prose, validate, then take
 * what is usable. A Judge that answers in a code fence is otherwise a lost run,
 * so the same tolerant extraction the findings parser uses is used here.
 */
export function parseJudgeAnswer(raw: string): JudgeAnswer {
  const value = extractJson(raw);
  if (!isRecord(value)) throw new Error("The Judge response was not a JSON object.");

  const preference = preferenceOrNull(value.preference);
  if (preference === null) {
    throw new Error("The Judge response did not name a preference of A, B or tie.");
  }

  return {
    preference,
    confidence: clamp01(numberOr(value.confidence, 0.5)),
    reasons: reasonsOf(value.reasons),
    problemsInA: stringList(value.problemsInA),
    problemsInB: stringList(value.problemsInB),
  };
}

/**
 * The same-model warning: a soft warning, never a block. The Judge defaults to
 * a different Connection and model from the Critic, but a Writer may pair them,
 * and the app must say why that weakens independent judgment rather than
 * refusing to run.
 */
export function sameModelWarning(
  critic: Connection | null,
  judge: Connection | null,
): string | null {
  if (critic === null || judge === null) return null;
  const criticModel = critic.model.trim();
  const judgeModel = judge.model.trim();
  const sameModel = criticModel !== "" && criticModel === judgeModel;
  if (critic.id !== judge.id && !sameModel) return null;

  const named = criticModel === "" ? critic.name : criticModel;
  return (
    `The Critic and the Judge both use "${named}", so the Judge may not be independent. ` +
    `This is a warning, not a block; assign a different Connection to the Judge Slot for ` +
    `an independent verdict.`
  );
}

function preferenceOrNull(value: unknown): JudgePreference | null {
  if (typeof value !== "string") return null;
  const lowered = value.trim().toLowerCase();
  if (lowered === "a") return "A";
  if (lowered === "b") return "B";
  if (lowered === "tie") return "tie";
  return null;
}

/**
 * The reasons the model returned. A reason with no quote is kept with an empty
 * quote rather than dropped: the Writer can still read the explanation, and the
 * display shows that the evidence was missing.
 */
function reasonsOf(value: unknown): JudgeReason[] {
  if (!Array.isArray(value)) return [];
  const reasons: JudgeReason[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const explanation = entry.trim();
      if (explanation !== "") reasons.push({ evidence_quote: "", explanation });
      continue;
    }
    if (!isRecord(entry)) continue;
    const explanation = stringOrEmpty(entry.explanation);
    const quote = stringOrEmpty(entry.evidence_quote);
    if (explanation === "" && quote === "") continue;
    reasons.push({ evidence_quote: quote, explanation });
  }
  return reasons;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
