import { canonicalBlocks } from "./canonicalText";
import type { DocTree } from "./docTree";
import { splitSentences } from "./sentences";
import { countWords, tokenizeWords } from "./tokens";

/**
 * Document rhythm metrics: sentence length and its variance, and adverb
 * density. These are shown in the metrics panel so a monotone rhythm is visible
 * rather than felt. Pure and deterministic; the same canonical string always
 * yields the same numbers.
 *
 * Definitions, recorded because the panel has to mean something:
 * - A sentence is what `splitSentences` yields.
 * - Sentence length is its word count.
 * - Variance is the population variance of the sentence lengths.
 * - Adverbs are `-ly` words of four letters or more, plus a short list of
 *   common adverbs that do not end in `-ly`. It is a rule, not a parser, so a
 *   noun like "family" counts: the number is a signal, not a verdict.
 * - Adverb density is adverbs per 100 words.
 */
export interface DocumentMetrics {
  sentenceCount: number;
  wordCount: number;
  /** Each sentence's word count, in document order, so a run of equal lengths is visible. */
  sentenceLengths: number[];
  meanSentenceLength: number;
  /** Population variance of sentence lengths. */
  sentenceLengthVariance: number;
  longestSentence: number;
  adverbCount: number;
  /** Adverbs per 100 words. */
  adverbDensity: number;
}

/**
 * A3 uniform paragraph shape. It reads the Document's blocks, not the string,
 * because the block structure is the tree's to know; re-parsing the canonical
 * string to recover it would be a second walk that can disagree with the first.
 */
export interface ParagraphShapeMetrics {
  /** Each top-level Paragraph's sentence count, in document order. */
  paragraphSentenceCounts: number[];
  /**
   * The longest run of consecutive Paragraphs that share a sentence count. It is
   * a metric, not a pass, because a run of equal counts is a rhythm to see
   * rather than a fault to flag.
   */
  longestUniformParagraphRun: number;
}

/** Common adverbs that do not end in `-ly`, so the suffix rule would miss them. */
const NON_LY_ADVERBS = new Set([
  "very",
  "quite",
  "rather",
  "often",
  "always",
  "never",
  "almost",
  "just",
  "too",
  "also",
  "well",
  "soon",
  "here",
  "there",
  "now",
  "then",
]);

export function documentMetrics(canonical: string): DocumentMetrics {
  const sentences = splitSentences(canonical);
  const lengths = sentences.map((sentence) => countWords(sentence.text));
  const wordCount = lengths.reduce((total, length) => total + length, 0);
  const sentenceCount = lengths.length;
  const meanSentenceLength = sentenceCount === 0 ? 0 : wordCount / sentenceCount;
  const sentenceLengthVariance =
    sentenceCount === 0
      ? 0
      : lengths.reduce(
          (total, length) => total + (length - meanSentenceLength) ** 2,
          0,
        ) / sentenceCount;
  const longestSentence = lengths.reduce((longest, length) => Math.max(longest, length), 0);
  // Adverbs are counted over the same prose the lengths are, so the numerator
  // and denominator of the density cannot disagree about what text is prose.
  const adverbCount = sentences.reduce(
    (total, sentence) => total + countAdverbs(sentence.text),
    0,
  );

  return {
    sentenceCount,
    wordCount,
    sentenceLengths: lengths,
    meanSentenceLength,
    sentenceLengthVariance,
    longestSentence,
    adverbCount,
    adverbDensity: wordCount === 0 ? 0 : (adverbCount / wordCount) * 100,
  };
}

/**
 * A3 uniform paragraph shape. A non-Paragraph block (a heading, a list, a code
 * fence) breaks a run, because the rhythm A3 names is between adjacent
 * Paragraphs. The deterministic proxy for "shape" is a Paragraph's sentence
 * count: counting grammar is not a rule this tier can make.
 */
export function paragraphShapeMetrics(tree: DocTree): ParagraphShapeMetrics {
  const counts: number[] = [];
  let longestUniformRun = 0;
  let run = 0;
  let previous: number | null = null;

  for (const { block, text } of canonicalBlocks(tree)) {
    if (block.type !== "paragraph") {
      run = 0;
      previous = null;
      continue;
    }
    const count = splitSentences(text).length;
    counts.push(count);
    run = previous === count ? run + 1 : 1;
    previous = count;
    longestUniformRun = Math.max(longestUniformRun, run);
  }

  return { paragraphSentenceCounts: counts, longestUniformParagraphRun: longestUniformRun };
}

export function isAdverb(token: string): boolean {
  const lower = token.toLowerCase();
  if (NON_LY_ADVERBS.has(lower)) return true;
  return lower.length >= 4 && lower.endsWith("ly");
}

function countAdverbs(text: string): number {
  let count = 0;
  for (const token of tokenizeWords(text)) {
    if (isAdverb(token.value)) count += 1;
  }
  return count;
}
