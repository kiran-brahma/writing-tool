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
