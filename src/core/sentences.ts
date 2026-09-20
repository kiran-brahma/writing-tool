/**
 * Sentence segmentation over the canonical string. Both the repetition rule
 * (repeated sentence openers) and the metrics panel (sentence length and
 * variance) need the same notion of a sentence, so it lives here once rather
 * than being re-derived and drifting.
 *
 * The canonical string is Markdown source, so a line's leading block marker
 * (`#`, `>`, `-`, `N.`) is syntax, not prose, and is skipped. A sentence ends at
 * a run of `.`, `!` or `?` followed by whitespace or the end of a line; the
 * lookahead keeps a decimal such as `3.14` from splitting, an escaped `\.` is
 * not a boundary, and stripping the ordered-list marker keeps `1.` from
 * splitting. A fenced code block is skipped entirely, because a code sample is
 * not prose. This is a deterministic rule, not a grammatical analysis: an
 * abbreviation inside a sentence will split it, which the Writer can see through
 * the metrics it produces.
 */

export interface Sentence {
  /** The raw slice of the canonical string, including any trailing spaces. */
  text: string;
  /** Start offset in the canonical string. */
  start: number;
  /** End offset, just past the sentence's final character. */
  end: number;
}

const LEADING_BLOCK_SYNTAX = /^\s*(?:#{1,6}\s+|>\s?|-\s+|\d+\.\s+)/;
const HEADING = /^\s*#{1,6}\s+/;
const FENCE = /^`{3,}/;

/** The length of a line's leading Markdown block marker, if any. */
export function leadingSyntaxLength(line: string): number {
  const match = line.match(LEADING_BLOCK_SYNTAX);
  return match === null ? 0 : match[0].length;
}

/** Every sentence in the canonical string, in document order. */
export function splitSentences(canonical: string): Sentence[] {
  const sentences: Sentence[] = [];
  let lineStart = 0;
  let inFence = false;

  for (const line of canonical.split("\n")) {
    const isFence = FENCE.test(line.trimStart());
    if (isFence) inFence = !inFence;
    if (isFence || inFence) {
      lineStart += line.length + 1;
      continue;
    }
    // A heading is a label, not a sentence: counting "# Title" as a two-word
    // sentence would drag the rhythm metrics down. It is not a prose opener
    // either, so the opener sweep skips it too.
    if (HEADING.test(line)) {
      lineStart += line.length + 1;
      continue;
    }

    const offset = leadingSyntaxLength(line);
    collectSentences(line.slice(offset), lineStart + offset, sentences);
    lineStart += line.length + 1;
  }

  return sentences;
}

function collectSentences(segment: string, base: number, out: Sentence[]): void {
  let last = 0;

  for (const match of segment.matchAll(/[.!?]+(?=\s|$)/g)) {
    const start = match.index;
    const end = start + match[0].length;
    // A backslash-escaped period (the renderer escapes a paragraph that would
    // otherwise read as a list marker) is prose, not a sentence end.
    if (segment[start - 1] === "\\") continue;
    out.push({ text: segment.slice(last, end), start: base + last, end: base + end });
    last = end;
  }

  const tail = segment.slice(last);
  if (tail.trim().length > 0) {
    out.push({ text: tail, start: base + last, end: base + segment.length });
  }
}
