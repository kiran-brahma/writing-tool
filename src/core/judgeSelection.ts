import { resolveAnchor } from "./anchor";
import type { AnchorDraft, Interval } from "./finding";

/**
 * A comparison is the unit the Writer is actually working on: a selected span
 * or a heading-delimited Section. The selection is made in the current
 * Document, then projected onto both Revisions being compared by the same
 * diff-projection that re-locates an Anchor — a separate fuzzy alignment would
 * be a second way to locate prose, and the two could disagree.
 */

/**
 * The Revision fields the default-pair choice needs, so Core does not depend on
 * the Editor's `JudgeRevision` or on storage records.
 */
export interface JudgePairRevision {
  id: string;
  flagged: boolean;
}

/** The two Revision ids the Judge opens on; `null` means that side is unset. */
export interface JudgePair {
  before: string | null;
  after: string | null;
}

/**
 * Stories 171–172: the pair the Judge offers before the Writer picks one.
 *
 * `revisions` is newest-first, so the first element is "now". The pair is the
 * Writer's most recent flagged Revision against now — a milestone is the rewrite
 * worth judging — and, with none flagged, the oldest Revision against now, which
 * is still a real comparison. A Revision is never paired with itself: when the
 * flagged Revision *is* now, the choice falls back to the flagged Revision
 * before it, then to the oldest. Fewer than two Revisions means no before, so
 * the panel shows a single side rather than a pair.
 */
export function defaultJudgePair(revisions: JudgePairRevision[]): JudgePair {
  const now = revisions[0];
  if (now === undefined) return { before: null, after: null };
  if (revisions.length < 2) return { before: null, after: now.id };

  const flagged = revisions.find(
    (revision) => revision.flagged && revision.id !== now.id,
  );
  const before = flagged ?? revisions[revisions.length - 1];
  return { before: before.id, after: now.id };
}

/** The selection as an Anchor: the quote, with its current offset as a hint. */
export function selectionAnchor(canonical: string, interval: Interval): AnchorDraft | null {
  const quote = canonical.slice(interval.start, interval.end);
  if (quote === "") return null;
  return { quote, offset: interval.start };
}

/**
 * Projects a selection from one canonical string onto another through the same
 * diff-projection `resolveAnchor` uses. `fromCanonical` is where the selection
 * was made (the current Document); `toCanonical` is a Revision being compared.
 * `null` means the selection could not be located there, so the passages cannot
 * be shown and nothing is sent.
 */
export function projectSelection(
  anchor: AnchorDraft,
  fromCanonical: string,
  toCanonical: string,
): Interval | null {
  if (anchor.quote === "") return null;
  // `resolveAnchor` names the first argument's string the "current" string and
  // the second its provenance; here the selection is known in `fromCanonical`
  // and wanted in `toCanonical`.
  return resolveAnchor(anchor, toCanonical, fromCanonical);
}

/** The text a projected interval covers in a Revision's canonical string. */
export function passageText(canonical: string, interval: Interval): string {
  return canonical.slice(interval.start, interval.end);
}

/** The two passages a comparison will send, each extracted from its Revision. */
export interface ExtractedPassages {
  before: string | null;
  after: string | null;
}

/**
 * Extracts the Writer's selection from both Revisions at once, so both passages
 * are produced — and shown — before either Judge call is made. `null` on a side
 * means the selection could not be located in that Revision, so the comparison
 * cannot run and nothing is sent.
 */
export function extractPassages(
  anchor: AnchorDraft | null,
  currentCanonical: string,
  beforeCanonical: string,
  afterCanonical: string,
): ExtractedPassages {
  if (anchor === null) return { before: null, after: null };
  const before = projectSelection(anchor, currentCanonical, beforeCanonical);
  const after = projectSelection(anchor, currentCanonical, afterCanonical);
  return {
    before: before === null ? null : passageText(beforeCanonical, before),
    after: after === null ? null : passageText(afterCanonical, after),
  };
}
