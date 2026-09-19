import { canonicalTextWithMap } from "./canonicalText";
import type { DocTree } from "./docTree";
import type { EditorRange, Interval } from "./finding";

/**
 * Anchors resolve in Core, never in the Editor. Resolution is quote-first with
 * the stored offset as a hint, never the sole basis: an offset rots on the
 * first keystroke, a quote does not.
 *
 * Diff-projection from `provenance.revisionId` — the common case where the
 * Writer edits *inside* the anchored span — is #5's work; this is the quote
 * fallback and tie-break it builds on. `canonical` is always the canonical
 * string of the Document as it stands now.
 */
export function resolveAnchor(
  anchor: { quote: string; offset: number },
  canonical: string,
): Interval | null {
  const { quote, offset } = anchor;
  if (quote === "") return null;

  const starts: number[] = [];
  let index = canonical.indexOf(quote);
  while (index !== -1) {
    starts.push(index);
    index = canonical.indexOf(quote, index + 1);
  }
  if (starts.length === 0) return null;

  // Prefer the occurrence nearest the offset hint, then the first: a strict
  // comparison keeps the earlier occurrence on a tie.
  let start = starts[0];
  for (const candidate of starts) {
    if (Math.abs(candidate - offset) < Math.abs(start - offset)) start = candidate;
  }
  return { start, end: start + quote.length };
}

/**
 * Converts a resolved canonical interval into an Editor range. The Editor draws
 * the result and knows nothing else; it neither matches quotes nor owns
 * Anchoring.
 *
 * Characters this renderer inserted (Markdown markers, escapes) carry no source
 * position, so the range brackets the source prose the interval covers.
 * Returns `null` when the interval covers no source character.
 */
export function projectInterval(tree: DocTree, interval: Interval): EditorRange | null {
  return projectIntervals(tree, [interval])[0] ?? null;
}

/**
 * Projects many intervals with one walk of the tree, so drawing H Highlights
 * costs one canonical render rather than H of them.
 */
export function projectIntervals(tree: DocTree, intervals: Interval[]): EditorRange[] {
  const { positions } = canonicalTextWithMap(tree);
  const ranges: EditorRange[] = [];
  for (const interval of intervals) {
    const range = projectFromPositions(positions, interval);
    if (range !== null) ranges.push(range);
  }
  return ranges;
}

function projectFromPositions(
  positions: (number | null)[],
  interval: Interval,
): EditorRange | null {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  const end = Math.min(interval.end, positions.length);

  for (let index = Math.max(0, interval.start); index < end; index++) {
    const position = positions[index];
    if (position === null) continue;
    if (position < from) from = position;
    if (position + 1 > to) to = position + 1;
  }

  if (from === Number.POSITIVE_INFINITY) return null;
  return { from, to };
}
