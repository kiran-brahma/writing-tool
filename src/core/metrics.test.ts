import { describe, expect, it } from "vitest";
import { documentMetrics, isAdverb, paragraphShapeMetrics } from "./metrics";
import { parseCanonical } from "./parseCanonical";
import { countWords } from "./tokens";

describe("documentMetrics", () => {
  it("reports sentence count, mean length, variance and longest sentence", () => {
    // Lengths 3, 5, 1 → mean 3, variance ((0)+(4)+(4))/3.
    const metrics = documentMetrics("one two three. one two three four five. one.\n");

    expect(metrics.sentenceCount).toBe(3);
    expect(metrics.wordCount).toBe(9);
    expect(metrics.meanSentenceLength).toBe(3);
    expect(metrics.sentenceLengthVariance).toBeCloseTo(8 / 3);
    expect(metrics.longestSentence).toBe(5);
    expect(metrics.sentenceLengths).toEqual([3, 5, 1]);
  });

  it("measures adverb density per hundred words", () => {
    // 7 words, 2 adverbs ("quickly", "very").
    const metrics = documentMetrics("She quickly ran. She is very fast.\n");

    expect(metrics.wordCount).toBe(7);
    expect(metrics.adverbCount).toBe(2);
    expect(metrics.adverbDensity).toBeCloseTo((2 / 7) * 100);
  });

  it("does not count a fenced code block as prose", () => {
    const metrics = documentMetrics("A calm sentence.\n\n```ts\nconst x = slowly(1);\n```\n");

    expect(metrics.sentenceCount).toBe(1);
    expect(metrics.wordCount).toBe(3);
    expect(metrics.adverbCount).toBe(0);
  });

  it("is deterministic", () => {
    const canonical = "Some words here. More words there, slowly.\n";

    expect(documentMetrics(canonical)).toEqual(documentMetrics(canonical));
  });

  it("returns zeros for empty prose rather than NaN", () => {
    const metrics = documentMetrics("\n");

    expect(metrics).toEqual({
      sentenceCount: 0,
      wordCount: 0,
      sentenceLengths: [],
      meanSentenceLength: 0,
      sentenceLengthVariance: 0,
      longestSentence: 0,
      adverbCount: 0,
      adverbDensity: 0,
    });
  });
});

describe("paragraphShapeMetrics (A3)", () => {
  it("reports each Paragraph's sentence count and the longest uniform run", () => {
    // Three Paragraphs of two sentences each in a row, then a heading, then a
    // single-sentence Paragraph.
    const canonical =
      "One. Two.\n\nThree. Four.\n\nFive. Six.\n\n# Heading\n\nSeven.\n";
    const shape = paragraphShapeMetrics(parseCanonical(canonical));

    expect(shape.paragraphSentenceCounts).toEqual([2, 2, 2, 1]);
    expect(shape.longestUniformParagraphRun).toBe(3);
  });

  it("breaks a uniform run at a non-Paragraph block", () => {
    const canonical = "One.\n\nTwo.\n\n> A quote.\n\nThree.\n";
    const shape = paragraphShapeMetrics(parseCanonical(canonical));

    expect(shape.paragraphSentenceCounts).toEqual([1, 1, 1]);
    expect(shape.longestUniformParagraphRun).toBe(2);
  });

  it("is deterministic", () => {
    const tree = parseCanonical("One. Two.\n\nThree. Four.\n");

    expect(paragraphShapeMetrics(tree)).toEqual(paragraphShapeMetrics(tree));
  });
});

describe("countWords", () => {
  it("counts words and ignores Markdown syntax", () => {
    expect(countWords("**bold** and `code`\n")).toBe(3);
  });
});

describe("isAdverb", () => {
  it("accepts a long -ly word and a listed non-ly adverb", () => {
    expect(isAdverb("slowly")).toBe(true);
    expect(isAdverb("very")).toBe(true);
  });

  it("rejects a short -ly word and a plain noun", () => {
    expect(isAdverb("ly")).toBe(false);
    expect(isAdverb("table")).toBe(false);
  });
});
