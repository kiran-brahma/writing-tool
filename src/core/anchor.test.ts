import { describe, expect, it } from "vitest";
import { projectInterval, reResolveFindings, resolveAnchor } from "./anchor";
import { canonicalTextWithMap } from "./canonicalText";
import type { BlockNode, DocTree, ParagraphNode } from "./docTree";
import type { Finding } from "./finding";

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

/**
 * Story 59: an Anchor follows the text across a rewrite. The provenance string
 * is the canonical string of the Finding's Revision; the current string is the
 * Document now. Exact quote match alone would orphan the Finding the moment the
 * Writer changed a character inside the anchored span, which is the common case.
 */
describe("resolveAnchor across Revisions", () => {
  it("follows a rewrite inside the anchored span", () => {
    const provenance = "The very good cat sat.\n";
    const current = "The very great cat sat.\n";

    const interval = resolveAnchor({ quote: "very good", offset: 4 }, current, provenance);

    expect(interval).not.toBeNull();
    expect(current.slice(interval!.start, interval!.end)).toBe("very great");
  });

  it("follows a rewrite of the whole anchored word", () => {
    const provenance = "The very cat sat.\n";
    const current = "The really cat sat.\n";

    const interval = resolveAnchor({ quote: "very", offset: 4 }, current, provenance);

    expect(interval).not.toBeNull();
    expect(current.slice(interval!.start, interval!.end)).toBe("really");
  });

  it("survives a move of the containing Paragraph", () => {
    const provenance = "One.\n\nTwo very good.\n\nThree.\n";
    const current = "One.\n\nThree.\n\nTwo very good.\n";

    const interval = resolveAnchor({ quote: "very good", offset: 10 }, current, provenance);

    expect(interval).not.toBeNull();
    expect(current.slice(interval!.start, interval!.end)).toBe("very good");
  });

  it("survives a move and a rewrite together, which quote match alone cannot", () => {
    const provenance = "One.\n\nTwo very good.\n\nThree.\n";
    const current = "One.\n\nThree.\n\nTwo very great.\n";

    const interval = resolveAnchor({ quote: "very good", offset: 10 }, current, provenance);

    // "very good" is gone verbatim, so a quote fallback would orphan it; only
    // projection can keep the Finding attached and on the surviving text.
    expect(interval).not.toBeNull();
    expect(current.slice(interval!.start, interval!.end)).toContain("very");
  });

  it("orphans a Finding whose quote was deleted", () => {
    const provenance = "The very good cat sat.\n";
    const current = "The cat sat.\n";

    expect(resolveAnchor({ quote: "very good", offset: 4 }, current, provenance)).toBeNull();
  });

  it("falls back to a quote match when the provenance string lacks the quote", () => {
    const provenance = "Something else entirely.\n";
    const current = "A newer very good line.\n";

    const interval = resolveAnchor({ quote: "very good", offset: 0 }, current, provenance);

    expect(interval).not.toBeNull();
    expect(current.slice(interval!.start, interval!.end)).toBe("very good");
  });
});

describe("reResolveFindings", () => {
  function finding(quote: string, offset: number, revisionId = "rev-1"): Finding {
    return {
      id: "finding-1",
      passId: "cliche",
      promptHash: "hash",
      anchor: { quote, offset, state: "attached" },
      issue: "issue",
      diagnosis: "diagnosis",
      status: "open",
      provenance: { providerId: "openai", model: "gpt-test", at: 1_000, revisionId },
    };
  }

  it("recomputes state and returns the interval for an open Finding", () => {
    const provenance = "The very good cat sat.\n";
    const current = "The very great cat sat.\n";

    const resolution = reResolveFindings([finding("very good", 4)], current, () => provenance);

    expect(resolution.findings[0].anchor.state).toBe("attached");
    expect(resolution.intervals).toEqual([{ start: 4, end: 14 }]);
  });

  it("orphans a Finding whose quote is gone and gives it no interval", () => {
    const provenance = "The very good cat sat.\n";
    const current = "The cat sat.\n";

    const resolution = reResolveFindings([finding("very good", 4)], current, () => provenance);

    expect(resolution.findings[0].anchor.state).toBe("orphaned");
    expect(resolution.findings[0].status).toBe("open");
    expect(resolution.intervals).toEqual([]);
  });

  it("resolves by quote match when the provenance Revision is missing", () => {
    const current = "A very good line.\n";

    const resolution = reResolveFindings([finding("very good", 0)], current, () => undefined);

    expect(resolution.findings[0].anchor.state).toBe("attached");
    expect(resolution.intervals).toEqual([{ start: 2, end: 11 }]);
  });

  it("returns the same Finding object when state is unchanged", () => {
    const current = "A very good line.\n";
    const original = finding("very", 2);

    const resolution = reResolveFindings([original], current, () => current);

    expect(resolution.findings[0]).toBe(original);
  });
});

describe("canonicalTextWithMap", () => {
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
