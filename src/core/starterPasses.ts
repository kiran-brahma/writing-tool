import type { Pass } from "./pass";

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
 * The prompt clauses the constitution depends on. The harness checks them over
 * every model Pass it runs, and the Starter-pack test checks them over every
 * paragraph-scope prompt in the pack, so "constitution-safe" has one definition
 * rather than a copy in each place that checks it.
 */
export const CONSTITUTION_PROMPT_CLAUSES: { name: string; pattern: RegExp }[] = [
  { name: "analyze only the target", pattern: /analyze only this paragraph/i },
  { name: "no praise", pattern: /do not praise/i },
  { name: "no replacement prose", pattern: /do not suggest replacement prose/i },
];

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
 * The Starter pack. Rule passes first, in the order DESIGN §4 lists them, then
 * the paragraph-scope model passes in the same order: characters and actions
 * (off), paragraph unity, cut candidates, cliché and headline-ese (the one #4
 * shipped), claim strength. The document-scope model passes ship with #7.
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
  PARAGRAPH_UNITY_PASS,
  CUT_CANDIDATES_PASS,
  CLICHE_PASS,
  CLAIM_STRENGTH_PASS,
];
