import { describe, expect, it } from "vitest";
import {
  blockIndexForInterval,
  projectHighlights,
  projectHighlightsOnto,
  projectInterval,
  reResolveFindings,
  resolveAnchor,
} from "./anchor";
import { canonicalText, canonicalTextWithMap } from "./canonicalText";
import type { BlockNode, DocTree, ParagraphNode } from "./docTree";
import type { Finding, Interval } from "./finding";

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
/**
 * A long Document whose every Paragraph but one the Writer has since rewritten:
 * the drift a Writer builds up working through a queue of Findings.
 */
const ANCHORED_BEFORE = "The very good cat sat on the mat.";
const ANCHORED_AFTER = "The very great cat sat on the mat.";

/**
 * A long Document whose every Paragraph but one the Writer has since rewritten:
 * the drift a Writer builds up working through a queue of Findings. The one
 * kept Paragraph holds the Anchor and was edited inside the anchored span.
 * `arrange` reorders the current Paragraphs, to insert or move one.
 */
function heavilyRevised(arrange: (paragraphs: string[]) => string[] = (paragraphs) => paragraphs): {
  provenance: string;
  current: string;
  quoteOffset: number;
} {
  // Each Paragraph is distinct, as prose is: none can align with another.
  const paragraph = (seed: number) =>
    `Paragraph ${seed}: ` +
    Array.from({ length: 60 }, (_, word) => `w${(seed * 31 + word * 7) % 97}`).join(" ") +
    ".";
  const kept = 40;
  const before: string[] = [];
  const after: string[] = [];
  for (let index = 0; index < 200; index += 1) {
    if (index === kept) {
      before.push(ANCHORED_BEFORE);
      after.push(ANCHORED_AFTER);
    } else {
      before.push(paragraph(index));
      after.push(paragraph(index + 1_000));
    }
  }
  const provenance = before.join("\n\n") + "\n";
  return {
    provenance,
    current: arrange(after).join("\n\n") + "\n",
    quoteOffset: provenance.indexOf("very good"),
  };
}

/** The anchored Paragraph's span in `current`, where alone a projection may land. */
function anchoredParagraph(current: string): Interval {
  const start = current.indexOf(ANCHORED_AFTER);
  return { start, end: start + ANCHORED_AFTER.length };
}

describe("resolveAnchor across a heavily revised Document", () => {
  it("still follows a rewrite inside the anchored span", () => {
    const { provenance, current, quoteOffset } = heavilyRevised();

    const interval = resolveAnchor({ quote: "very good", offset: quoteOffset }, current, provenance);

    expect(interval).not.toBeNull();
    expect(current.slice(interval!.start, interval!.end)).toBe("very great");
  });

  it.each([
    [
      "a Paragraph inserted just above the anchored one",
      (paragraphs: string[]) => {
        const at = paragraphs.indexOf(ANCHORED_AFTER);
        return [...paragraphs.slice(0, at), "A dog barked twice at the gate.", ...paragraphs.slice(at)];
      },
    ],
    [
      "the anchored Paragraph moved as well as edited",
      (paragraphs: string[]) => {
        const rest = paragraphs.filter((paragraph) => paragraph !== ANCHORED_AFTER);
        return [...rest.slice(0, 120), ANCHORED_AFTER, ...rest.slice(120)];
      },
    ],
  ])("never projects onto the wrong prose after %s", (_, arrange) => {
    const { provenance, current, quoteOffset } = heavilyRevised(arrange);
    const paragraph = anchoredParagraph(current);

    const interval = resolveAnchor({ quote: "very good", offset: quoteOffset }, current, provenance);

    // Orphaned is an honest outcome; a Highlight on some other Paragraph is not.
    if (interval !== null) {
      expect(interval.start).toBeGreaterThanOrEqual(paragraph.start);
      expect(interval.end).toBeLessThanOrEqual(paragraph.end);
    }
  });

  it("resolves a long Document far faster than one whole-Document character diff", () => {
    // One unbounded character diff of a pair this size took several seconds,
    // and it ran on every typing pause, so the Editor hung while the Writer
    // typed. The bound is loose on purpose: it guards the order of magnitude,
    // not a machine's speed.
    const { provenance, current, quoteOffset } = heavilyRevised();

    const started = performance.now();
    resolveAnchor({ quote: "very good", offset: quoteOffset }, current, provenance);

    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

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
    expect(resolution.highlights).toEqual([
      { findingId: "finding-1", interval: { start: 4, end: 14 } },
    ]);
  });

  it("orphans a Finding whose quote is gone and gives it no interval", () => {
    const provenance = "The very good cat sat.\n";
    const current = "The cat sat.\n";

    const resolution = reResolveFindings([finding("very good", 4)], current, () => provenance);

    expect(resolution.findings[0].anchor.state).toBe("orphaned");
    expect(resolution.findings[0].status).toBe("open");
    expect(resolution.highlights).toEqual([]);
  });

  it("resolves by quote match when the provenance Revision is missing", () => {
    const current = "A very good line.\n";

    const resolution = reResolveFindings([finding("very good", 0)], current, () => undefined);

    expect(resolution.findings[0].anchor.state).toBe("attached");
    expect(resolution.highlights).toEqual([
      { findingId: "finding-1", interval: { start: 2, end: 11 } },
    ]);
  });

  it("returns the same Finding object when state is unchanged", () => {
    const current = "A very good line.\n";
    const original = finding("very", 2);

    const resolution = reResolveFindings([original], current, () => current);

    expect(resolution.findings[0]).toBe(original);
  });

  it("ties each Highlight interval to its own Finding", () => {
    const current = "A very good line and a very bad line.\n";
    const first = { ...finding("very good", 2), id: "finding-a" };
    const second = { ...finding("very bad", 20), id: "finding-b" };

    const resolution = reResolveFindings([first, second], current, () => current);

    expect(resolution.highlights).toEqual([
      { findingId: "finding-a", interval: { start: 2, end: 11 } },
      { findingId: "finding-b", interval: { start: 23, end: 31 } },
    ]);
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

/**
 * The Current Finding's Highlight and the Editor's scroll both need the
 * top-level block an interval begins in. The start decides, so an interval that
 * spans a Paragraph boundary still lands in the Paragraph it opens in.
 */
describe("blockIndexForInterval", () => {
  it("finds the top-level block an interval begins in", () => {
    const tree = doc(paragraph("One."), paragraph("Two."), paragraph("Three."));
    const canonical = canonicalText(tree);
    const start = canonical.indexOf("Three");
    expect(blockIndexForInterval(tree, { start, end: start + 5 })).toBe(2);
  });

  it("lands on the block it begins in when the interval spans a block boundary", () => {
    const tree = doc(paragraph("Alpha beta."), paragraph("Gamma delta."));
    const canonical = canonicalText(tree);
    const start = canonical.indexOf("beta");
    const end = canonical.indexOf("delta") + 5;
    expect(blockIndexForInterval(tree, { start, end })).toBe(0);
  });

  it("returns null for an Orphaned Finding, whose interval is missing", () => {
    expect(blockIndexForInterval(doc(paragraph("One.")), null)).toBeNull();
  });
});

/**
 * The Editor draws every open Finding's Highlight and distinguishes the Current
 * Finding's. A range that covers no source character is dropped, and the flag
 * must stay with its own interval rather than slide onto a neighbour.
 */
describe("projectHighlights", () => {
  it("keeps each Highlight's Finding and current flag through projection", () => {
    const tree = doc(paragraph("alpha"), paragraph("beta"));
    const projected = projectHighlights(tree, [
      { findingId: "f1", interval: { start: 0, end: 5 }, current: false },
      { findingId: "f2", interval: { start: 7, end: 11 }, current: true },
    ]);

    expect(projected).toEqual([
      { findingId: "f1", from: 1, to: 6, current: false },
      { findingId: "f2", from: 8, to: 12, current: true },
    ]);
  });

  it("drops a range with no source character without moving the current flag", () => {
    const tree = doc(paragraph("alpha"), paragraph("beta"));
    const projected = projectHighlights(tree, [
      // The blank-line separator between the two Paragraphs carries no source
      // character, so this range projects to nothing.
      { findingId: "f1", interval: { start: 5, end: 6 }, current: false },
      { findingId: "f2", interval: { start: 7, end: 11 }, current: true },
    ]);

    expect(projected).toEqual([{ findingId: "f2", from: 8, to: 12, current: true }]);
  });
});

/**
 * Highlights are resolved when the Writer pauses, against the text as it was
 * then. Projected onto a tree the Writer has typed into since, their intervals
 * would land on the wrong characters, so projection refuses.
 */
describe("projectHighlightsOnto", () => {
  const highlights = [{ findingId: "f1", interval: { start: 4, end: 9 }, current: true }];

  it("projects intervals resolved against the tree's own text", () => {
    const tree = doc(paragraph("The very cat."));

    expect(projectHighlightsOnto(tree, canonicalText(tree), highlights)).toEqual([
      { findingId: "f1", from: 5, to: 10, current: true },
    ]);
  });

  it("refuses intervals resolved against text the Writer has since changed", () => {
    const resolvedAgainst = canonicalText(doc(paragraph("The very cat.")));
    const edited = doc(paragraph("Oh, the very cat."));

    expect(projectHighlightsOnto(edited, resolvedAgainst, highlights)).toBeNull();
  });
});
