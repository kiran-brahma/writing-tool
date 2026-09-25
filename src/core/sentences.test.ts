import { describe, expect, it } from "vitest";
import { leadingSyntaxLength, splitSentences } from "./sentences";

describe("splitSentences", () => {
  it("splits on sentence-ending punctuation", () => {
    const sentences = splitSentences("One. Two! Three?\n");

    expect(sentences.map((sentence) => sentence.text.trim())).toEqual(["One.", "Two!", "Three?"]);
  });

  it("keeps offsets that index back into the canonical string", () => {
    const canonical = "Alpha. Beta gamma.\n";
    const sentences = splitSentences(canonical);

    for (const sentence of sentences) {
      expect(canonical.slice(sentence.start, sentence.end)).toBe(sentence.text);
    }
    expect(sentences[1].start).toBe(6);
    expect(sentences[1].text.trim()).toBe("Beta gamma.");
  });

  it("does not split a decimal point", () => {
    const sentences = splitSentences("Pi is 3.14 roughly. Done.\n");

    expect(sentences.map((sentence) => sentence.text.trim())).toEqual([
      "Pi is 3.14 roughly.",
      "Done.",
    ]);
  });

  it("skips a heading, and skips an ordered-list marker", () => {
    const sentences = splitSentences("# A heading\n1. First item. Second sentence.\n");

    expect(sentences.map((sentence) => sentence.text.trim())).toEqual([
      "First item.",
      "Second sentence.",
    ]);
  });

  it("treats each block-quote line as prose", () => {
    const sentences = splitSentences("> Quoted words.\n");

    expect(sentences.map((sentence) => sentence.text.trim())).toEqual(["Quoted words."]);
  });

  it("does not split on a backslash-escaped period", () => {
    const sentences = splitSentences("1\\. First, we begin. Then more.\n");

    expect(sentences.map((sentence) => sentence.text.trim())).toEqual([
      "1\\. First, we begin.",
      "Then more.",
    ]);
  });

  it("splits after an escaped period that is not a list marker", () => {
    // The Writer typed a literal backslash, which the renderer escapes as \\.
    // The period after it is a real sentence end, unlike the escaped marker
    // period in "1\\. not a list".
    const sentences = splitSentences("He typed a backslash \\. Then he stopped.\n");

    expect(sentences.map((sentence) => sentence.text.trim())).toEqual([
      "He typed a backslash \\.",
      "Then he stopped.",
    ]);
  });

  it("skips a fenced code block, which is not prose", () => {
    const sentences = splitSentences("Prose one.\n\n```ts\nconst x = 1;\n```\n\nProse two.\n");

    expect(sentences.map((sentence) => sentence.text.trim())).toEqual([
      "Prose one.",
      "Prose two.",
    ]);
  });

  it("returns nothing for empty or marker-only text", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("\n\n")).toEqual([]);
  });
});

describe("leadingSyntaxLength", () => {
  it("measures each block marker the canonical renderer emits", () => {
    expect(leadingSyntaxLength("# Heading")).toBe(2);
    expect(leadingSyntaxLength("> Quote")).toBe(2);
    expect(leadingSyntaxLength("- item")).toBe(2);
    expect(leadingSyntaxLength("12. item")).toBe(4);
    expect(leadingSyntaxLength("plain prose")).toBe(0);
  });
});
