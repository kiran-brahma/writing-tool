import { diffChars, type Change } from "diff";
import { canonicalBlocks, canonicalTextWithMap } from "./canonicalText";
import type { DocTree } from "./docTree";
import {
  isOpenFinding,
  type AnchorDraft,
  type AnchorState,
  type EditorRange,
  type Finding,
  type Interval,
} from "./finding";

/**
 * Anchors resolve in Core, never in the Editor. `resolveAnchor` is the three-step
 * re-location the spec requires, in order:
 *
 * 1. **Diff-projection.** Locate the Anchor in the canonical string of the
 *    Finding's provenance Revision, then project that interval forward through a
 *    character diff onto the current canonical string. This is the common case:
 *    the Writer edits *inside* the anchored span, so the quote no longer exists
 *    verbatim and the Finding must still follow the text.
 * 2. **Quote match.** If projection collapses (the anchored span was deleted),
 *    match the quote exactly against the current string. If it matches more than
 *    once, prefer the occurrence nearest where projection pointed, then the
 *    first.
 * 3. **Orphaned.** If neither holds, the Finding is Orphaned.
 *
 * `null` is the Orphaned condition: a Finding with no interval in the current
 * canonical string. An Orphaned Finding stays `open` and actionable; it simply
 * has no Highlight.
 *
 * When no provenance canonical string is supplied the two arguments are the same
 * string, so projection is the identity and this is exactly a quote match with
 * the offset as the tie-break hint. Fresh Findings use that form; re-resolution
 * passes the provenance Revision's canonical string.
 */
export function resolveAnchor(
  anchor: AnchorDraft,
  currentCanonical: string,
  provenanceCanonical: string = currentCanonical,
): Interval | null {
  return resolveWithEdits(
    anchor,
    currentCanonical,
    provenanceCanonical,
    diffEdits(provenanceCanonical, currentCanonical),
  );
}

/** `resolveAnchor`'s body, with the character diff already computed. */
function resolveWithEdits(
  anchor: AnchorDraft,
  currentCanonical: string,
  provenanceCanonical: string,
  edits: Change[],
): Interval | null {
  const { quote, offset } = anchor;
  if (quote === "") return null;

  // Step 1: diff-projection from the string the model (or rule pass) saw.
  const provenanceInterval = matchQuote(quote, provenanceCanonical, offset);
  if (provenanceInterval !== null) {
    const projected = projectSpan(edits, provenanceInterval);
    if (projected !== null) return projected;
    // The anchored span was deleted, so projection collapsed. Where it used to
    // be is still the best hint for disambiguating a surviving quote.
    return matchQuote(quote, currentCanonical, projectBoundary(edits, provenanceInterval.start));
  }

  // Step 2: exact quote match against the current string. When projection was
  // possible, the occurrence nearest where the anchor used to be wins; when the
  // provenance string never held the quote there is no projected position, so
  // the stored offset is the hint.
  return matchQuote(quote, currentCanonical, offset);
}

/** A resolved Anchor interval, tied to the Finding it belongs to. */
export interface FindingInterval {
  findingId: string;
  interval: Interval;
}

/** The resolved anchors of a Finding set, ready to render. */
export interface FindingResolution {
  findings: Finding[];
  /**
   * Canonical intervals of the open Findings, each tied to its Finding so the
   * Editor can pick out the Current Finding. A Finding that has left the queue
   * is not here, so it draws no Highlight.
   */
  highlights: FindingInterval[];
  /** The Findings whose `anchor.state` changed, for the caller to persist. */
  changed: Finding[];
}

/**
 * Re-resolves every Finding against the current canonical string, using each
 * Finding's provenance Revision as the projection source, and returns the
 * Findings with `anchor.state` recomputed. Pure and DOM-free; the caller
 * persists `changed`. `anchor.state` is computed from resolution, never
 * authored by a model and never set by hand.
 */
export function reResolveFindings(
  findings: Finding[],
  currentCanonical: string,
  provenanceCanonical: (revisionId: string) => string | undefined,
): FindingResolution {
  const resolved: Finding[] = [];
  const changed: Finding[] = [];
  const highlights: FindingInterval[] = [];
  const editsByProvenance = new Map<string, Change[]>();

  for (const finding of findings) {
    const provenance = provenanceCanonical(finding.provenance.revisionId) ?? currentCanonical;
    // Every Finding from one Revision shares a diff; compute it once.
    let edits = editsByProvenance.get(provenance);
    if (edits === undefined) {
      edits = diffEdits(provenance, currentCanonical);
      editsByProvenance.set(provenance, edits);
    }
    const interval = resolveWithEdits(finding.anchor, currentCanonical, provenance, edits);
    const state: AnchorState = interval === null ? "orphaned" : "attached";
    if (finding.anchor.state === state) {
      resolved.push(finding);
    } else {
      const updated = { ...finding, anchor: { ...finding.anchor, state } };
      resolved.push(updated);
      changed.push(updated);
    }
    if (isOpenFinding(finding) && interval !== null) {
      highlights.push({ findingId: finding.id, interval });
    }
  }

  return { findings: resolved, highlights, changed };
}

/**
 * The occurrences of `quote`, choosing the one nearest `preferredOffset` and
 * keeping the earliest on a tie. The offset is a hint, never the sole basis: an
 * offset rots on the first keystroke, a quote does not.
 */
function matchQuote(quote: string, canonical: string, preferredOffset: number): Interval | null {
  const starts: number[] = [];
  let index = canonical.indexOf(quote);
  while (index !== -1) {
    starts.push(index);
    index = canonical.indexOf(quote, index + 1);
  }
  if (starts.length === 0) return null;

  let start = starts[0];
  for (const candidate of starts) {
    if (Math.abs(candidate - preferredOffset) < Math.abs(start - preferredOffset)) start = candidate;
  }
  return { start, end: start + quote.length };
}

/**
 * The character diff between two canonical strings. Identical strings need no
 * diff and one common run, which keeps the fresh-Finding path (provenance equal
 * to current) free of a diff call.
 */
function diffEdits(provenance: string, current: string): Change[] {
  return provenance === current
    ? [{ value: provenance, added: false, removed: false, count: provenance.length }]
    : diffChars(provenance, current);
}

/**
 * Projects an interval from the provenance string onto the current string by
 * mapping both boundaries. A boundary inside removed text maps to the point of
 * deletion, so an inserted run immediately after extends the end of the span but
 * never its start: a rewrite of the anchored text maps to the rewritten span,
 * while a pure deletion collapses to an empty interval and reports failure.
 */
function projectSpan(edits: Change[], interval: Interval): Interval | null {
  const start = projectBoundary(edits, interval.start);
  const end = projectBoundary(edits, interval.end);
  return end > start ? { start, end } : null;
}

/**
 * Maps one provenance offset to a current offset across the diff. A provenance
 * character that survives maps to its partner; one that was deleted maps to the
 * current position where it stood.
 */
function projectBoundary(edits: Change[], index: number): number {
  let provenance = 0;
  let current = 0;

  for (const edit of edits) {
    const length = edit.value.length;
    if (edit.added) {
      current += length;
      continue;
    }
    if (edit.removed) {
      if (index < provenance + length) return current;
      provenance += length;
      continue;
    }
    if (index < provenance + length) return current + (index - provenance);
    provenance += length;
    current += length;
  }

  return current;
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
 * The inverse of `projectInterval`: the canonical interval covering an Editor
 * range. The Editor reports a text selection as ProseMirror positions; the
 * Writer's selection is compared across Revisions in the one canonical string,
 * so the selection has to be expressed there first. Characters this renderer
 * inserted carry no source position, so the interval brackets the source prose
 * the range covers. Returns `null` when the range covers no source character.
 */
export function canonicalIntervalForRange(tree: DocTree, range: EditorRange): Interval | null {
  const { positions } = canonicalTextWithMap(tree);
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < positions.length; index++) {
    const position = positions[index];
    if (position === null) continue;
    if (position < range.from || position >= range.to) continue;
    if (index < start) start = index;
    if (index + 1 > end) end = index + 1;
  }

  if (start === Number.POSITIVE_INFINITY) return null;
  return { start, end };
}

/**
 * Projects many intervals with one walk of the tree, so drawing H Highlights
 * costs one canonical render rather than H of them. Discards each Finding's
 * identity; `projectHighlights` keeps the `current` flag for the Editor.
 */
export function projectIntervals(tree: DocTree, intervals: Interval[]): EditorRange[] {
  return projectHighlights(
    tree,
    intervals.map((interval) => ({ interval, current: false })),
  ).map(({ from, to }) => ({ from, to }));
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

/**
 * The top-level block index a canonical interval begins in, for the Editor to
 * scroll to. When an interval spans a block boundary the start decides, so the
 * Editor lands on the Paragraph the Finding opens in. `null` when there is no
 * block to land on — an Orphaned Finding has no interval at all, so selecting it
 * moves nothing and the prose is never scrolled somewhere misleading.
 */
export function blockIndexForInterval(tree: DocTree, interval: Interval | null): number | null {
  if (interval === null) return null;
  for (const block of canonicalBlocks(tree)) {
    if (interval.start < block.end) return block.index;
  }
  return null;
}

/** A canonical interval paired with whether it is the Current Finding. */
export interface HighlightInterval {
  interval: Interval;
  current: boolean;
}

/** A projected Highlight: the Editor range and whether it is current. */
export interface ProjectedHighlight extends EditorRange {
  current: boolean;
}

/**
 * Projects resolved Highlight intervals with one walk of the tree, carrying each
 * one's `current` flag through. The flag travels with its own interval, so a
 * range that covers no source character can be dropped without the Current
 * Finding's mark sliding onto a neighbouring Finding.
 */
export function projectHighlights(
  tree: DocTree,
  highlights: HighlightInterval[],
): ProjectedHighlight[] {
  const { positions } = canonicalTextWithMap(tree);
  const projected: ProjectedHighlight[] = [];
  for (const highlight of highlights) {
    const range = projectFromPositions(positions, highlight.interval);
    if (range !== null) projected.push({ ...range, current: highlight.current });
  }
  return projected;
}
