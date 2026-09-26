import { canonicalBlocks, canonicalParagraphs, canonicalText } from "./canonicalText";
import type { DocTree } from "./docTree";
import type { Pass } from "./pass";
import { outline, sectionAt, sections, type Section } from "./sections";
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
 *
 * A Paragraph inside a list item counts, at any depth, so a Document drafted as
 * a list still has a Target. Its interval covers the prose, not the marker.
 */
export function passContext(
  tree: DocTree,
  blockIndex: number,
  title: string,
): Target | null {
  const paragraphs = canonicalParagraphs(tree);
  if (paragraphs.length === 0) return null;

  const targetIndex = nearestParagraphIndex(paragraphs, blockIndex);
  const target = paragraphs[targetIndex];
  const above = paragraphs[targetIndex - 1];
  const below = paragraphs[targetIndex + 1];

  return {
    // The whole Document's canonical string, the one coordinate system.
    canonical: canonicalText(tree),
    interval: { start: target.start, end: target.end },
    text: target.text,
    title,
    outline: outline(tree),
    contextAbove: above?.text ?? "",
    contextBelow: below?.text ?? "",
    // A local Pass never receives body text beyond its Target, and is never
    // chunked, so it carries no split structure.
    documentText: "",
  };
}

/**
 * The Target for one Section, from a canonical string and outline a caller has
 * already rendered. A Reader run builds these once for the whole Document
 * rather than re-rendering the canonical string for every Section, and the
 * Section-scope resolver below uses it too.
 */
export function sectionTarget(
  canonical: string,
  outlineText: string,
  section: Section,
  title: string,
): Target {
  return {
    canonical,
    interval: section.interval,
    text: canonical.slice(section.interval.start, section.interval.end),
    title,
    outline: outlineText,
    contextAbove: "",
    contextBelow: "",
    // The Section is the Target; the whole Document is not handed to it, and a
    // Section Target is not split.
    documentText: "",
  };
}

/**
 * The Target a section-scope model Pass is shown: one Section — its heading plus
 * the body that follows it — with the heading outline. Story 25 makes the
 * Section a thing a Pass can reason about, so a section Pass is bounded by the
 * same interval the outline and the Judge use, and Containment cannot keep a
 * Finding from a neighbouring Section.
 */
export function sectionContext(
  tree: DocTree,
  blockIndex: number,
  title: string,
): Target | null {
  const section = sectionAt(tree, blockIndex);
  if (section === null) return null;
  return sectionTarget(canonicalText(tree), outline(tree), section, title);
}

/**
 * The Target a document-scope (structural) model Pass is shown: the whole
 * Document and nothing less. Story 48 is explicit that advice about Paragraph
 * order cannot come from a Pass that cannot see the order, so the `{{document}}`
 * placeholder is filled here and the Target interval is the whole canonical
 * string — Containment then keeps a Finding anchored anywhere in it, rather than
 * dropping every Finding the local rule would have discarded.
 */
export function documentContext(tree: DocTree, title: string): Target | null {
  const canonical = canonicalText(tree);
  if (canonical.trim() === "") return null;

  return {
    canonical,
    interval: { start: 0, end: canonical.length },
    text: canonical,
    title,
    outline: outline(tree),
    // The whole Document is the target; there is no "above" or "below" it.
    contextAbove: "",
    contextBelow: "",
    documentText: canonical,
    // Story 50: the boundaries `chunkTarget` splits on when the Document is too
    // long for one call, both in the one canonical string.
    structure: {
      blocks: canonicalBlocks(tree).map((block) => ({ start: block.start, end: block.end })),
      sections: sections(tree).map((section) => section.interval),
    },
  };
}

/**
 * The one place a Pass's scope decides what it is shown. `runModelPass` asks
 * for a Target and never branches on scope; adding a scope is a case here, plus
 * the prompt clause that names it.
 */
export function targetForPass(
  pass: Pass,
  tree: DocTree,
  blockIndex: number,
  title: string,
): Target | null {
  switch (pass.scope) {
    case "paragraph":
      return passContext(tree, blockIndex, title);
    case "section":
      return sectionContext(tree, blockIndex, title);
    case "document":
      return documentContext(tree, title);
  }
}

/**
 * The Paragraph nearest the cursor's block, preferring the earlier on a tie. The
 * cursor names a top-level block, so every Paragraph in a list shares the list's
 * index, and a cursor anywhere in the list resolves to its first Paragraph.
 */
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
