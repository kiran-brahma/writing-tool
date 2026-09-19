import { describe, expect, it } from "vitest";
import { projectInterval, resolveAnchor } from "./anchor";
import { canonicalText, canonicalTextWithMap } from "./canonicalText";
import type { BlockNode, DocTree, ParagraphNode } from "./docTree";

function doc(...content: BlockNode[]): DocTree {
  return { type: "doc", content };
}

function paragraph(text: string): ParagraphNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

describe("resolveAnchor", () => {
  it("resolves an exact quote to its interval", () => {
    expect(resolveAnchor({ quote: "very", offset: 0 }, "very good\n")).toEqual({
      start: 0,
      end: 4,
    });
  });

  it("never resolves by offset alone", () => {
    expect(resolveAnchor({ quote: "very", offset: 9_999 }, "very good\n")).toEqual({
      start: 0,
      end: 4,
    });
  });

  it("prefers the occurrence nearest the offset hint, then the first", () => {
    const canonical = "very a very b\n";
    expect(resolveAnchor({ quote: "very", offset: 7 }, canonical)).toEqual({ start: 7, end: 11 });
    expect(resolveAnchor({ quote: "very", offset: 1 }, canonical)).toEqual({ start: 0, end: 4 });
    // A tie keeps the earlier occurrence.
    expect(resolveAnchor({ quote: "very", offset: 3 }, canonical)).toEqual({ start: 0, end: 4 });
  });

  it("reports a missing quote as unresolvable, not as an offset", () => {
    expect(resolveAnchor({ quote: "gone", offset: 0 }, "very good\n")).toBeNull();
    expect(resolveAnchor({ quote: "", offset: 0 }, "very good\n")).toBeNull();
  });
});

describe("canonicalTextWithMap", () => {
  it("keeps its text identical to canonicalText", () => {
    const trees: DocTree[] = [
      doc(),
      doc(paragraph("very good")),
      doc(
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
        paragraph("Body"),
      ),
      doc({ type: "blockquote", content: [paragraph("quoted")] }),
      doc({
        type: "bulletList",
        content: [{ type: "listItem", content: [paragraph("item")] }],
      }),
      doc({ type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "a\n\nb" }] }),
    ];

    for (const tree of trees) {
      expect(canonicalTextWithMap(tree).text).toBe(canonicalText(tree));
    }
  });

  it("maps a paragraph's prose to ProseMirror positions", () => {
    const tree = doc(paragraph("very good"));
    const { positions } = canonicalTextWithMap(tree);

    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, null]);
  });

  it("maps a heading and a following paragraph", () => {
    const tree = doc(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
      paragraph("Body"),
    );
    const { positions } = canonicalTextWithMap(tree);

    expect(positions.slice(0, 8)).toEqual([null, null, null, 1, 2, 3, 4, 5]);
    expect(positions.slice(10, 14)).toEqual([8, 9, 10, 11]);
  });

  it("maps the source inside an inline mark", () => {
    const tree = doc({
      type: "paragraph",
      content: [
        { type: "text", text: "a " },
        { type: "text", text: "very", marks: [{ type: "bold" }] },
      ],
    });
    const { positions } = canonicalTextWithMap(tree);

    expect(positions[0]).toBe(1);
    expect(positions[1]).toBe(2);
    expect(positions.slice(4, 8)).toEqual([3, 4, 5, 6]);
  });

  it("maps a list item's prose to ProseMirror positions", () => {
    const tree = doc({
      type: "bulletList",
      content: [{ type: "listItem", content: [paragraph("item")] }],
    });
    const { positions } = canonicalTextWithMap(tree);

    expect(positions).toEqual([null, null, 3, 4, 5, 6, null]);
  });

  it("maps a block quote's prose", () => {
    const tree = doc({ type: "blockquote", content: [paragraph("q")] });
    const { positions } = canonicalTextWithMap(tree);

    expect(positions).toEqual([null, null, 2, null]);
  });
});

describe("projectInterval", () => {
  it("converts a canonical interval into an Editor range", () => {
    const tree = doc(paragraph("very good"));
    expect(projectInterval(tree, { start: 0, end: 4 })).toEqual({ from: 1, to: 5 });
  });

  it("spans the source when the interval crosses Markdown syntax", () => {
    const tree = doc({
      type: "paragraph",
      content: [
        { type: "text", text: "a " },
        { type: "text", text: "very", marks: [{ type: "bold" }] },
      ],
    });
    // Covers `**very**` in the canonical string, bracketing the four source chars.
    expect(projectInterval(tree, { start: 2, end: 10 })).toEqual({ from: 3, to: 7 });
  });

  it("returns null when the interval covers no source character", () => {
    const tree = doc(paragraph("x"));
    expect(projectInterval(tree, { start: 1, end: 2 })).toBeNull();
  });
});
