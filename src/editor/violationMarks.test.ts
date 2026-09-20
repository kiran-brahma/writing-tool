import { describe, expect, it } from "vitest";
import type { Violation } from "../core/finding";
import { markViolations, splitViolations, violationsOutsideText } from "./violationMarks";

const praise = (text: string): Violation => ({ kind: "praise", text });

describe("markViolations", () => {
  it("returns one unmarked segment when there is nothing to strike", () => {
    expect(markViolations("A neutral diagnosis.", [])).toEqual([
      { text: "A neutral diagnosis.", violated: false },
    ]);
  });

  it("marks only the violating phrase, leaving the rest readable", () => {
    expect(markViolations("This is great writing.", [praise("great writing")])).toEqual([
      { text: "This is ", violated: false },
      { text: "great writing", violated: true },
      { text: ".", violated: false },
    ]);
  });

  it("matches case-insensitively, as the linter does", () => {
    expect(markViolations("This is Great Writing.", [praise("great writing")])).toEqual([
      { text: "This is ", violated: false },
      { text: "Great Writing", violated: true },
      { text: ".", violated: false },
    ]);
  });

  it("marks every occurrence, not only the first", () => {
    const marked = markViolations("great writing and great writing", [praise("great writing")]);
    expect(marked.filter((segment) => segment.violated)).toHaveLength(2);
  });

  it("merges overlapping phrases into one marked run", () => {
    expect(markViolations("great writing", [praise("great writing"), praise("great")])).toEqual([
      { text: "great writing", violated: true },
    ]);
  });

  it("treats whitespace-only violation text as nothing to mark", () => {
    expect(markViolations("Neutral.", [praise("   ")])).toEqual([
      { text: "Neutral.", violated: false },
    ]);
  });

  it("returns nothing for empty text", () => {
    expect(markViolations("", [praise("great writing")])).toEqual([]);
  });

  it("keeps indices aligned when case folding changes a character's length", () => {
    expect(markViolations("İ great writing", [praise("great writing")])).toEqual([
      { text: "İ ", violated: false },
      { text: "great writing", violated: true },
    ]);
  });

  it("marks self-overlapping occurrences", () => {
    expect(markViolations("aaa", [praise("aa")])).toEqual([{ text: "aaa", violated: true }]);
  });
});

describe("violationsOutsideText", () => {
  it("returns a violation none of the rendered strings contains", () => {
    const leftover = violationsOutsideText(["Neutral.", "Also neutral."], [praise("great writing")]);
    expect(leftover).toEqual([praise("great writing")]);
  });

  it("excludes a violation already rendered", () => {
    expect(violationsOutsideText(["This is great writing."], [praise("great writing")])).toEqual([]);
  });

  it("excludes a rewrite, which the Quarantined rewrite pane shows", () => {
    expect(
      violationsOutsideText(["Neutral."], [{ kind: "rewrite", text: "A new sentence." }]),
    ).toEqual([]);
  });
});

describe("splitViolations", () => {
  it("separates the struck phrases from the quarantined rewrites", () => {
    const { strikes, rewrites } = splitViolations([
      praise("great writing"),
      { kind: "rewrite", text: "A new sentence." },
    ]);

    expect(strikes).toEqual([praise("great writing")]);
    expect(rewrites).toEqual([{ kind: "rewrite", text: "A new sentence." }]);
  });
});
