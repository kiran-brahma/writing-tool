import { resolveAnchor } from "./anchor";
import type { AnchorDraft, Interval } from "./finding";

/**
 * Containment, enforced in Core rather than trusted to a prompt. A local Pass
 * is shown context — one Paragraph either side — and a model asked about one
 * Paragraph will happily anchor a Finding in the neighbours. Without this rule,
 * running six passes over one Document produces six copies of one Finding.
 *
 * The count is part of the result, not a hidden side effect: the Writer is told
 * how much the model tried to say about text it was not asked about.
 */
export interface ContainedAnchor<T extends AnchorDraft> {
  draft: T;
  interval: Interval;
}

export interface ContainmentResult<T extends AnchorDraft> {
  kept: ContainedAnchor<T>[];
  dropped: number;
}

/**
 * Keeps only the Anchors that resolve inside the Target interval; everything
 * else — outside the Target, or unresolvable in the current canonical string —
 * is dropped and counted. A parsed draft is fresh: its offset is already in the
 * current canonical string, so containment resolves it by quote match (the
 * two-argument `resolveAnchor`) rather than diff-projecting from a Revision.
 * Re-location of *stored* Findings across edits is `reResolveFindings`.
 *
 * A model is asked for an offset within the Target it was shown, so that hint is
 * first moved into canonical coordinates. Without that, a quote that appears in
 * the context as well would tie-break to the context and a valid Finding would
 * be dropped as out of scope.
 */
export function applyContainment<T extends AnchorDraft>(
  drafts: T[],
  canonical: string,
  target: Interval,
): ContainmentResult<T> {
  const kept: ContainedAnchor<T>[] = [];
  let dropped = 0;

  for (const draft of drafts) {
    const anchored: T = { ...draft, offset: target.start + draft.offset };
    const interval = resolveAnchor(anchored, canonical);
    if (interval === null || !isContained(interval, target)) {
      dropped += 1;
      continue;
    }
    kept.push({ draft: anchored, interval });
  }

  return { kept, dropped };
}

/**
 * Whether a resolved interval sits inside the Target. `applyContainment` keeps
 * only the intervals for which this is true; anything else is dropped and
 * counted.
 */
export function isContained(interval: Interval | null, target: Interval): boolean {
  return interval !== null && interval.start >= target.start && interval.end <= target.end;
}
