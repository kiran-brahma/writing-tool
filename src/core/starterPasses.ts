import type { Pass, PassScope } from "./pass";

/**
 * The rule Passes that ship with Obelus. Each carries one `RuleConfig` field,
 * and that field is the whole rule: the engine runs the rules a pass configures,
 * so adding a pass here is adding data, not code. The Starter pack is the
 * read-only default; the Writer edits these lists and patterns in the app, and
 * the edits are persisted, so #10's restore action has a known-good pack to
 * restore to.
 *
 * ADR-0003 makes the mechanical tier free and offline, and the Writer's
 * overused words are the Writer's to name.
 */
export const HEDGES_PASS: Pass = {
  id: "hedges",
  name: "Hedges and intensifiers",
  description: "Flags words that soften a claim instead of making it.",
  kind: "rule",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: true,
  ruleConfig: {
    hedges: [
      "very",
      "really",
      "actually",
      "quite",
      "rather",
      "somewhat",
      "basically",
      "literally",
      "simply",
      "just",
      "of course",
      "unfortunately",
      "arguably",
      "I think",
    ],
  },
};

export const NOMINALIZATIONS_PASS: Pass = {
  id: "nominalizations",
  name: "Nominalizations",
  description: "Flags actions buried inside nouns.",
  kind: "rule",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: true,
  ruleConfig: {
    nominalizationSuffixes: [
      "tion",
      "sion",
      "ment",
      "ance",
      "ence",
      "ency",
      "ancy",
      "ity",
      "ness",
    ],
  },
};

export const OPENERS_PASS: Pass = {
  id: "openers",
  name: "Expletive and throat-clearing openers",
  description: "Flags sentences that clear their throat before they start.",
  kind: "rule",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: true,
  ruleConfig: {
    openers: [
      "there is",
      "there are",
      "there was",
      "there were",
      "it is",
      "it was",
      "it is worth noting",
      "it's worth noting",
      "as i mentioned",
      "as a matter of fact",
      "needless to say",
      "to be honest",
      "in my opinion",
    ],
  },
};

export const WORDINESS_PASS: Pass = {
  id: "wordiness",
  name: "Wordy constructions",
  description: "Flags phrases with a shorter equivalent.",
  kind: "rule",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: true,
  ruleConfig: {
    wordiness: [
      ["in order to", "to"],
      ["due to the fact that", "because"],
      ["at this point in time", "now"],
      ["in the event that", "if"],
      ["for the purpose of", "to"],
      ["with regard to", "about"],
      ["a large number of", "many"],
      ["in spite of the fact that", "although"],
      ["the fact that", "that"],
      ["in the near future", "soon"],
    ],
  },
};

export const REPETITION_PASS: Pass = {
  id: "repetition",
  name: "Repeated words and openers",
  description: "Flags words and sentence openings that keep coming back.",
  kind: "rule",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: true,
  ruleConfig: {
    repetitionWindow: 3,
  },
};

/**
 * The prompt shape every paragraph-scope model Pass shares: the task, the
 * Document's placeholders, and the Target with its one-Paragraph context. It is
 * one function so the Starter passes cannot drift apart in the part of the
 * prompt the constitution depends on.
 */
export function paragraphPassPrompt(intro: string, task: string): string {
  return [
    intro,
    "",
    "Title: {{title}}",
    "",
    "Outline (headings only):",
    "{{outline}}",
    "",
    "Context above — this is context, not target:",
    "{{context_above}}",
    "",
    "TARGET PARAGRAPH — analyze only this paragraph:",
    "{{target}}",
    "",
    "Context below — this is context, not target:",
    "{{context_below}}",
    "",
    task,
  ].join("\n");
}

/**
 * The reporting clause every paragraph-scope model Pass shares. It carries the
 * two clauses the constitution harness checks for — no praise and no
 * replacement prose — and it names the Anchor a Finding needs (a quote and its
 * zero-based offset in the Target). One constant rather than one per Pass, so a
 * new Starter pass cannot ship without them and the clauses cannot drift apart.
 */
const PARAGRAPH_REPORTING_CLAUSE =
  "For each problem, quote the exact span from the target, give its zero-based offset within " +
  "the target, a short issue label and a diagnosis. Report only problems in the target " +
  "paragraph. Do not praise the writing and do not suggest replacement prose.";

/**
 * The prompt shape every section-scope model Pass shares: the task and one
 * Section — its heading plus the body that follows it — with the heading
 * outline. The Section is the unit a Reader account is derived from, so the
 * prompt names it as the only target and never hands over a neighbouring one.
 */
export function sectionPassPrompt(intro: string, task: string): string {
  return [
    intro,
    "",
    "Analyze only the section below.",
    "",
    "Title: {{title}}",
    "",
    "Outline (headings only):",
    "{{outline}}",
    "",
    "SECTION:",
    "{{target}}",
    "",
    task,
  ].join("\n");
}

/**
 * The prompt shape every document-scope (structural) model Pass shares: the
 * task and the whole Document. Story 48 is why the Document is here at all — a
 * Pass asked to reason about Paragraph order must be able to see the order. It
 * is one function so the structural passes cannot drift apart in the part of
 * the prompt the constitution depends on, and so the `{{document}}` placeholder
 * is filled for them by construction.
 */
export function documentPassPrompt(intro: string, task: string): string {
  return [
    intro,
    "",
    "Analyze only the document below.",
    "",
    "Title: {{title}}",
    "",
    "Outline (headings only):",
    "{{outline}}",
    "",
    "DOCUMENT:",
    "{{document}}",
    "",
    task,
  ].join("\n");
}

/**
 * The reporting clause every section-scope model Pass shares. It carries the
 * two clauses the constitution harness checks for — no praise and no
 * replacement prose — and names the three Reader-account fields the model must
 * return, so a Reader prompt cannot drop one by accident.
 */
const SECTION_REPORTING_CLAUSE =
  "Return what_this_section_says, what_a_distracted_reader_would_miss and " +
  "gap_between_intent_and_effect. Report only on this section. Do not praise the " +
  "writing and do not suggest replacement prose.";

/**
 * The reporting clause every document-scope model Pass shares. It carries the
 * two clauses the constitution harness checks for — no praise and no
 * replacement prose — and names the Anchor a Finding needs: a quote and its
 * zero-based offset in the whole Document, because the whole Document is the
 * target.
 */
const DOCUMENT_REPORTING_CLAUSE =
  "For each problem, quote the exact span from the document, give its zero-based offset " +
  "within the document, a short issue label and a diagnosis. Report only problems in the " +
  "document. Do not praise the writing and do not suggest replacement prose.";

export interface ConstitutionPromptClause {
  name: string;
  pattern: RegExp;
}

/** Clauses every model prompt keeps, whatever its scope. */
const SHARED_PROMPT_CLAUSES: ConstitutionPromptClause[] = [
  { name: "no praise", pattern: /do not praise/i },
  { name: "no replacement prose", pattern: /do not suggest replacement prose/i },
];

/** The clause that names the one target a Pass's scope is allowed to analyze. */
const SCOPE_PROMPT_CLAUSE: Record<PassScope, ConstitutionPromptClause> = {
  paragraph: { name: "analyze only this paragraph", pattern: /analyze only this paragraph/i },
  section: { name: "analyze only the section", pattern: /analyze only the section/i },
  document: { name: "analyze only the document", pattern: /analyze only the document/i },
};

/**
 * The clauses one model Pass's prompt must keep. A local Pass that names the
 * whole document fails here, and so does a structural Pass that names a
 * paragraph, so the scope and the target the prompt names stay in step. The
 * harness and the Starter-pack test share this one definition.
 */
export function constitutionPromptClauses(scope: PassScope): ConstitutionPromptClause[] {
  return [SCOPE_PROMPT_CLAUSE[scope], ...SHARED_PROMPT_CLAUSES];
}

/**
 * Story 40: the actor should be the subject and the action should be the verb.
 * Shipped disabled (DESIGN §4): it is the most opinionated pass in the pack, so
 * the Writer turns it on deliberately rather than meeting it on first Run.
 */
export const CHARACTERS_ACTIONS_PASS: Pass = {
  id: "characters-actions",
  name: "Characters and actions",
  description: "Flags sentences where the actor is missing from the subject position.",
  kind: "model",
  scope: "paragraph",
  output: "findings",
  slot: "critic",
  enabled: false,
  prompt: paragraphPassPrompt(
    "Check one paragraph of a piece of writing for characters and actions.",
    [
      "Flag sentences in the TARGET PARAGRAPH where the actor is missing from the subject",
      "position, or where the action is buried in a noun instead of carried by the verb. Say in",
      "the diagnosis who or what is acting and what they are doing.",
      PARAGRAPH_REPORTING_CLAUSE,
    ].join("\n"),
  ),
};

/**
 * Story 43: one paragraph, one idea. The Finding points at the sentence where
 * the paragraph turns away from its first idea, so the Writer can split it.
 */
export const PARAGRAPH_UNITY_PASS: Pass = {
  id: "paragraph-unity",
  name: "Paragraph unity",
  description: "Flags paragraphs carrying more than one idea.",
  kind: "model",
  scope: "paragraph",
  output: "findings",
  slot: "critic",
  enabled: true,
  prompt: paragraphPassPrompt(
    "Check one paragraph of a piece of writing for unity.",
    [
      "Flag places in the TARGET PARAGRAPH where it carries more than one idea, so the Writer",
      "can split it. Quote the sentence or span where the paragraph turns away from its first",
      "idea, and name the second idea in the diagnosis.",
      PARAGRAPH_REPORTING_CLAUSE,
    ].join("\n"),
  ),
};

/** Story 44: the sentences that add nothing. */
export const CUT_CANDIDATES_PASS: Pass = {
  id: "cut-candidates",
  name: "Cut candidates",
  description: "Flags sentences that could be cut without loss.",
  kind: "model",
  scope: "paragraph",
  output: "findings",
  slot: "critic",
  enabled: true,
  prompt: paragraphPassPrompt(
    "Check one paragraph of a piece of writing for sentences that add nothing.",
    [
      "Flag sentences in the TARGET PARAGRAPH that could be cut without loss: restatements,",
      "filler, and sentences that only repeat what another sentence already said. Say in the",
      "diagnosis what the sentence contributes, or why it contributes nothing.",
      PARAGRAPH_REPORTING_CLAUSE,
    ].join("\n"),
  ),
};

/**
 * The one paragraph-scope model Pass that proves the mechanism (#4), and the
 * pack's exact fear (#45): writing that sounds like a magazine headline. It is
 * enabled by default.
 *
 * The prompt names what to look for and states the two rules Core also enforces:
 * the surrounding text is context, not target, and only problems in the target
 * are wanted. It never asks for praise and never asks for replacement prose.
 */
export const CLICHE_PASS: Pass = {
  id: "cliche",
  name: "Cliché and headline-ese",
  description: "Flags phrases that read like a magazine headline rather than like writing.",
  kind: "model",
  scope: "paragraph",
  output: "findings",
  slot: "critic",
  enabled: true,
  prompt: paragraphPassPrompt(
    "Check one paragraph of a piece of writing for clichés and headline-ese.",
    [
      "Flag phrases in the TARGET PARAGRAPH that are clichés or that read like a magazine",
      "headline: stock figures of speech, hype, and phrasing worn smooth by overuse.",
      PARAGRAPH_REPORTING_CLAUSE,
    ].join("\n"),
  ),
};

/**
 * Story 46: a hedge that undercuts a claim the Writer clearly means, and
 * confidence the paragraph has not earned. The diagnosis says which, so the
 * Writer knows whether to commit or to substantiate.
 */
export const CLAIM_STRENGTH_PASS: Pass = {
  id: "claim-strength",
  name: "Claim strength",
  description: "Flags hedged claims and confidence the paragraph cannot support.",
  kind: "model",
  scope: "paragraph",
  output: "findings",
  slot: "critic",
  enabled: true,
  prompt: paragraphPassPrompt(
    "Check one paragraph of a piece of writing for claim strength.",
    [
      "Flag claims in the TARGET PARAGRAPH that a hedge undercuts — where the Writer clearly",
      "means the claim but weakens it — and claims stated with more confidence than the",
      "paragraph supports. Say in the diagnosis whether the Writer should commit to the claim",
      "or substantiate it.",
      PARAGRAPH_REPORTING_CLAUSE,
    ].join("\n"),
  ),
};

/**
 * Story 41: cohesion across sentences, and the stress position — the slot at
 * the end of a sentence where the important new thing belongs. Enabled by
 * default (DESIGN §4, pass 8).
 */
export const TOPIC_STRINGS_PASS: Pass = {
  id: "topic-strings",
  name: "Topic strings and stress position",
  description:
    "Flags where consecutive sentences fail to cohere, and where the important new thing is " +
    "buried rather than placed at the stress position.",
  kind: "model",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: true,
  prompt: documentPassPrompt(
    "Check a whole piece of writing for cohesion across sentence and paragraph boundaries.",
    [
      "Flag places where consecutive sentences or paragraphs fail to cohere: where the topic",
      "string does not carry the reader forward, or where a sentence's important new information",
      "is buried instead of placed at the stress position at the end. Say in the diagnosis what",
      "the reader is asked to hold on to and where the sentence puts its weight.",
      DOCUMENT_REPORTING_CLAUSE,
    ].join("\n"),
  ),
};

/**
 * Story 42: the satisfying structural wins without hunting for them. Shipped
 * disabled (DESIGN §4, pass 9): moving Paragraphs is the most disruptive advice
 * in the pack, so the Writer asks for it deliberately.
 */
export const PARAGRAPH_REORDER_PASS: Pass = {
  id: "paragraph-reorder",
  name: "Paragraphs that could move",
  description: "Proposes paragraphs whose order could change for the better without loss.",
  kind: "model",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: false,
  prompt: documentPassPrompt(
    "Check the order of paragraphs in a whole piece of writing.",
    [
      "Flag a small number of paragraphs whose order could change — moved earlier or later —",
      "without losing the thread. Quote the paragraph, and say in the diagnosis where it could",
      "move and why the piece would read better for it.",
      DOCUMENT_REPORTING_CLAUSE,
    ].join("\n"),
  ),
};

/**
 * Story 91–93: the Reader pass. A section-scope model Pass whose output shape
 * is a Reader account rather than Findings — what the Section says, what a
 * distracted reader would miss, and the gap between the two. Running it reads
 * every Section once (DESIGN §6), and its accounts are shown in their own tab,
 * never mixed with the queue that still needs work.
 */
export const READER_PASS: Pass = {
  id: "reader",
  name: "Reader pass",
  description: "Reconstructs what each Section communicates, and what a distracted reader would miss.",
  kind: "model",
  scope: "section",
  output: "section-summary",
  slot: "critic",
  enabled: true,
  prompt: sectionPassPrompt(
    "Read one section of a piece of writing as a reader who is not its author.",
    [
      "Reconstruct what this section communicates, name what a distracted reader would",
      "miss, and state the gap between what the section set out to do and what it does.",
      "Ground each part in what the section actually says.",
      SECTION_REPORTING_CLAUSE,
    ].join("\n"),
  ),
};

/**
 * The Starter pack. Rule passes first, in the order DESIGN §4 lists them, then
 * the model passes in the same order: characters and actions (off), topic
 * strings and stress position, paragraphs that could move (off), paragraph
 * unity, cut candidates, cliché and headline-ese (the one #4 shipped), claim
 * strength, and the Reader pass (#11). The document-scope model passes ship
 * with #7; the Reader pass ships with #11.
 *
 * `enabled` here is only the default: the Writer's toggle is persisted, and
 * `loadOrCreatePasses` seeds a Starter pass only when its id is missing, so an
 * edit survives a later Obelus.
 */
export const STARTER_PASSES: Pass[] = [
  HEDGES_PASS,
  NOMINALIZATIONS_PASS,
  OPENERS_PASS,
  WORDINESS_PASS,
  REPETITION_PASS,
  CHARACTERS_ACTIONS_PASS,
  TOPIC_STRINGS_PASS,
  PARAGRAPH_REORDER_PASS,
  PARAGRAPH_UNITY_PASS,
  CUT_CANDIDATES_PASS,
  CLICHE_PASS,
  CLAIM_STRENGTH_PASS,
  READER_PASS,
];
