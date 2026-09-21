import { isRecord } from "./parseJson";
import {
  isOutputShape,
  isPassScope,
  type OutputShape,
  type Pass,
  type PassKind,
  type RuleConfig,
} from "./pass";
import { findUnknownPlaceholders } from "./prompt";

/**
 * The Pass set as a portable file (story 102). Passes are data, so the set
 * round-trips as JSON: an envelope naming the format and version, and the Pass
 * records themselves. The version is refused when it is newer than this build
 * understands, exactly as the database and the Library backup are, because a
 * file half-read is worse than a file refused.
 *
 * Validation lives here rather than in the importer so a hand-edited file, an
 * imported one and a saved edit all go through the same rules — including story
 * 100's placeholder check, so a Pass set cannot smuggle in an unknown
 * placeholder.
 */

export const PASS_SET_FORMAT = "obelus.pass-set";
export const PASS_SET_FORMAT_VERSION = 1;

export interface PassSetFile {
  format: typeof PASS_SET_FORMAT;
  version: number;
  passes: Pass[];
}

/** A file that is not an Obelus pass set, refused before anything is written. */
export class PassSetFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PassSetFormatError";
  }
}

/** Story 102: the whole Pass set as one file's text. */
export function serializePassSet(passes: Pass[]): string {
  const file: PassSetFile = {
    format: PASS_SET_FORMAT,
    version: PASS_SET_FORMAT_VERSION,
    passes,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Story 102: reads a Pass set file back into Pass records, refusing anything
 * Obelus cannot run before it can touch storage. Every Pass is validated and
 * every id is checked for duplicates, so a corrupt set cannot leave the table
 * with two Passes fighting over one id.
 */
export function parsePassSet(text: string): Pass[] {
  const value = parseObject(text);
  if (value.format !== PASS_SET_FORMAT) {
    throw new PassSetFormatError("That file is not an Obelus pass set.");
  }

  const version = value.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new PassSetFormatError("That pass set has no readable version.");
  }
  if (version > PASS_SET_FORMAT_VERSION) {
    throw new PassSetFormatError(
      `That pass set was written by a newer Obelus (format version ${version}; this build reads ` +
        `up to ${PASS_SET_FORMAT_VERSION}). Update Obelus, or import an older pass set.`,
    );
  }
  if (!Array.isArray(value.passes)) {
    throw new PassSetFormatError('That pass set is missing its "passes" list.');
  }

  const passes = value.passes.map((entry, index) => readPass(entry, index));
  const ids = passes.map((pass) => pass.id);
  if (new Set(ids).size !== ids.length) {
    throw new PassSetFormatError("That pass set gives two Passes the same id.");
  }
  return passes;
}

/**
 * Story 100 and 101: the problem with one candidate Pass, or null when it is
 * one Obelus can run. The Workbench shows this before a save, and the importer
 * refuses a file whose Pass fails it.
 */
export function passProblem(candidate: unknown): string | null {
  if (!isRecord(candidate) || Array.isArray(candidate)) {
    return "a Pass must be a JSON object";
  }
  if (typeof candidate.id !== "string" || candidate.id.trim() === "") {
    return "a Pass needs an id";
  }
  const id = candidate.id;
  if (typeof candidate.name !== "string" || candidate.name.trim() === "") {
    return `Pass "${id}" needs a name`;
  }
  if (typeof candidate.description !== "string") {
    return `Pass "${id}" needs a description`;
  }
  if (candidate.kind !== "rule" && candidate.kind !== "model") {
    return `Pass "${id}" has an unknown kind`;
  }
  if (!isPassScope(candidate.scope)) {
    return `Pass "${id}" has an unknown scope`;
  }
  if (!isOutputShape(candidate.output)) {
    return `Pass "${id}" has an unknown output shape`;
  }
  if (candidate.slot !== "critic") {
    return `Pass "${id}" has an unknown slot`;
  }
  if (typeof candidate.enabled !== "boolean") {
    return `Pass "${id}" needs an enabled flag`;
  }
  if (candidate.kind === "model") {
    if (typeof candidate.prompt !== "string" || candidate.prompt.trim() === "") {
      return `Model Pass "${id}" needs a prompt`;
    }
    const unknown = findUnknownPlaceholders(candidate.prompt);
    if (unknown.length > 0) {
      return `Pass "${id}" uses unknown placeholder${
        unknown.length === 1 ? "" : "s"
      } ${unknown.map((name) => `{{${name}}}`).join(", ")}`;
    }
  }
  if (
    candidate.kind === "rule" &&
    candidate.prompt !== undefined &&
    typeof candidate.prompt !== "string"
  ) {
    return `Rule Pass "${id}" has an unreadable prompt`;
  }
  if (candidate.ruleConfig !== undefined && readRuleConfig(candidate.ruleConfig) === null) {
    return `Pass "${id}" has an unreadable Rule config`;
  }
  return null;
}

/**
 * Builds one Pass from a validated candidate. Only called after `passProblem`
 * has cleared it, so the casts are the validation's conclusion rather than a
 * leap of faith.
 */
function readPass(candidate: unknown, index: number): Pass {
  const problem = passProblem(candidate);
  if (problem !== null) throw new PassSetFormatError(`Pass ${index + 1}: ${problem}.`);

  const record = candidate as Record<string, unknown>;
  const pass: Pass = {
    id: (record.id as string).trim(),
    name: (record.name as string).trim(),
    description: record.description as string,
    kind: record.kind as PassKind,
    scope: record.scope as Pass["scope"],
    output: record.output as OutputShape,
    slot: "critic",
    enabled: record.enabled as boolean,
  };
  if (pass.kind === "model") pass.prompt = record.prompt as string;
  if (record.ruleConfig !== undefined) {
    pass.ruleConfig = readRuleConfig(record.ruleConfig) as RuleConfig;
  }
  return pass;
}

function parseObject(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // A file that is not JSON is not a Pass set; the parse failure is the answer.
    throw new PassSetFormatError("That pass set file is not readable JSON.");
  }
  if (!isRecord(parsed) || Array.isArray(parsed)) {
    throw new PassSetFormatError("That pass set file does not contain an Obelus object.");
  }
  return parsed;
}

/** A Rule config Obelus can run, or null when a field has the wrong shape. */
function readRuleConfig(value: unknown): RuleConfig | null {
  if (!isRecord(value) || Array.isArray(value)) return null;
  const config: RuleConfig = {};

  if (value.hedges !== undefined) {
    const hedges = stringArray(value.hedges);
    if (hedges === null) return null;
    config.hedges = hedges;
  }
  if (value.openers !== undefined) {
    const openers = stringArray(value.openers);
    if (openers === null) return null;
    config.openers = openers;
  }
  if (value.nominalizationSuffixes !== undefined) {
    const suffixes = stringArray(value.nominalizationSuffixes);
    if (suffixes === null) return null;
    config.nominalizationSuffixes = suffixes;
  }
  if (value.wordiness !== undefined) {
    const wordiness = wordinessPairs(value.wordiness);
    if (wordiness === null) return null;
    config.wordiness = wordiness;
  }
  if (value.repetitionWindow !== undefined) {
    if (typeof value.repetitionWindow !== "number" || !Number.isFinite(value.repetitionWindow)) {
      return null;
    }
    config.repetitionWindow = value.repetitionWindow;
  }
  if (value.bannedWords !== undefined) {
    const bannedWords = stringArray(value.bannedWords);
    if (bannedWords === null) return null;
    config.bannedWords = bannedWords;
  }
  if (value.wornPhrases !== undefined) {
    const wornPhrases = stringArray(value.wornPhrases);
    if (wornPhrases === null) return null;
    config.wornPhrases = wornPhrases;
  }
  return config;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) return null;
  return value as string[];
}

function wordinessPairs(value: unknown): [string, string][] | null {
  if (!Array.isArray(value)) return null;
  const pairs: [string, string][] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [wordy, shorter] = entry;
    if (typeof wordy !== "string" || typeof shorter !== "string") return null;
    pairs.push([wordy, shorter]);
  }
  return pairs;
}
