import type { JudgeSide, JudgeVerdict } from "./judge";

/**
 * Judge calibration: before a Judge run the Writer may record which of the two
 * passages they believe is clearer. The prediction exists for one reason — to
 * be shown beside the Verdict afterwards, so the Writer can see whether their
 * own judgment agrees with the Judge's.
 *
 * It is the Writer's own judgment and nothing else. It is held in memory for
 * the session only, never persisted, never sent to a model, and never a gate:
 * the Judge runs whether or not a prediction was recorded.
 */

/**
 * One recorded prediction. It carries the two passages it was made about, so a
 * Verdict for a different pair is never shown beside a prediction that does not
 * apply to it.
 */
export interface JudgePrediction {
  /** The `before` passage the prediction was recorded against. */
  before: string;
  /** The `after` passage the prediction was recorded against. */
  after: string;
  /** The version the Writer believes is clearer. */
  side: JudgeSide;
}

/**
 * The only home a prediction has. A module-level value means a reload empties
 * it by construction: nothing here writes to storage, so "session-only" cannot
 * be forgotten by a caller. This mirrors the session key store, and is the
 * shape the ticket's reload test exercises.
 */
let prediction: JudgePrediction | null = null;

/** Subscribers, so a view can render the current prediction without polling. */
const listeners = new Set<() => void>();

/** Records the Writer's prediction, replacing any previous one. */
export function setPrediction(next: JudgePrediction): void {
  prediction = next;
  emit();
}

/** The prediction recorded this session, or null. */
export function getPrediction(): JudgePrediction | null {
  return prediction;
}

/** Forgets the prediction, e.g. when the Writer changes their mind. */
export function clearPrediction(): void {
  if (prediction === null) return;
  prediction = null;
  emit();
}

/** Exposed for tests: a reload empties the session store. */
export function clearAllPredictions(): void {
  clearPrediction();
}

/** Subscribe to prediction changes; returns the unsubscribe. */
export function subscribePrediction(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * The prediction measured against the Judge's answer, for display beside the
 * Verdict. `null` means there is nothing to compare: either the Writer recorded
 * no prediction, or the Verdict is for a different pair (handled by the caller
 * keying on the passages). `unstable` is the Judge's disagreement with itself,
 * where there is no preference to agree or disagree with.
 */
export type PredictionAgreement = "agrees" | "disagrees" | "tie" | "unstable";

export function predictionAgreement(
  prediction: JudgePrediction | null,
  verdict: JudgeVerdict | null,
): PredictionAgreement | null {
  if (prediction === null) return null;
  if (verdict === null) return "unstable";
  if (verdict.preference === "tie") return "tie";
  return verdict.preference === prediction.side ? "agrees" : "disagrees";
}
