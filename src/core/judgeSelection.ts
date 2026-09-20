import { resolveAnchor } from "./anchor";
import type { AnchorDraft, Interval } from "./finding";

/**
 * A comparison is the unit the Writer is actually working on: a selected span
 * or a heading-delimited Section. The selection is made in the current
 * Document, then projected onto both Revisions being compared by the same
 * diff-projection that re-locates an Anchor — a separate fuzzy alignment would
 * be a second way to locate prose, and the two could disagree.
 */

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
