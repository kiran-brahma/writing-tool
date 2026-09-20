/**
 * The one word-token pattern. Prose reaches the engine as the canonical string,
 * where a Writer's keyboard can leave a straight or curly apostrophe and a
 * hyphen inside a word. The rule engine and the metrics panel must agree on what
 * a word is, or a repetition finding and the adverb density would count
 * different prose; this pattern is their single definition.
 */
const WORD_SOURCE = "[\\p{L}\\p{N}][\\p{L}\\p{N}'’‘-]*";

function wordPattern(): RegExp {
  return new RegExp(WORD_SOURCE, "gu");
}

/** A word and its offset in the string it came from. */
export interface WordToken {
  value: string;
  offset: number;
}

/** Words in a string, in document order, with their offsets. */
export function tokenizeWords(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  for (const match of text.matchAll(wordPattern())) {
    tokens.push({ value: match[0], offset: match.index });
  }
  return tokens;
}

/** Words in a string, by the one definition above. */
export function countWords(text: string): number {
  return tokenizeWords(text).length;
}
