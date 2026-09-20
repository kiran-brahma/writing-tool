import { diffWords } from "diff";

/**
 * A word-level diff between two Revisions, for the Writer to see what changed.
 * It is display only: a diff shows the two versions side by side, it never
 * offers to carry one into the other. The Judge compares the extracted
 * passages; this is how the Writer finds the passage worth comparing.
 */

export type WordDiffKind = "same" | "added" | "removed";

export interface WordDiffSegment {
  kind: WordDiffKind;
  value: string;
}

/** The word-level diff from `before` to `after`, in document order. */
export function wordDiff(before: string, after: string): WordDiffSegment[] {
  return diffWords(before, after).map((change) => ({
    kind: change.added ? "added" : change.removed ? "removed" : "same",
    value: change.value,
  }));
}
