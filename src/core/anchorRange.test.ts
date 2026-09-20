import { describe, expect, it } from "vitest";
import { canonicalIntervalForRange, projectInterval } from "./anchor";
import { canonicalText } from "./canonicalText";
import type { BlockNode, DocTree } from "./docTree";

function doc(...content: BlockNode[]): DocTree {
  return { type: "doc", content };
}

function paragraph(text: string): BlockNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function heading(level: number, text: string): BlockNode {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}

const TREE = doc(paragraph("Before any heading."), heading(1, "Title"), paragraph("Alpha."));

describe("canonicalIntervalForRange", () => {
  it("maps an Editor range back to the canonical interval it covers", () => {
    // "Title" sits at ProseMirror positions 22..27 (after the first paragraph).
    const interval = canonicalIntervalForRange(TREE, { from: 22, to: 27 });

    expect(interval).not.toBeNull();
    expect(canonicalText(TREE).slice(interval!.start, interval!.end)).toBe("Title");
  });

  it("round-trips with projectInterval", () => {
    const interval = canonicalIntervalForRange(TREE, { from: 22, to: 27 });
    expect(projectInterval(TREE, interval!)).toEqual({ from: 22, to: 27 });
  });

  it("returns null for a range that covers no source character", () => {
    expect(canonicalIntervalForRange(TREE, { from: 0, to: 0 })).toBeNull();
  });
});
