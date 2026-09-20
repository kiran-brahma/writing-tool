import { canonicalBlocks } from "./canonicalText";
import type { BlockNode, DocTree } from "./docTree";
import type { Interval } from "./finding";

/**
 * A Section is a heading plus the body that follows it. This is the minimal
 * derivation the Judge needs to compare a Section across two Revisions; the
 * Structure ticket owns the full Section model, the outline and Section-scope
 * Passes.
 *
 * The interval is expressed in the one canonical string, so projecting a
 * Section from one Revision onto another is the same diff-projection that
 * re-locates an Anchor — no second coordinate system.
 */
export interface Section {
  /** The heading's text without its Markdown markers. */
  heading: string;
  /** The heading's level, so the outline can nest. */
  level: number;
  /** The heading line plus its body, up to the next heading. */
  interval: Interval;
  /** The heading's top-level block index, for `sectionAt` and for jumping. */
  headingBlockIndex: number;
}

/**
 * The heading lines of a Document, in document order, rendered as their
 * canonical Markdown source (`# Title`). This is the `{{outline}}` a Pass
 * receives: headings only, never body text, so a local Pass can place a
 * Paragraph without being handed the whole Document.
 */
export function outline(tree: DocTree): string {
  return canonicalBlocks(tree)
    .filter((entry) => entry.block.type === "heading")
    .map((entry) => entry.text)
    .join("\n");
}

/** The heading-delimited Sections of a Document, in document order. */
export function sections(tree: DocTree): Section[] {
  const blocks = canonicalBlocks(tree);
  const headingPositions: number[] = [];
  blocks.forEach((block, position) => {
    if (block.block.type === "heading") headingPositions.push(position);
  });

  return headingPositions.map((position, index) => {
    const heading = blocks[position];
    const nextPosition = headingPositions[index + 1];
    // A Section's body runs to the block before the next heading; the final
    // Section runs to the end of the last block. No separator length is
    // guessed here: the renderer already reports where each block ends.
    const end =
      nextPosition === undefined ? blocks[blocks.length - 1].end : blocks[nextPosition - 1].end;
    return {
      heading: headingText(heading.text),
      level: headingLevel(heading.block),
      interval: { start: heading.start, end },
      headingBlockIndex: heading.index,
    };
  });
}

/**
 * The Section a top-level block belongs to: the last heading at or before it.
 * A block before the first heading is the preamble, which belongs to no
 * Section, so this returns `null`.
 */
export function sectionAt(tree: DocTree, blockIndex: number): Section | null {
  let found: Section | null = null;
  for (const section of sections(tree)) {
    if (section.headingBlockIndex > blockIndex) break;
    found = section;
  }
  return found;
}

/** A canonical heading line `## Title` as its text `Title`. */
function headingText(canonicalLine: string): string {
  return canonicalLine.replace(/^#+\s*/, "");
}

/** A heading's level, defaulting to 1 when the tree carries no attrs. */
function headingLevel(block: BlockNode): number {
  return block.type === "heading" ? block.attrs?.level ?? 1 : 1;
}
