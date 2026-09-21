import { describe, expect, it } from "vitest";
import {
  documentMetrics,
  isAbstractNoun,
  isAdverb,
  isBeVerb,
  isPreposition,
  lardFactor,
  paragraphShapeMetrics,
} from "./metrics";
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
      beVerbCount: 0,
      beVerbDensity: 0,
      prepositionCount: 0,
      prepositionDensity: 0,
      abstractNounCount: 0,
      abstractNounDensity: 0,
    });
  });
});

describe("diagnostic metrics", () => {
  it("counts be-verbs and their density per hundred words", () => {
    // 8 words, 3 be-verbs ("is", "was", "be").
    const metrics = documentMetrics("She is here. It was a be thing.\n");

    expect(metrics.wordCount).toBe(8);
    expect(metrics.beVerbCount).toBe(3);
    expect(metrics.beVerbDensity).toBeCloseTo((3 / 8) * 100);
  });

  it("counts prepositions and their density per hundred words", () => {
    // 10 words, 3 prepositions ("on", "under", "with").
    const metrics = documentMetrics("Put it on the table, under the lamp, with care.\n");

    expect(metrics.wordCount).toBe(10);
    expect(metrics.prepositionCount).toBe(3);
    expect(metrics.prepositionDensity).toBeCloseTo((3 / 10) * 100);
  });

  it("counts abstract nouns by suffix and their density per hundred words", () => {
    // 11 words; "implementation" (-tion), "improvement" (-ment) and "happiness"
    // (-ness) match, while "nation" is too short for the -tion rule.
    const metrics = documentMetrics(
      "The implementation shows an improvement in the happiness of the nation.\n",
    );

    expect(metrics.wordCount).toBe(11);
    expect(metrics.abstractNounCount).toBe(3);
    expect(metrics.abstractNounDensity).toBeCloseTo((3 / 11) * 100);
  });

  it("does not count code, headings or their syntax as prose", () => {
    const metrics = documentMetrics(
      "# Heading is a label\n\n```ts\nconst is = on;\n```\n\nA be here.\n",
    );

    expect(metrics.beVerbCount).toBe(1);
    expect(metrics.prepositionCount).toBe(0);
    expect(metrics.abstractNounCount).toBe(0);
  });

  it("is deterministic for the same canonical string", () => {
    const canonical =
      "The consideration of an option is a movement toward happiness under pressure.\n";
    // Frozen expected counts, so the assertion cannot agree with the code by
    // recomputing it: 12 words, 1 be-verb ("is"), 3 prepositions, 3 abstract nouns.
    expect(documentMetrics(canonical).beVerbCount).toBe(1);
    expect(documentMetrics(canonical).prepositionCount).toBe(3);
    expect(documentMetrics(canonical).abstractNounCount).toBe(3);
    expect(documentMetrics(canonical)).toEqual(documentMetrics(canonical));
  });
});

describe("metric classifiers", () => {
  it("recognises the forms of be and rejects a word that merely contains one", () => {
    expect(isBeVerb("is")).toBe(true);
    expect(isBeVerb("Been")).toBe(true);
    expect(isBeVerb("being")).toBe(true);
    expect(isBeVerb("table")).toBe(false);
    expect(isBeVerb("island")).toBe(false);
  });

  it("recognises a preposition and rejects a plain noun", () => {
    expect(isPreposition("under")).toBe(true);
    expect(isPreposition("Between")).toBe(true);
    expect(isPreposition("table")).toBe(false);
  });

  it("recognises an abstract noun by suffix, with a floor on the word length", () => {
    expect(isAbstractNoun("implementation")).toBe(true);
    expect(isAbstractNoun("capitalism")).toBe(true);
    expect(isAbstractNoun("nation")).toBe(false);
    expect(isAbstractNoun("city")).toBe(false);
  });
});

describe("lardFactor", () => {
  it("reports the share of the earlier Revision's words that were cut", () => {
    expect(lardFactor("one two three four", "one two")).toBeCloseTo(0.5);
    expect(lardFactor("one two", "one two")).toBe(0);
  });

  it("is negative when the later Revision adds words", () => {
    expect(lardFactor("one two", "one two three four")).toBe(-1);
  });

  it("returns one when everything is cut and zero for an empty before", () => {
    expect(lardFactor("one two", "")).toBe(1);
    expect(lardFactor("", "one two")).toBe(0);
  });

  it("returns the same number for the same inputs", () => {
    const before = "one two three four";
    const after = "one two three";
    // (4 − 3) / 4, frozen rather than recomputed, so the test can disagree.
    expect(lardFactor(before, after)).toBeCloseTo(0.25);
    expect(lardFactor(before, after)).toBe(lardFactor(before, after));
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
