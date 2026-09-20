import { canonicalBlocks } from "./canonicalText";
import type { DocTree } from "./docTree";
import type { Interval } from "./finding";

/**
 * The material a local (paragraph-scope) model Pass is shown: the Target
 * Paragraph, one Paragraph either side and the heading outline. The spec is
 * explicit that the outline is headings only — never body text — because the
 * context is there to make a wordiness or cliché judgment local, not to hand
 * the model the whole Document.
 *
 * The Target is named as a half-open interval into the one canonical string, so
 * Containment can drop any Finding that anchors outside it.
 */
export interface PassContext {
  title: string;
  outline: string;
  target: string;
  targetInterval: Interval;
  contextAbove: string;
  contextBelow: string;
}

/**
 * The Target Paragraph for a Pass, given the top-level block the Writer's
 * cursor is in. The nearest Paragraph wins when the cursor is on a heading, a
 * list or a quote, so a Run is never disabled by where exactly the cursor sits.
 * Returns `null` only when the Document holds no Paragraph at all.
 *
 * The outline is every top-level heading, rendered as its canonical source
 * line, so the model sees the Document's shape without its prose.
 */
export function passContext(
  tree: DocTree,
  blockIndex: number,
  title: string,
): PassContext | null {
  const blocks = canonicalBlocks(tree);
  const paragraphs = blocks.filter((entry) => entry.block.type === "paragraph");
  if (paragraphs.length === 0) return null;

  const targetIndex = nearestParagraphIndex(paragraphs, blockIndex);
  const target = paragraphs[targetIndex];
  const above = paragraphs[targetIndex - 1];
  const below = paragraphs[targetIndex + 1];

  return {
    title,
    outline: blocks
      .filter((entry) => entry.block.type === "heading")
      .map((entry) => entry.text)
      .join("\n"),
    target: target.text,
    targetInterval: { start: target.start, end: target.start + target.text.length },
    contextAbove: above?.text ?? "",
    contextBelow: below?.text ?? "",
  };
}

/** The Paragraph nearest the cursor's block, preferring the earlier on a tie. */
function nearestParagraphIndex(
  paragraphs: { index: number }[],
  blockIndex: number,
): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  paragraphs.forEach((entry, position) => {
    const distance = Math.abs(entry.index - blockIndex);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = position;
    }
  });
  return best;
}
