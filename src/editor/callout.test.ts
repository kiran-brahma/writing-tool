import { describe, expect, it } from "vitest";
import { reResolveFindings, type FindingInterval } from "../core/anchor";
import { canonicalText } from "../core/canonicalText";
import type { DocTree } from "../core/docTree";
import type { Finding, FindingStatus } from "../core/finding";
import { calloutFindings, calloutPosition, marginMarks } from "./callout";

function finding(id: string, status: FindingStatus = "open", quote = "very"): Finding {
  return {
    id,
    passId: "hedges",
    promptHash: "hash",
    anchor: { quote, offset: 0, state: "attached" },
    issue: "issue",
    diagnosis: "diagnosis",
    status,
    provenance: { providerId: "local", model: "rule", at: 1, revisionId: "r1" },
  };
}

describe("calloutFindings", () => {
  it("shows the open Findings the clicked Highlight names, in the order named", () => {
    const shown = calloutFindings(["b", "a"], [finding("a"), finding("b"), finding("c")]);

    expect(shown.map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  it("leaves out a Finding that has left the queue or no longer exists", () => {
    const shown = calloutFindings(
      ["a", "gone", "b"],
      [finding("a", "addressed"), finding("b")],
    );

    expect(shown.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("shows a Finding once when overlapping Highlights both name it", () => {
    const shown = calloutFindings(["a", "a"], [finding("a")]);

    expect(shown).toHaveLength(1);
  });
});

describe("calloutPosition", () => {
  const viewport = { width: 1200, height: 800 };
  const size = { width: 288, height: 200 };

  it("sits below the Highlight, aligned to its left edge", () => {
    const position = calloutPosition({ left: 100, top: 300, bottom: 320 }, viewport, size);

    expect(position).toEqual({ left: 100, top: 326, placement: "below" });
  });

  it("flips above the Highlight when there is no room below", () => {
    const position = calloutPosition({ left: 100, top: 700, bottom: 720 }, viewport, size);

    expect(position).toEqual({ left: 100, top: 494, placement: "above" });
  });

  it("stays inside the viewport near its right edge", () => {
    const position = calloutPosition({ left: 1100, top: 300, bottom: 320 }, viewport, size);

    expect(position.left).toBe(1200 - 288 - 16);
  });
});

describe("marginMarks", () => {
  const tree: DocTree = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "A title" }] },
      { type: "paragraph", content: [{ type: "text", text: "The first paragraph is very long." }] },
      { type: "paragraph" },
      { type: "paragraph", content: [{ type: "text", text: "The second one is quite short." }] },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "A listed point." }] }],
          },
        ],
      },
    ],
  };
  const canonical = canonicalText(tree);

  /** The resolved Highlight of a Finding whose Anchor quotes `quote`. */
  function highlight(findingId: string, quote: string): FindingInterval {
    const start = canonical.indexOf(quote);
    if (start === -1) throw new Error(`"${quote}" is not in the Document`);
    return { findingId, interval: { start, end: start + quote.length } };
  }

  it("gives one entry for an open Finding, at the top-level block where it begins", () => {
    expect(marginMarks(tree, [highlight("a", "quite short")])).toEqual([
      { blockIndex: 3, findingIds: ["a"] },
    ]);
  });

  it("counts a Finding that spans several Paragraphs once, beside the first of them", () => {
    const marks = marginMarks(tree, [highlight("a", "very long.\n\nThe second")]);

    expect(marks).toEqual([{ blockIndex: 1, findingIds: ["a"] }]);
  });

  it("counts every Finding that begins in a shared block, and each block separately", () => {
    const marks = marginMarks(tree, [
      highlight("list", "listed"),
      highlight("a", "first"),
      highlight("title", "title"),
      highlight("b", "very"),
      highlight("c", "long"),
    ]);

    expect(marks).toEqual([
      { blockIndex: 0, findingIds: ["title"] },
      { blockIndex: 1, findingIds: ["a", "b", "c"] },
      { blockIndex: 4, findingIds: ["list"] },
    ]);
  });

  it("names a Finding once when it is resolved twice", () => {
    const marks = marginMarks(tree, [highlight("a", "first"), highlight("a", "first")]);

    expect(marks).toEqual([{ blockIndex: 1, findingIds: ["a"] }]);
  });

  it("has no entry for an Orphaned Finding or one that has left the queue", () => {
    const { highlights } = reResolveFindings(
      [
        finding("open", "open", "quite short"),
        finding("orphaned", "open", "a sentence the Writer deleted"),
        finding("addressed", "addressed", "first paragraph"),
        finding("declined", "declined", "listed point"),
      ],
      canonical,
      () => canonical,
    );

    expect(marginMarks(tree, highlights)).toEqual([{ blockIndex: 3, findingIds: ["open"] }]);
  });

  it("has no entries when no Finding is open", () => {
    expect(marginMarks(tree, [])).toEqual([]);
  });
});
