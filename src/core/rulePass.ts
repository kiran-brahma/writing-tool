import { resolveAnchor } from "./anchor";
import type { AnchorDraft, Finding } from "./finding";
import { hashPass, type Pass, type RuleConfig } from "./pass";
import { splitSentences, type Sentence } from "./sentences";
import { tokenizeWords } from "./tokens";

/**
 * The rule engine's contract: a pure function from the canonical string plus a
 * Pass to Findings. The analysis is deterministic — the same string and config
 * yield the same matches — and it never touches the Transport, a Connection or a
 * key, so it is useful before the Writer has configured anything, and it can
 * neither praise nor rewrite. Finding ids are minted per run; identity across
 * runs is reconciled in Core, not claimed here.
 *
 * A rule Pass selects its rules by which `RuleConfig` fields it carries: a pass
 * with `hedges` runs the hedge sweep, a pass with `wordiness` runs the wordiness
 * sweep, and a pass carrying both runs both. The Starter pack ships one field
 * per pass, and the Writer's edits to those fields are the whole configuration.
 */

/** One deterministic problem a rule found, before it is shaped into a Finding. */
export interface RuleMatch extends AnchorDraft {
  issue: string;
  diagnosis: string;
  pattern?: string;
}

export interface RuleRunContext {
  at: number;
  /** The Revision the Run is recorded against. */
  revisionId: string;
}

/**
 * A rule Pass over the canonical string. The hedge sweep runs automatically on
 * save; #6 adds the remaining rule Passes behind the same entry point.
 *
 * `matches` is the analysis phase's output. A caller that already computed it —
 * Storage does, because it needs to know whether any Pass matched before it
 * decides to take a Revision — passes it back so the document is analysed once.
 * The default keeps the simple call site honest.
 */
export function runRulePass(
  canonical: string,
  pass: Pass,
  context: RuleRunContext,
  matches: RuleMatch[] = ruleMatches(canonical, pass),
): Finding[] {
  return findingsFromMatches(matches, canonical, pass, context);
}

/** The deterministic matches a rule Pass finds, in document order. */
export function ruleMatches(canonical: string, pass: Pass): RuleMatch[] {
  const config: RuleConfig = pass.ruleConfig ?? {};
  const matches: RuleMatch[] = [];

  if (config.hedges !== undefined) matches.push(...matchHedges(canonical, config.hedges));
  if (config.nominalizationSuffixes !== undefined) {
    matches.push(...matchNominalizations(canonical, config.nominalizationSuffixes));
  }
  if (config.openers !== undefined) matches.push(...matchOpeners(canonical, config.openers));
  if (config.wordiness !== undefined) matches.push(...matchWordiness(canonical, config.wordiness));
  if (config.repetitionWindow !== undefined) {
    matches.push(...matchRepetition(canonical, config.repetitionWindow));
  }
  if (config.bannedWords !== undefined) {
    matches.push(...matchBannedWords(canonical, config.bannedWords));
  }
  if (config.wornPhrases !== undefined) {
    matches.push(...matchWornPhrases(canonical, config.wornPhrases));
  }
  if (config.printedFigures !== undefined) {
    matches.push(...matchPrintedFigures(canonical, config.printedFigures));
  }
  if (config.longWords !== undefined) {
    matches.push(...matchLongWords(canonical, config.longWords));
  }
  if (config.cuttableWords !== undefined) {
    matches.push(...matchCuttableWords(canonical, config.cuttableWords));
  }
  if (config.passiveAuxiliaries !== undefined) {
    matches.push(...matchPassive(canonical, config.passiveAuxiliaries));
  }
  if (config.jargonWords !== undefined) {
    matches.push(...matchJargonWords(canonical, config.jargonWords));
  }

  return matches.sort((a, b) => a.offset - b.offset);
}

/** Shapes matches into Findings, computing each Anchor's state by resolution. */
function findingsFromMatches(
  matches: RuleMatch[],
  canonical: string,
  pass: Pass,
  context: RuleRunContext,
): Finding[] {
  const promptHash = hashPass(pass);
  return matches.map((match) => {
    // State is computed from resolution, never authored: the match carries a
    // quote and an offset, and only `resolveAnchor` decides attached/orphaned.
    const interval = resolveAnchor({ quote: match.quote, offset: match.offset }, canonical);
    return {
      // Random, not content-derived: the Findings table is keyed by id across
      // every Document, so two Documents holding the same prose would collide.
      id: crypto.randomUUID(),
      passId: pass.id,
      promptHash,
      anchor: {
        quote: match.quote,
        offset: match.offset,
        state: interval === null ? "orphaned" : "attached",
      },
      issue: match.issue,
      diagnosis: match.diagnosis,
      ...(match.pattern === undefined ? {} : { pattern: match.pattern }),
      status: "open",
      provenance: {
        // A rule Pass is not a Provider and has no model; `local`/`rule` says so
        // plainly rather than borrowing a Provider's identity.
        providerId: "local",
        model: "rule",
        at: context.at,
        revisionId: context.revisionId,
      },
    } satisfies Finding;
  });
}

// ---------------------------------------------------------------------------
// Literal-term rules: hedges and wordiness
// ---------------------------------------------------------------------------

interface TermDescription {
  issue: string;
  diagnosis: string;
  pattern?: string;
}

/**
 * Configured terms, trimmed, deduplicated and ordered longest-first so a phrase
 * wins over any word inside it. Shared by the literal-term and opener sweeps.
 */
function uniqueTerms(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].sort(
    (a, b) => b.length - a.length,
  );
}

/**
 * Every configured term in the canonical string, in document order. Longer
 * terms are tried first so a phrase such as "of course" wins over any word in
 * it, and matching is case-insensitive with word boundaries so "just" does not
 * fire inside "justice". The regex engine consumes each match, so two
 * configured terms can never flag the same span.
 */
function matchLiteralTerms(
  canonical: string,
  terms: string[],
  describe: (quote: string, term: string) => TermDescription,
): RuleMatch[] {
  const cleaned = uniqueTerms(terms);
  if (cleaned.length === 0) return [];

  const pattern = new RegExp(cleaned.map(toTermPattern).join("|"), "gi");
  const matches: RuleMatch[] = [];

  for (const match of canonical.matchAll(pattern)) {
    const start = match.index;
    if (start === undefined) continue;
    const quote = match[0];
    const normalized = quote.replace(/\s+/g, " ");
    const term =
      cleaned.find((candidate) => candidate.toLowerCase() === normalized.toLowerCase()) ?? normalized;
    matches.push({ quote, offset: start, ...describe(quote, term) });
  }

  return matches;
}

/**
 * Every hedge or intensifier in the canonical string. The hedge list is data,
 * because the Writer's overused words are the Writer's to name.
 */
function matchHedges(canonical: string, hedges: string[]): RuleMatch[] {
  return matchLiteralTerms(canonical, hedges, (quote, term) => ({
    issue: `Hedge or intensifier: "${quote.replace(/\s+/g, " ")}"`,
    diagnosis:
      "Hedges and intensifiers drain the force from the sentence they sit in. " +
      "Cut it, or say what you actually mean.",
    pattern: term.toLowerCase(),
  }));
}

/**
 * Wordy constructions, reported from the configured `[wordy, replacement]`
 * pairs. The replacement is the Writer's own config data, not model-written
 * prose, and it appears in the diagnosis only — nothing here can enter the
 * Document.
 */
function matchWordiness(canonical: string, pairs: [string, string][]): RuleMatch[] {
  const replacements = new Map(
    pairs.map(([wordy, replacement]) => [wordy.trim().toLowerCase(), replacement.trim()]),
  );
  return matchLiteralTerms(
    canonical,
    pairs.map(([wordy]) => wordy),
    (quote, term) => {
      const replacement = replacements.get(term.toLowerCase()) ?? "";
      return {
        issue: `Wordy construction: "${quote}"`,
        diagnosis:
          replacement === ""
            ? "This phrasing can usually be cut or shortened."
            : `"${term}" can usually be just "${replacement}".`,
        pattern: term.toLowerCase(),
      };
    },
  );
}

/**
 * Words and short phrases a house style bans outright: the Prose Linter's
 * always-empty list and the Economist guide's jargon. The list is data. The
 * diagnosis names the problem and never proposes a replacement word, because a
 * rule may mark but not write (ADR-0003); where the source offers a specific
 * shorter equivalent, that pairing lives in a Pass's `wordiness` config.
 */
function matchBannedWords(canonical: string, bannedWords: string[]): RuleMatch[] {
  return matchLiteralTerms(canonical, bannedWords, (quote, term) => ({
    issue: `Banned word: "${quote.replace(/\s+/g, " ")}"`,
    diagnosis:
      "This word is on the house avoid list: it inflates or obscures without adding detail. " +
      "Name the concrete thing instead.",
    pattern: term.toLowerCase(),
  }));
}

/**
 * Clichés, jargon metaphors and worn figures of speech. The list is data. As
 * with banned words, the diagnosis never supplies replacement prose: the Writer
 * decides what the phrase becomes.
 */
function matchWornPhrases(canonical: string, wornPhrases: string[]): RuleMatch[] {
  return matchLiteralTerms(canonical, wornPhrases, (quote, term) => ({
    issue: `Worn phrase: "${quote.replace(/\s+/g, " ")}"`,
    diagnosis:
      "A stock figure of speech, worn smooth by overuse. Say what is actually happening.",
    pattern: term.toLowerCase(),
  }));
}

// ---------------------------------------------------------------------------
// George Orwell's five rules
// ---------------------------------------------------------------------------

/**
 * Orwell rule 1: a figure of speech the reader has seen in print. The list is
 * data. The diagnosis names the failure and stops there; the Writer decides what
 * the image becomes.
 */
function matchPrintedFigures(canonical: string, figures: string[]): RuleMatch[] {
  return matchLiteralTerms(canonical, figures, (quote, term) => ({
    issue: `Orwell 1: figure of speech seen in print: "${quote.replace(/\s+/g, " ")}"`,
    diagnosis: "A stock metaphor or simile, not a fresh image.",
    pattern: term.toLowerCase(),
  }));
}

/** Orwell rule 2: a long word where a short one may do. Reported, not replaced. */
function matchLongWords(canonical: string, longWords: string[]): RuleMatch[] {
  return matchLiteralTerms(canonical, longWords, (quote, term) => ({
    issue: `Orwell 2: long word: "${quote.replace(/\s+/g, " ")}"`,
    diagnosis: "A long word where a short one may do.",
    pattern: term.toLowerCase(),
  }));
}

/** Orwell rule 3: a word that can be cut. The rule does not cut it for the Writer. */
function matchCuttableWords(canonical: string, cuttableWords: string[]): RuleMatch[] {
  return matchLiteralTerms(canonical, cuttableWords, (quote, term) => ({
    issue: `Orwell 3: word that can be cut: "${quote.replace(/\s+/g, " ")}"`,
    diagnosis: "It adds length but no meaning.",
    pattern: term.toLowerCase(),
  }));
}

/** Orwell rule 5: jargon, a foreign phrase or a scientific word with a plain equivalent. */
function matchJargonWords(canonical: string, jargonWords: string[]): RuleMatch[] {
  return matchLiteralTerms(canonical, jargonWords, (quote, term) => ({
    issue: `Orwell 5: jargon or foreign word: "${quote.replace(/\s+/g, " ")}"`,
    diagnosis: "Jargon where an everyday English word may do.",
    pattern: term.toLowerCase(),
  }));
}

/**
 * The irregular past participles the -ed/-en test would miss. Engine behaviour,
 * not Rule config: it is what lets the passive rule read "was taken" as well as
 * "was completed".
 */
const IRREGULAR_PARTICIPLES = new Set([
  "born", "broken", "built", "bought", "caught", "chosen", "done", "drawn",
  "driven", "eaten", "fallen", "fed", "felt", "found", "given", "gone", "grown",
  "held", "hidden", "hit", "hurt", "kept", "known", "laid", "led", "left",
  "lost", "made", "meant", "met", "paid", "put", "read", "run", "said", "seen",
  "sent", "set", "shown", "sold", "spent", "split", "spoken", "spread", "stolen",
  "taken", "taught", "thought", "told", "torn", "understood", "used", "written",
]);

/** A word read as a past participle: a common irregular, or an -ed/-en form. */
function isPastParticiple(word: string): boolean {
  if (IRREGULAR_PARTICIPLES.has(word)) return true;
  return word.length >= 5 && (word.endsWith("ed") || word.endsWith("en"));
}

/**
 * Orwell rule 4: a passive construction, read as a configured auxiliary followed
 * by a past participle. The participle is approximated by an -ed/-en ending or a
 * known irregular, so an adjective after "is" ("is tired") can be flagged with
 * "was taken" and the Writer declines it. The rule reports the passive and never
 * supplies the active rewrite; whether the active is available is the Writer's
 * judgment.
 */
function matchPassive(canonical: string, auxiliaries: string[]): RuleMatch[] {
  const cleaned = new Set(uniqueTerms(auxiliaries.map((auxiliary) => auxiliary.toLowerCase())));
  if (cleaned.size === 0) return [];

  const words = tokenizeWords(canonical);
  const matches: RuleMatch[] = [];
  for (let index = 0; index < words.length - 1; index += 1) {
    const auxiliary = words[index];
    if (!cleaned.has(auxiliary.value.toLowerCase())) continue;
    const participle = words[index + 1];
    if (!isPastParticiple(participle.value.toLowerCase())) continue;
    const quote = canonical.slice(auxiliary.offset, participle.offset + participle.value.length);
    matches.push({
      quote,
      offset: auxiliary.offset,
      issue: `Orwell 4: passive construction: "${quote.replace(/\s+/g, " ")}"`,
      diagnosis: "A passive construction; the actor may not be in the sentence.",
      pattern: `${auxiliary.value.toLowerCase()} ${participle.value.toLowerCase()}`,
    });
    index += 1;
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Nominalizations
// ---------------------------------------------------------------------------

/**
 * Words ending in a configured nominalization suffix. The suffix list is data.
 * A word must be at least four characters longer than the suffix, which keeps
 * "tion" from firing on "nation" while still catching "implementation"; it does
 * not make the rule a parser, so a suffix hit can be a false positive the Writer
 * lives with or edits away.
 */
function matchNominalizations(canonical: string, suffixes: string[]): RuleMatch[] {
  const cleaned = uniqueTerms(suffixes.map((suffix) => suffix.toLowerCase()));
  if (cleaned.length === 0) return [];

  const matches: RuleMatch[] = [];
  for (const token of tokenizeWords(canonical)) {
    const word = token.value;
    const lower = word.toLowerCase();
    const suffix = cleaned.find(
      (candidate) => lower.endsWith(candidate) && lower.length >= candidate.length + 4,
    );
    if (suffix === undefined) continue;
    matches.push({
      quote: word,
      offset: token.offset,
      issue: `Nominalization: "${word}"`,
      diagnosis: "An action is buried in a noun. Prefer the verb and let the doing do.",
      pattern: suffix,
    });
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Openers
// ---------------------------------------------------------------------------

const LEADING_INLINE_SYNTAX = /^[\s*_`~]+/;

/**
 * Expletive and throat-clearing openers: sentences that begin with a configured
 * phrase. Anchoring the phrase to a sentence start is the point — "there is"
 * mid-sentence is not throat-clearing — so sentences are segmented first and the
 * configured terms are tried as prefixes, longest first. One opener per sentence.
 */
function matchOpeners(canonical: string, openers: string[]): RuleMatch[] {
  const cleaned = uniqueTerms(openers);
  if (cleaned.length === 0) return [];

  const matches: RuleMatch[] = [];
  for (const sentence of splitSentences(canonical)) {
    const stripped = sentence.text.replace(LEADING_INLINE_SYNTAX, "");
    const leading = sentence.text.length - stripped.length;

    for (const term of cleaned) {
      const pattern = new RegExp(`^${toTermPattern(term)}`, "i");
      const found = stripped.match(pattern);
      if (found === null) continue;
      const quote = found[0];
      matches.push({
        quote,
        offset: sentence.start + leading,
        issue: `Throat-clearing opener: "${quote}"`,
        diagnosis: "The sentence clears its throat before it starts. Begin where the content begins.",
        pattern: term.toLowerCase(),
      });
      break;
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Repetition
// ---------------------------------------------------------------------------

/**
 * Function words that repeat for grammatical reasons, not as a tic. The rule
 * catches a Writer's overused content words, so these never fire. This list is
 * engine behavior rather than Rule config: it is what makes the rule report a
 * repetition instead of every "the".
 */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "nor", "so", "yet", "for", "as", "than",
  "of", "to", "in", "on", "at", "by", "with", "from", "into", "onto", "over", "under",
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did",
  "has", "have", "had", "will", "would", "shall", "should", "can", "could", "may",
  "might", "must", "not", "no", "if", "then", "else", "when", "while", "where",
  "which", "who", "whom", "whose", "what", "why", "how", "that", "this", "these",
  "those", "it", "its", "he", "she", "they", "them", "his", "her", "their", "we",
  "you", "your", "our", "i", "me", "my", "mine", "us", "one", "also", "up", "out",
  // Contractions of those function words. Stored with a straight apostrophe;
  // `normalizeToken` folds a curly one, so either keyboard is covered.
  "don't", "doesn't", "didn't", "can't", "cannot", "couldn't", "won't", "wouldn't",
  "shouldn't", "isn't", "aren't", "wasn't", "weren't", "hasn't", "haven't", "hadn't",
  "it's", "that's", "there's", "here's", "what's", "who's", "he's", "she's", "we're",
  "they're", "you're", "i'm", "i've", "we've", "they've", "you've", "i'll", "we'll",
  "they'll", "you'll", "i'd", "we'd", "they'd", "you'd", "let's",
]);

/** Folds a curly apostrophe to a straight one so the stopword list sees both. */
function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[’‘]/g, "'");
}

/**
 * Repeated words and repeated sentence openers within a window of sentences.
 *
 * A repeated word is a non-stopword token seen again within the window; the
 * *later* occurrence is flagged, so a triple flags twice. A repeated sentence
 * opener is the first content word of two nearby sentences; when an opener
 * repeat and a word repeat land on the same token, the opener diagnosis wins,
 * because naming the tic is more useful than naming the word.
 *
 * "Lemma" from the design is approximated by case-insensitive identity: a rule
 * list matches strings, not meanings, and a stemmer would merge words the Writer
 * did not mean to merge.
 */
function matchRepetition(canonical: string, window: number): RuleMatch[] {
  const sentences = splitSentences(canonical);
  if (sentences.length === 0 || window < 1) return [];

  const openerMatches: RuleMatch[] = [];
  const openerOffsets = new Set<number>();
  const lastOpener = new Map<string, number>();

  sentences.forEach((sentence, index) => {
    const opener = firstContentWord(sentence);
    if (opener === null) return;
    const previous = lastOpener.get(opener.key);
    if (previous !== undefined && index - previous <= window) {
      openerOffsets.add(opener.offset);
      openerMatches.push({
        quote: opener.value,
        offset: opener.offset,
        issue: `Repeated sentence opener: "${opener.value}"`,
        diagnosis: `Sentences keep starting with "${opener.value}". Vary the openings.`,
        pattern: opener.key,
      });
    }
    lastOpener.set(opener.key, index);
  });

  const wordMatches: RuleMatch[] = [];
  const lastWord = new Map<string, number>();
  sentences.forEach((sentence, index) => {
    for (const token of tokens(sentence)) {
      const key = normalizeToken(token.value);
      // Three letters or more, so a short content word like "ran" still counts;
      // the stopword set already removes the function words of that length.
      if (key.length < 3 || STOPWORDS.has(key)) continue;
      const previous = lastWord.get(key);
      if (previous !== undefined && index - previous <= window) {
        wordMatches.push({
          quote: token.value,
          offset: token.offset,
          issue: `Repeated word: "${token.value}"`,
          diagnosis: `"${token.value}" repeats within ${window} sentence${window === 1 ? "" : "s"}. Vary the wording or cut one.`,
          pattern: key,
        });
      }
      lastWord.set(key, index);
    }
  });

  return [...openerMatches, ...wordMatches.filter((match) => !openerOffsets.has(match.offset))].sort(
    (a, b) => a.offset - b.offset,
  );
}

interface Token {
  value: string;
  offset: number;
}

function tokens(sentence: Sentence): Token[] {
  return tokenizeWords(sentence.text).map((token) => ({
    value: token.value,
    offset: sentence.start + token.offset,
  }));
}

function firstContentWord(sentence: Sentence): { value: string; key: string; offset: number } | null {
  for (const token of tokens(sentence)) {
    const key = normalizeToken(token.value);
    if (key.length < 2 || STOPWORDS.has(key)) continue;
    return { value: token.value, key, offset: token.offset };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shared term escaping
// ---------------------------------------------------------------------------

function toTermPattern(term: string): string {
  // Whitespace inside a configured term is a space or a tab, never a newline:
  // canonical blocks are separated by blank lines, so `\s+` could match a
  // phrase across two blocks. Paragraph-internal line breaks already collapse
  // to single spaces, so a literal phrase is always on one line.
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[ \t]+/g, "[ \\t]+");
  return `\\b${escaped}\\b`;
}
