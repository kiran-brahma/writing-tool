import type { RuleConfig } from "../core/pass";

/**
 * The text round trip behind the Rule config editor. A rule Pass's data is
 * word lists and patterns, and a textarea is the honest editor for a list: one
 * entry per line. These functions are pure so the encode/decode can be tested
 * without a DOM, which is the only place this app's rules allow a test to sit.
 */

export type RuleFieldKey = keyof RuleConfig;

export interface RuleField {
  key: RuleFieldKey;
  label: string;
  kind: "list" | "pairs" | "number";
  help: string;
}

/** The order the editor shows fields in; a Pass only shows fields it carries. */
const FIELDS: RuleField[] = [
  {
    key: "hedges",
    label: "Hedges and intensifiers",
    kind: "list",
    help: "One word or phrase per line.",
  },
  {
    key: "nominalizationSuffixes",
    label: "Nominalization suffixes",
    kind: "list",
    help: "One suffix per line.",
  },
  {
    key: "openers",
    label: "Throat-clearing openers",
    kind: "list",
    help: "One sentence-opening phrase per line.",
  },
  {
    key: "wordiness",
    label: "Wordy constructions",
    kind: "pairs",
    help: "One pair per line, as: wordy phrase => shorter phrase.",
  },
  {
    key: "repetitionWindow",
    label: "Repetition window",
    kind: "number",
    help: "How many sentences a repeat may span.",
  },
  {
    key: "bannedWords",
    label: "Banned words and phrases",
    kind: "list",
    help: "One word or phrase per line. Reported, never replaced.",
  },
  {
    key: "wornPhrases",
    label: "Worn phrases",
    kind: "list",
    help: "One cliché or jargon metaphor per line. Reported, never replaced.",
  },
  {
    key: "printedFigures",
    label: "Orwell 1: figures of speech seen in print",
    kind: "list",
    help: "One figure of speech per line. Reported, never replaced.",
  },
  {
    key: "longWords",
    label: "Orwell 2: long words",
    kind: "list",
    help: "One long word per line. Reported, never replaced.",
  },
  {
    key: "cuttableWords",
    label: "Orwell 3: words that can be cut",
    kind: "list",
    help: "One word or phrase per line. Reported, never cut.",
  },
  {
    key: "passiveAuxiliaries",
    label: "Orwell 4: passive auxiliaries",
    kind: "list",
    help: "One auxiliary per line. A passive is read as one of these before a past participle.",
  },
  {
    key: "jargonWords",
    label: "Orwell 5: jargon and foreign words",
    kind: "list",
    help: "One word or phrase per line. Reported, never replaced.",
  },
];

/** The fields a Pass's Rule config carries, in editor order. */
export function ruleFields(config: RuleConfig): RuleField[] {
  return FIELDS.filter((field) => config[field.key] !== undefined);
}

/** The editor text for one field. */
export function fieldText(config: RuleConfig, key: RuleFieldKey): string {
  switch (key) {
    case "repetitionWindow": {
      const value = config.repetitionWindow;
      return value === undefined ? "" : String(value);
    }
    case "wordiness": {
      const value = config.wordiness;
      return value === undefined ? "" : value.map(([wordy, shorter]) => `${wordy} => ${shorter}`).join("\n");
    }
    case "hedges":
    case "nominalizationSuffixes":
    case "openers":
    case "bannedWords":
    case "wornPhrases":
    case "printedFigures":
    case "longWords":
    case "cuttableWords":
    case "passiveAuxiliaries":
    case "jargonWords": {
      const value = config[key];
      return value === undefined ? "" : value.join("\n");
    }
  }
}

/**
 * The Rule config a field's editor text describes. A malformed wordiness line
 * (no `=>`) is dropped rather than guessed at; an unreadable window becomes 1,
 * which is the smallest window the rule can act on.
 */
export function applyFieldText(config: RuleConfig, key: RuleFieldKey, text: string): RuleConfig {
  if (key === "repetitionWindow") {
    const parsed = Number.parseInt(text.trim(), 10);
    return { ...config, repetitionWindow: Number.isFinite(parsed) && parsed > 0 ? parsed : 1 };
  }

  const lines = splitLines(text);
  if (key === "wordiness") {
    return { ...config, wordiness: lines.flatMap(parseWordinessLine) };
  }
  return { ...config, [key]: lines };
}

function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseWordinessLine(line: string): [string, string][] {
  const index = line.indexOf("=>");
  if (index === -1) return [];
  const wordy = line.slice(0, index).trim();
  if (wordy.length === 0) return [];
  return [[wordy, line.slice(index + 2).trim()]];
}
