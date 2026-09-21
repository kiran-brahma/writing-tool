/**
 * Literal-term matching shared by the rule engine and the Voice list, so the
 * two cannot drift in escaping, whitespace handling or word boundaries. A rule
 * term and a Voice-list entry are matched the same way: case-insensitively, on
 * word boundaries, with a phrase winning over any word inside it.
 */

/** One configured term's occurrence: the matched text and its offset. */
export interface LiteralTermSpan {
  quote: string;
  offset: number;
}

/**
 * Configured terms, trimmed, deduplicated and ordered longest-first so a phrase
 * wins over any word inside it.
 */
export function cleanTerms(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].sort(
    (a, b) => b.length - a.length,
  );
}

/**
 * A configured term as a word-boundary pattern, case handled by the caller's
 * flags. Whitespace inside a term is a space or a tab, never a newline: the
 * canonical string separates blocks with blank lines, so a phrase must not match
 * across two of them.
 */
export function termPattern(term: string): string {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[ \t]+/g, "[ \\t]+");
  return `\\b${escaped}\\b`;
}

/**
 * Every configured term in the canonical string, in document order. Longer
 * terms are tried first so a phrase such as "of course" wins over any word in
 * it, and matching is case-insensitive with word boundaries so "just" does not
 * fire inside "justice". The regex engine consumes each match, so two configured
 * terms can never flag the same span.
 */
export function literalTermSpans(canonical: string, terms: string[]): LiteralTermSpan[] {
  const cleaned = cleanTerms(terms);
  if (cleaned.length === 0) return [];

  const pattern = new RegExp(cleaned.map(termPattern).join("|"), "gi");
  const spans: LiteralTermSpan[] = [];
  for (const match of canonical.matchAll(pattern)) {
    const start = match.index;
    if (start === undefined) continue;
    spans.push({ quote: match[0], offset: start });
  }
  return spans;
}
