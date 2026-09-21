import { describe, expect, it } from "vitest";
import { dedupeViolations, lintViolations } from "./lintViolations";

/**
 * The client-side half of the constitution's Rule 2. The harness asserts that a
 * fixture praise token survives to the linter; these tests pin down what each
 * of the eight detection rules actually catches, so a reworded regex cannot
 * silently stop flagging a family of drift the way one fixture phrase would
 * never reveal.
 */
describe("lintViolations", () => {
  it("flags an approving adjective before a noun naming the prose", () => {
    expect(lintViolations("great writing")).toEqual([{ kind: "praise", text: "great writing" }]);
    expect(lintViolations("excellent prose")).toEqual([
      { kind: "praise", text: "excellent prose" },
    ]);
  });

  it("flags an approving adverb before a participle", () => {
    expect(lintViolations("well written")).toEqual([{ kind: "praise", text: "well written" }]);
    expect(lintViolations("beautifully crafted")).toEqual([
      { kind: "praise", text: "beautifully crafted" },
    ]);
  });

  it("flags bare encouragement", () => {
    expect(lintViolations("Good job")).toEqual([{ kind: "praise", text: "Good job" }]);
    expect(lintViolations("Well done")).toEqual([{ kind: "praise", text: "Well done" }]);
    expect(lintViolations("nice work")).toEqual([{ kind: "praise", text: "nice work" }]);
    expect(lintViolations("keep it up")).toEqual([{ kind: "praise", text: "keep it up" }]);
    expect(lintViolations("I really love this")).toEqual([
      { kind: "praise", text: "I really love" },
    ]);
  });

  it("flags approval addressed at the writing itself", () => {
    expect(lintViolations("This is a great point.")).toEqual([
      { kind: "praise", text: "This is a great" },
    ]);
    expect(lintViolations("this reads compelling")).toEqual([
      { kind: "praise", text: "this reads compelling" },
    ]);
  });

  it("flags a rewrite offer phrased as consider/try plus a gerund", () => {
    expect(lintViolations("consider rewriting this")).toEqual([
      { kind: "rewrite", text: "consider rewriting" },
    ]);
    expect(lintViolations("Try tightening this")).toEqual([
      { kind: "rewrite", text: "Try tightening" },
    ]);
    expect(lintViolations("you could say")).toEqual([]); // conservative by design
  });

  it("flags a rewrite offer phrased as a comparison", () => {
    expect(lintViolations("would read better")).toEqual([
      { kind: "rewrite", text: "would read better" },
    ]);
  });

  it("flags an instead-write instruction", () => {
    expect(lintViolations("instead, write a shorter sentence")).toEqual([
      { kind: "rewrite", text: "instead, write" },
    ]);
    expect(lintViolations("instead use")).toEqual([{ kind: "rewrite", text: "instead use" }]);
  });

  it("flags a replace-with instruction", () => {
    expect(lintViolations("replace it with a verb")).toEqual([
      { kind: "rewrite", text: "replace it with" },
    ]);
    expect(lintViolations("replace this with")).toEqual([
      { kind: "rewrite", text: "replace this with" },
    ]);
  });

  it("matches case-insensitively and reports the text as written", () => {
    expect(lintViolations("GREAT WRITING")).toEqual([
      { kind: "praise", text: "GREAT WRITING" },
    ]);
  });

  it("reports each distinct phrase once, first seen first", () => {
    expect(lintViolations("Great Writing and great writing")).toEqual([
      { kind: "praise", text: "Great Writing" },
    ]);
    expect(lintViolations("great writing, then consider rewriting it")).toEqual([
      { kind: "praise", text: "great writing" },
      { kind: "rewrite", text: "consider rewriting" },
    ]);
  });

  it("does not flag neutral prose", () => {
    expect(lintViolations("The committee met on Tuesday to discuss the budget.")).toEqual([]);
    expect(lintViolations("")).toEqual([]);
  });

  it("can lint many strings without a global regex leaking its lastIndex", () => {
    const first = lintViolations("great writing");
    const second = lintViolations("great writing");
    expect(second).toEqual(first);
  });
});

describe("dedupeViolations", () => {
  it("merges lists by kind and case-insensitive text, keeping the first spelling", () => {
    expect(
      dedupeViolations([
        { kind: "praise", text: "Great Writing" },
        { kind: "praise", text: "great writing" },
        { kind: "rewrite", text: "consider rewriting" },
        { kind: "praise", text: "Great Writing" },
      ]),
    ).toEqual([
      { kind: "praise", text: "Great Writing" },
      { kind: "rewrite", text: "consider rewriting" },
    ]);
  });

  it("keeps the same text under two different kinds", () => {
    expect(
      dedupeViolations([
        { kind: "praise", text: "same" },
        { kind: "rewrite", text: "same" },
      ]),
    ).toHaveLength(2);
  });
});
