import type { FindingInterval } from "../core/anchor";
import { canonicalBlocks } from "../core/canonicalText";
import type { DocTree } from "../core/docTree";
import { isOpenFinding, type Finding } from "../core/finding";

/**
 * The callout a click on a Highlight opens: the Findings on that prose, next to
 * the prose, so the Writer need not hunt for them in the Rail. The Editor
 * reports only which Findings the Highlight names and where it sits on screen;
 * the shell renders the Findings, so the Editor never sees model output.
 */

/**
 * The open Findings a clicked Highlight names, in the order named and each
 * once. Overlapping Highlights can name one Finding twice, and a Finding that
 * has left the queue draws no Highlight, so neither shows.
 */
export function calloutFindings(findingIds: string[], findings: Finding[]): Finding[] {
  const byId = new Map(findings.map((finding) => [finding.id, finding]));
  const shown: Finding[] = [];
  for (const id of new Set(findingIds)) {
    const finding = byId.get(id);
    if (finding !== undefined && isOpenFinding(finding)) shown.push(finding);
  }
  return shown;
}

/**
 * A Margin mark: the top-level block it sits beside, and the Findings that
 * begin there. The count it shows is the number of ids.
 */
export interface MarginMark {
  blockIndex: number;
  findingIds: string[];
}

/**
 * The Margin marks for a Document: one per top-level block where at least one
 * resolved Highlight begins, in Document order, each naming its Findings once
 * and in the order given. A Finding that spans several Paragraphs is counted
 * beside the first of them only, so the counts are honest (story 221).
 *
 * It reads the resolved Highlights, which hold only open, attached Findings:
 * an Orphaned Finding has no interval and a Finding that has left the queue
 * draws no Highlight, so neither gets a mark. Like the Callout it never sees a
 * Finding's text — only ids and intervals.
 */
export function marginMarks(tree: DocTree, highlights: readonly FindingInterval[]): MarginMark[] {
  // One render of the Document for every Highlight: a Document can carry
  // hundreds, and each would otherwise render it again.
  const blocks = canonicalBlocks(tree);
  const byBlock = new Map<number, Set<string>>();
  for (const { findingId, interval } of highlights) {
    const blockIndex = blockBeginning(blocks, interval.start);
    if (blockIndex === null) continue;
    const ids = byBlock.get(blockIndex) ?? new Set<string>();
    ids.add(findingId);
    byBlock.set(blockIndex, ids);
  }
  return [...byBlock.entries()]
    .sort(([left], [right]) => left - right)
    .map(([blockIndex, ids]) => ({ blockIndex, findingIds: [...ids] }));
}

/**
 * The top-level block a canonical offset falls in, or in the gap after, as
 * `blockIndexForInterval` decides it: the first block whose end lies past the
 * offset. Blocks are in canonical order, so this is a binary search.
 */
function blockBeginning(
  blocks: readonly { index: number; end: number }[],
  start: number,
): number | null {
  let low = 0;
  let high = blocks.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (start < blocks[middle].end) high = middle;
    else low = middle + 1;
  }
  return low < blocks.length ? blocks[low].index : null;
}

/** Where a Highlight sits on screen, in viewport pixels. */
export interface HighlightRect {
  left: number;
  top: number;
  bottom: number;
}

export interface CalloutPosition {
  left: number;
  top: number;
  placement: "below" | "above";
}

/** Breathing room between the callout and the Highlight or the viewport edge. */
const GAP = 6;
const EDGE = 16;

/**
 * Places the callout below the Highlight, or above it when the viewport has no
 * room below, and keeps it inside the viewport horizontally.
 */
export function calloutPosition(
  rect: HighlightRect,
  viewport: { width: number; height: number },
  size: { width: number; height: number },
): CalloutPosition {
  const left = Math.max(EDGE, Math.min(rect.left, viewport.width - size.width - EDGE));
  const below = rect.bottom + GAP;
  if (below + size.height <= viewport.height - EDGE || rect.top - GAP - size.height < EDGE) {
    return { left, top: below, placement: "below" };
  }
  return { left, top: rect.top - GAP - size.height, placement: "above" };
}
