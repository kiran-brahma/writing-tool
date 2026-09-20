import { canonicalBlocks, canonicalText } from "./canonicalText";
import type { DocTree } from "./docTree";
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
  /** The heading line plus its body, up to the next heading. */
  interval: Interval;
  /** The heading's top-level block index, for `sectionAt`. */
  headingBlockIndex: number;
}

/** The heading-delimited Sections of a Document, in document order. */
export function sections(tree: DocTree): Section[] {
  const blocks = canonicalBlocks(tree);
  const canonical = canonicalText(tree);
  const headings = blocks.filter((block) => block.block.type === "heading");

  return headings.map((block, index) => {
    const next = headings[index + 1];
    // Blocks are separated by exactly one blank line, so a Section ends where
    // the next heading's leading separator begins. The last runs to the end of
    // the canonical string, whose one trailing newline is not body.
    const end = next === undefined ? canonical.length - 1 : next.start - 2;
    return {
      heading: headingText(block.text),
      interval: { start: block.start, end: Math.max(block.start, end) },
      headingBlockIndex: block.index,
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
