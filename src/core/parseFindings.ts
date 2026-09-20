import type { Violation } from "./finding";
import { lintViolations } from "./lintViolations";
import type { OutputShape } from "./pass";

/**
 * A Finding before it is anchored and given provenance: exactly the fields the
 * findings schema exposes. There is no rewrite field here either.
 */
export interface FindingDraft {
  issue: string;
  diagnosis: string;
  pattern?: string;
  quote: string;
  offset: number;
}

export interface ParsedFindings {
  findings: FindingDraft[];
  /**
   * Praise or rewrite-shaped content the linter caught in the returned strings.
   * The schema has no rewrite field, so this is about drift inside the fields
   * the model was allowed to fill.
   */
  violations: Violation[];
}

export class UnsupportedOutputShapeError extends Error {
  constructor(shape: OutputShape) {
    super(`The "${shape}" output shape is not implemented yet.`);
    this.name = "UnsupportedOutputShapeError";
  }
}

/**
 * Tolerant parsing: extract JSON from surrounding prose, validate it, then
 * lint. `JSON.parse` alone is not enough — a strict response format is a
 * promise models still break, and a response wrapped in a sentence or a code
 * fence is otherwise a lost Run. An entry that fails validation is skipped
 * rather than failing the whole response, so one malformed Finding cannot cost
 * the Writer the others.
 */
export function parseFindings(raw: string, shape: OutputShape): ParsedFindings {
  if (shape !== "findings") throw new UnsupportedOutputShapeError(shape);

  const value = extractJson(raw);
  const candidates = candidatesOf(value);
  const findings: FindingDraft[] = [];
  const strings: string[] = [];

  for (const candidate of candidates) {
    const draft = validateFinding(candidate);
    if (draft === null) continue;
    findings.push(draft);
    // Every string the model returned is scanned, the quote included.
    strings.push(draft.issue, draft.diagnosis, draft.pattern ?? "", draft.quote);
  }

  return { findings, violations: lintViolations([...strings, flattened(raw)].join("\n")) };
}

/**
 * Extracts the first JSON value the response contains. Tries the whole string,
 * then each fenced block, then each balanced `{...}` or `[...]` run, in that
 * order, so the most literal reading wins.
 */
export function extractJson(raw: string): unknown {
  for (const candidate of jsonCandidates(raw)) {
    const parsed = tryParse(candidate);
    if (parsed !== undefined) return parsed;
  }
  throw new Error("The model response contained no JSON Obelus could read.");
}

function* jsonCandidates(raw: string): Generator<string> {
  yield raw;

  for (const match of raw.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/gi)) {
    const body = match[1];
    if (body !== undefined) yield body;
  }

  for (let index = 0; index < raw.length; index++) {
    const char = raw[index];
    if (char !== "{" && char !== "[") continue;
    const end = matchingClose(raw, index);
    if (end !== -1) yield raw.slice(index, end + 1);
  }
}

/**
 * The index of the bracket that closes the one at `start`, skipping brackets
 * inside JSON strings. `-1` when the run never closes.
 */
function matchingClose(raw: string, start: number): number {
  const open = raw[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < raw.length; index++) {
    const char = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === open) depth++;
    else if (char === close) {
      depth--;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // A candidate that is not JSON is not an error on its own; the caller
    // tries the next candidate and only fails when none parses.
    return undefined;
  }
}

function candidatesOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.findings)) return value.findings;
  return [];
}

function validateFinding(candidate: unknown): FindingDraft | null {
  if (!isRecord(candidate)) return null;

  const issue = stringOrNull(candidate.issue);
  const diagnosis = stringOrNull(candidate.diagnosis);
  const quote = stringOrNull(candidate.quote);
  if (issue === null || diagnosis === null || quote === null) return null;

  const pattern = stringOrNull(candidate.pattern);
  const draft: FindingDraft = {
    issue,
    diagnosis,
    quote,
    offset: integerOrZero(candidate.offset),
  };
  if (pattern !== null) draft.pattern = pattern;
  return draft;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function integerOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The whole response with JSON structure folded to spaces. The field strings are
 * linted exactly and separately; this flattened form adds any prose around the
 * JSON, so drift outside the fields is caught too.
 */
function flattened(raw: string): string {
  return raw.replace(/[{}\[\]",:]/g, " ").replace(/\s+/g, " ").trim();
}
