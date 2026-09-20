import { canonicalBlocks, canonicalText } from "./canonicalText";
import type { DocTree } from "./docTree";
import type { Target } from "./target";

/**
 * The Target a local (paragraph-scope) model Pass is shown: the Target
 * Paragraph, one Paragraph either side and the heading outline. The spec is
 * explicit that the outline is headings only — never body text — because the
 * context is there to make a wordiness or cliché judgment local, not to hand
 * the model the whole Document.
 *
 * The Target is named as a half-open interval into the one canonical string, so
 * Containment can drop any Finding that anchors outside it.
 */
export function passContext(
  tree: DocTree,
  blockIndex: number,
  title: string,
): Target | null {
  const blocks = canonicalBlocks(tree);
  const paragraphs = blocks.filter((entry) => entry.block.type === "paragraph");
  if (paragraphs.length === 0) return null;

  const targetIndex = nearestParagraphIndex(paragraphs, blockIndex);
  const target = paragraphs[targetIndex];
  const above = paragraphs[targetIndex - 1];
  const below = paragraphs[targetIndex + 1];

  return {
    // The whole Document's canonical string, the one coordinate system.
    canonical: canonicalText(tree),
    interval: { start: target.start, end: target.start + target.text.length },
    text: target.text,
    title,
    outline: blocks
      .filter((entry) => entry.block.type === "heading")
      .map((entry) => entry.text)
      .join("\n"),
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
