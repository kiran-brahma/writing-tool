import { canonicalBlocks } from "./canonicalText";
import type { DocTree } from "./docTree";
import { splitSentences, type Sentence } from "./sentences";
import { countWords, tokenizeWords } from "./tokens";
import { wordDiff, type WordDiffSegment } from "./wordDiff";

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
 * - Be-verbs are the forms of *be*: `am`, `is`, `are`, `was`, `were`, `be`,
 *   `being`, `been`. Contractions are one token to the tokenizer, so "it's" is
 *   not split into "it" and "is"; the count is a rule, not a parser.
 * - Prepositions are a fixed list of common prepositions. A homograph that is
 *   sometimes a preposition and sometimes not ("to", "as", "for") is counted
 *   as one here, the way Lanham's Paramedic Method circles it.
 * - Abstract nouns are words ending in a nominalization suffix, at least four
 *   characters longer than the suffix, the same floor the nominalizations rule
 *   applies. This overlaps that pass on purpose: the metric is a trend, not a
 *   list of instances.
 * - Density is per 100 words for every count on this interface, so the panel's
 *   numbers are comparable.
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
  beVerbCount: number;
  /** Be-verbs per 100 words. */
  beVerbDensity: number;
  prepositionCount: number;
  /** Prepositions per 100 words. */
  prepositionDensity: number;
  abstractNounCount: number;
  /** Abstract nouns per 100 words. */
  abstractNounDensity: number;
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
  // Every count is read over the same prose the lengths are, so a count and the
  // word total behind its density cannot disagree about what text is prose.
  const adverbCount = countInSentences(sentences, isAdverb);
  const beVerbCount = countInSentences(sentences, isBeVerb);
  const prepositionCount = countInSentences(sentences, isPreposition);
  const abstractNounCount = countInSentences(sentences, isAbstractNoun);

  return {
    sentenceCount,
    wordCount,
    sentenceLengths: lengths,
    meanSentenceLength,
    sentenceLengthVariance,
    longestSentence,
    adverbCount,
    adverbDensity: perHundredWords(adverbCount, wordCount),
    beVerbCount,
    beVerbDensity: perHundredWords(beVerbCount, wordCount),
    prepositionCount,
    prepositionDensity: perHundredWords(prepositionCount, wordCount),
    abstractNounCount,
    abstractNounDensity: perHundredWords(abstractNounCount, wordCount),
  };
}

/**
 * The Lard Factor between two Revisions: the share of the earlier Revision's
 * words that the later one removes, `(before − after) / before`, read from the
 * word-level diff so the number and the visible diff cannot disagree. A negative
 * factor means the later Revision is longer. An empty "before" has no share to
 * take, so it returns 0. It is display only: a signal, not a verdict, and
 * nothing gates on it.
 */
export function lardFactor(before: string, after: string): number {
  return lardFactorOfDiff(wordDiff(before, after));
}

/**
 * `lardFactor` read from a word diff the caller already holds. The diff is the
 * expensive part — between a Writer's oldest and newest Revision it can take
 * seconds — so a view that shows the diff reads the number from the same one
 * rather than diffing the pair twice.
 */
export function lardFactorOfDiff(diff: WordDiffSegment[]): number {
  let beforeWords = 0;
  let afterWords = 0;
  for (const segment of diff) {
    const words = countWords(segment.value);
    if (segment.kind !== "added") beforeWords += words;
    if (segment.kind !== "removed") afterWords += words;
  }

  return beforeWords === 0 ? 0 : (beforeWords - afterWords) / beforeWords;
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

/**
 * The forms of *be*. This list is deliberately fixed and independent of the
 * passive rule's editable auxiliary config, so the metric stays a stable
 * diagnostic while the Writer edits that rule.
 */
const BE_VERBS = new Set(["am", "is", "are", "was", "were", "be", "being", "been"]);

export function isBeVerb(token: string): boolean {
  return BE_VERBS.has(token.toLowerCase());
}

/**
 * Common prepositions. A word that is only sometimes a preposition is counted
 * anyway, because the method circles the word, not its parse.
 */
const PREPOSITIONS = new Set([
  "about",
  "above",
  "across",
  "after",
  "against",
  "along",
  "alongside",
  "amid",
  "amidst",
  "among",
  "amongst",
  "around",
  "as",
  "at",
  "atop",
  "before",
  "behind",
  "below",
  "beneath",
  "beside",
  "besides",
  "between",
  "beyond",
  "by",
  "concerning",
  "despite",
  "down",
  "during",
  "except",
  "excluding",
  "for",
  "from",
  "in",
  "including",
  "inside",
  "into",
  "like",
  "minus",
  "near",
  "notwithstanding",
  "of",
  "off",
  "on",
  "onto",
  "opposite",
  "out",
  "outside",
  "over",
  "past",
  "per",
  "plus",
  "regarding",
  "round",
  "since",
  "than",
  "through",
  "throughout",
  "till",
  "to",
  "toward",
  "towards",
  "under",
  "underneath",
  "unlike",
  "until",
  "unto",
  "up",
  "upon",
  "versus",
  "via",
  "with",
  "within",
  "without",
  "worth",
]);

export function isPreposition(token: string): boolean {
  return PREPOSITIONS.has(token.toLowerCase());
}

/**
 * The abstract-noun suffixes from the Sword/Williams/Lanham diagnostic set,
 * plus `sion` and `ancy`, which the nominalizations rule also counts. This list
 * is deliberately fixed and independent of that rule's editable suffix config,
 * so the metric stays a stable diagnostic. A word must be at least four
 * characters longer than the suffix, the same floor the rule applies: "nation"
 * and "city" do not fire, while "implementation" and "capitalism" do.
 */
const ABSTRACT_NOUN_SUFFIXES = [
  "tion",
  "sion",
  "ment",
  "ance",
  "ence",
  "ency",
  "ancy",
  "ity",
  "ness",
  "ism",
];

export function isAbstractNoun(token: string): boolean {
  const lower = token.toLowerCase();
  return ABSTRACT_NOUN_SUFFIXES.some(
    (suffix) => lower.endsWith(suffix) && lower.length >= suffix.length + 4,
  );
}

/** How many words in the prose satisfy a classifier. */
function countInSentences(sentences: Sentence[], predicate: (token: string) => boolean): number {
  let count = 0;
  for (const sentence of sentences) {
    for (const token of tokenizeWords(sentence.text)) {
      if (predicate(token.value)) count += 1;
    }
  }
  return count;
}

/** A count per hundred words, zero when there are no words to divide by. */
function perHundredWords(count: number, wordCount: number): number {
  return wordCount === 0 ? 0 : (count / wordCount) * 100;
}
