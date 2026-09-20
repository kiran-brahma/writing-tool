import { describe, expect, it } from "vitest";
import { wordCount } from "./canonicalText";
import { countWords } from "./tokens";

/**
 * The header word count and the metrics panel must agree on what a word is.
 * They did not before this module existed: the header counted whitespace runs,
 * so a hyphenated compound was one word, while the metrics tokenizer saw two.
 */
describe("the one word definition", () => {
  it("counts punctuation-separated words the same way in the header and the metrics", () => {
    // The old header count split on whitespace and saw one word here; the
    // metrics tokenizer saw two.
    expect(wordCount("one,two\n")).toBe(countWords("one,two"));
    expect(wordCount("one,two\n")).toBe(2);
  });

  it("counts a hyphenated compound as one word in both", () => {
    expect(wordCount("well-known\n")).toBe(countWords("well-known"));
    expect(wordCount("well-known\n")).toBe(1);
  });

  it("ignores Markdown markers and inline syntax in both", () => {
    expect(wordCount("**bold** and `code`\n")).toBe(3);
    expect(countWords("**bold** and `code`")).toBe(3);
  });
});
