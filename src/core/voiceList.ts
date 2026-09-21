import type { AnchorDraft, Interval } from "./finding";
import { literalTermSpans } from "./literalTerms";

/**
 * The Voice list: the words and phrases the Writer has declared as theirs, which
 * no Pass may flag as a problem (CONTEXT.md). It is data about the Writer's
 * vocabulary, never prose: it is never a rewrite and it inserts nothing into a
 * Document.
 *
 * A rule Pass drops any match inside an entry outright (story 150). A model Pass
 * is told about the list in its request (story 151), and any model Finding that
 * still duplicates an entry is annotated rather than hidden (story 152), so a
 * model that ignored the list stays visible.
 */

/**
 * A stored or submitted value as the Voice list: strings only, trimmed,
 * internal whitespace collapsed, blanks dropped, and case-insensitive
 * duplicates removed. A non-array, or an array holding anything else, reads as
 * the empty list rather than throwing: the setting is Writer data, and a bad row
 * must not take the app down.
 */
export function normalizeVoiceList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string") continue;
    const trimmed = normalizeEntry(candidate);
    if (trimmed === "") continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(trimmed);
  }
  return entries;
}

/** One entry, trimmed and with internal whitespace collapsed to single spaces. */
function normalizeEntry(entry: string): string {
  return entry.trim().replace(/\s+/g, " ");
}

/**
 * The Voice list as a model instruction: the standing clause plus the entries as
 * a list. The list is presented as data, never as prose, and it never proposes a
 * rewrite — it only asks the model not to report these words as problems.
 */
export function voiceListClause(voiceList: string[]): string {
  return (
    "The Writer has declared the following words and phrases as their own voice. " +
    "Do not report them as problems:\n" +
    voiceList.map((entry) => `- ${entry}`).join("\n")
  );
}

/**
 * Every Voice-list entry occurrence in the canonical string, as half-open
 * intervals. Entries are normalised and matched by the same literal-term engine
 * the rule passes use: longest first, case-insensitive, on word boundaries and
 * with flexible internal whitespace.
 */
export function voiceListIntervals(canonical: string, voiceList: string[]): Interval[] {
  const entries = voiceList.map(normalizeEntry);
  return literalTermSpans(canonical, entries).map(({ quote, offset }) => ({
    start: offset,
    end: offset + quote.length,
  }));
}

/** Whether a resolved interval sits inside one of the entry intervals. */
export function isInsideVoiceList(interval: Interval, entries: Interval[]): boolean {
  return entries.some((entry) => interval.start >= entry.start && interval.end <= entry.end);
}

/**
 * The rule-side half of the Voice list (story 150): every match whose span sits
 * inside a Voice-list entry is dropped outright. A match that merely overlaps an
 * entry, or that contains one, is not silenced — the entry is what the Writer
 * declared, and the rule is about a span inside it.
 */
export function filterVoiceMatches<T extends AnchorDraft>(
  matches: T[],
  canonical: string,
  voiceList: string[],
): T[] {
  if (voiceList.length === 0) return matches;
  const entries = voiceListIntervals(canonical, voiceList);
  if (entries.length === 0) return matches;
  return matches.filter(
    (match) =>
      !isInsideVoiceList(
        { start: match.offset, end: match.offset + match.quote.length },
        entries,
      ),
  );
}
