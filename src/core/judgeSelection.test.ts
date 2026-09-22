import { describe, expect, it } from "vitest";
import type { Interval } from "./finding";
import {
  defaultJudgePair,
  extractPassages,
  passageText,
  projectSelection,
  selectionAnchor,
  type JudgePairRevision,
} from "./judgeSelection";

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

describe("defaultJudgePair", () => {
  // `revisions` is newest-first, so the first element is "now".
  const revision = (id: string, flagged = false): JudgePairRevision => ({ id, flagged });

  it("defaults to the most recent flagged Revision against now", () => {
    const now = revision("now");
    const recentMilestone = revision("recent", true);
    const olderMilestone = revision("older", true);
    const oldest = revision("oldest");

    // Two flagged Revisions, newest-first: the most recent wins, not the oldest.
    expect(defaultJudgePair([now, recentMilestone, olderMilestone, oldest])).toEqual({
      before: "recent",
      after: "now",
    });
  });

  it("defaults to the oldest Revision against now when none is flagged", () => {
    const now = revision("now");
    const middle = revision("middle");
    const oldest = revision("oldest");

    expect(defaultJudgePair([now, middle, oldest])).toEqual({
      before: "oldest",
      after: "now",
    });
  });

  it("returns no before when there is only one Revision", () => {
    const now = revision("now");

    expect(defaultJudgePair([now])).toEqual({ before: null, after: "now" });
  });

  it("returns no pair when there are no Revisions", () => {
    expect(defaultJudgePair([])).toEqual({ before: null, after: null });
  });

  it("never pairs a Revision with itself when the flagged Revision is now", () => {
    const now = revision("now", true);
    const older = revision("older", true);
    const oldest = revision("oldest");

    // The milestone just flagged is now; the rewrite worth judging is the
    // flagged Revision before it.
    expect(defaultJudgePair([now, older, oldest])).toEqual({
      before: "older",
      after: "now",
    });

    // With no earlier flagged Revision, fall back to the oldest.
    expect(defaultJudgePair([now, revision("auto"), oldest])).toEqual({
      before: "oldest",
      after: "now",
    });
  });

  it("is pure: same input gives the same output and does not mutate it", () => {
    const revisions = [revision("now"), revision("milestone", true), revision("oldest")];

    // Calling twice cannot disagree with itself, so the load-bearing assertion
    // is that neither call mutates the input.
    expect(defaultJudgePair(revisions)).toEqual({
      before: "milestone",
      after: "now",
    });
    expect(defaultJudgePair(revisions)).toEqual({
      before: "milestone",
      after: "now",
    });
    expect(revisions.map((entry) => entry.id)).toEqual(["now", "milestone", "oldest"]);
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
