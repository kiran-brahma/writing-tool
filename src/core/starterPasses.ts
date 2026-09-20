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
 * one function so a Starter pass and the constitution harness fixtures cannot
 * drift apart in the part of the prompt the constitution depends on.
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
 * The one paragraph-scope model Pass that proves the mechanism (#4). The rest of
 * the Starter model passes ship in #19, and the document-scope ones in #7. It
 * is enabled by default, so a Writer with a critic Connection has something real
 * to run the moment the mechanism lands.
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
      "headline: stock figures of speech, hype, and phrasing worn smooth by overuse. For each",
      "problem, quote the exact span from the target, give its zero-based offset within the",
      "target, a short issue label and a diagnosis. Report only problems in the target",
      "paragraph. Do not praise the writing and do not suggest replacement prose.",
    ].join("\n"),
  ),
};

export const STARTER_PASSES: Pass[] = [
  HEDGES_PASS,
  NOMINALIZATIONS_PASS,
  OPENERS_PASS,
  WORDINESS_PASS,
  REPETITION_PASS,
  CLICHE_PASS,
];
