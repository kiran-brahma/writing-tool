import type { Pass } from "./pass";

/**
 * The rule Passes that ship with Obelus. #14 runs the hedge sweep only; every
 * other rule Pass, and editable Rule config, arrives with #6 and extends this
 * list rather than inventing a second one.
 *
 * The hedge list is data, not code, because ADR-0003 makes the mechanical tier
 * free and offline and the Writer's overused words are the Writer's to name.
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

export const STARTER_PASSES: Pass[] = [HEDGES_PASS];
