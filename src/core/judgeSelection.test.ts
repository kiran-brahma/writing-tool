import { describe, expect, it } from "vitest";
import type { Interval } from "./finding";
import { extractPassages, passageText, projectSelection, selectionAnchor } from "./judgeSelection";

describe("selectionAnchor", () => {
  it("turns a canonical interval into a quote and an offset", () => {
    const canonical = "The very good cat sat.\n";

    expect(selectionAnchor(canonical, { start: 4, end: 13 })).toEqual({
      quote: "very good",
      offset: 4,
    });
  });

  it("returns null for an empty selection", () => {
    expect(selectionAnchor("anything\n", { start: 2, end: 2 })).toBeNull();
  });
});

describe("projectSelection", () => {
  const current = "The very good cat sat on the mat.\n";
  const older = "The very great cat sat on the mat.\n";

  function select(text: string, canonical: string) {
    const start = canonical.indexOf(text);
    return selectionAnchor(canonical, { start, end: start + text.length })!;
  }

  it("projects a selection across Revisions by diff-projection", () => {
    const anchor = select("very good", current);

    const interval = projectSelection(anchor, current, older);

    expect(interval).not.toBeNull();
    // The quote no longer exists verbatim in the older Revision, so only
    // projection can locate it.
    expect(passageText(older, interval!)).toBe("very great");
  });

  it("survives a move of the containing Paragraph, which quote match cannot", () => {
    const moved = "One.\n\nThree.\n\nThe very great cat sat on the mat.\n";
    const anchor = select("very good", current);

    const interval = projectSelection(anchor, current, moved);

    expect(interval).not.toBeNull();
    expect(passageText(moved, interval!)).toContain("very");
  });

  it("returns null when the selected text was deleted from the target Revision", () => {
    const withText = "The very good cat sat.\n";
    const deleted = "The cat sat.\n";
    const anchor = select("very good", withText);

    expect(projectSelection(anchor, withText, deleted)).toBeNull();
  });
});

describe("passageText", () => {
  it("slices a canonical string", () => {
    const interval: Interval = { start: 0, end: 3 };
    expect(passageText("abcdef\n", interval)).toBe("abc");
  });
});

describe("extractPassages", () => {
  const current = "The very good cat sat.\n";
  const older = "The very great cat sat.\n";
  const newer = "The very good cat sat down.\n";

  function anchor() {
    const start = current.indexOf("very good");
    return selectionAnchor(current, { start, end: start + "very good".length })!;
  }

  it("extracts both passages before either call is made", () => {
    const passages = extractPassages(anchor(), current, older, newer);

    expect(passages.before).toBe("very great");
    expect(passages.after).toBe("very good");
  });

  it("returns null on a side whose Revision deleted the selection", () => {
    const passages = extractPassages(anchor(), current, "The cat sat.\n", newer);

    expect(passages.before).toBeNull();
    expect(passages.after).toBe("very good");
  });

  it("returns two nulls when there is no selection", () => {
    expect(extractPassages(null, current, older, newer)).toEqual({ before: null, after: null });
  });
});
