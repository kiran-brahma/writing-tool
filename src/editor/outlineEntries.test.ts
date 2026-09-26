import { describe, expect, it } from "vitest";
import type { BlockNode, DocTree } from "../core/docTree";
import { sectionAt, sections } from "../core/sections";
import { outlineEntries } from "./outlineEntries";

function doc(...content: BlockNode[]): DocTree {
  return { type: "doc", content };
}

function paragraph(text: string): BlockNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function heading(level: number, text: string): BlockNode {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}

const TREE = doc(
  paragraph("A preamble."),
  heading(1, "Opening"),
  paragraph("First body."),
  heading(2, "Detail"),
  paragraph("Second body."),
  heading(1, "Close"),
);

/** The headings marked current with the cursor in the given block, as the shell derives it. */
function markedWithCursorIn(blockIndex: number): string[] {
  const current = sectionAt(TREE, blockIndex)?.headingBlockIndex ?? null;
  return outlineEntries(sections(TREE), current)
    .filter((entry) => entry.current)
    .map((entry) => entry.heading);
}

describe("outlineEntries", () => {
  it("lists every Section in document order with its level and jump target", () => {
    expect(outlineEntries(sections(TREE), null)).toEqual([
      { heading: "Opening", level: 1, headingBlockIndex: 1, current: false },
      { heading: "Detail", level: 2, headingBlockIndex: 3, current: false },
      { heading: "Close", level: 1, headingBlockIndex: 5, current: false },
    ]);
  });

  it("marks the one Section the cursor is in, on its heading or in its body", () => {
    expect(markedWithCursorIn(1)).toEqual(["Opening"]);
    expect(markedWithCursorIn(2)).toEqual(["Opening"]);
    expect(markedWithCursorIn(3)).toEqual(["Detail"]);
    expect(markedWithCursorIn(4)).toEqual(["Detail"]);
    expect(markedWithCursorIn(5)).toEqual(["Close"]);
  });

  it("marks nothing while the cursor is in the preamble", () => {
    expect(markedWithCursorIn(0)).toEqual([]);
  });

  it("is empty for a Document with no headings", () => {
    expect(outlineEntries([], null)).toEqual([]);
  });
});
