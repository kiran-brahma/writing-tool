import type { Section } from "../core/sections";

/** One row of the Outline, as either placement draws it. */
export interface OutlineEntry {
  heading: string;
  level: number;
  /** The heading's top-level block index: the row's key, and where a click jumps. */
  headingBlockIndex: number;
  /** Whether the cursor is in this Section. */
  current: boolean;
}

/**
 * Story 243: the Outline's rows, with the Section the cursor is in marked. The
 * margin Outline and the Rail's Outline both draw from this, so they mark the
 * same Section and jump to the same block wherever the Outline is shown.
 * `currentHeadingBlockIndex` is null in the preamble, which is no Section.
 */
export function outlineEntries(
  sections: readonly Section[],
  currentHeadingBlockIndex: number | null,
): OutlineEntry[] {
  return sections.map((section) => ({
    heading: section.heading,
    level: section.level,
    headingBlockIndex: section.headingBlockIndex,
    current: section.headingBlockIndex === currentHeadingBlockIndex,
  }));
}
