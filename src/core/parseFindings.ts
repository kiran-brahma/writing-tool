import type { Violation } from "./finding";
import { FINDING_FIELDS } from "./findingsSchema";
import { lintViolations, dedupeViolations } from "./lintViolations";
import { isRecord, stringOrNull } from "./parseJson";
import type { OutputShape } from "./pass";

/**
 * A Finding before it is anchored and given provenance: the fields the findings
 * schema exposes, plus what the linter found about them. The schema carries no
 * field for rewritten prose, so there is none for the model to fill.
 */
export interface FindingDraft {
  issue: string;
  diagnosis: string;
  pattern?: string;
  quote: string;
  offset: number;
  /**
   * Praise or rewrite-shaped content caught in *this* Finding's returned
   * strings, so the display can mark the exact Finding polluted rather than
   * only reporting that something, somewhere, drifted.
   */
  violations: Violation[];
}

export interface ParsedFindings {
  findings: FindingDraft[];
  /**
   * The linter's findings across the whole response: praise and rewrite-shaped
   * content in the model's fields, and any out-of-schema string. The Run reports
   * them so drift stays visible instead of being silently dropped.
   */
  violations: Violation[];
}

export class UnsupportedOutputShapeError extends Error {
  constructor(shape: OutputShape) {
    super(`The "${shape}" output shape cannot be read by this parser.`);
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

  const { value, span } = extractJsonWithSpan(raw);
  const candidates = candidatesOf(value);
  const findings: FindingDraft[] = [];
  const violations: Violation[] = [];

  for (const candidate of candidates) {
    // A candidate is linted whether or not it validates, and whether or not it
    // is even a record: a malformed Finding, or a smuggled string standing in
    // for one, can still carry a breach that discarding it must not discard.
    const candidateViolations = isRecord(candidate)
      ? violationsOf(candidate)
      : outOfSchemaViolations(candidate);
    violations.push(...candidateViolations);

    const draft = validateFinding(candidate);
    if (draft === null) continue;
    draft.violations = candidateViolations;
    findings.push(draft);
  }

  // The wrapper's own fields are a schema breach too, so a rewrite smuggled
  // alongside the array — or a `findings` value that is not an array at all —
  // is quarantined rather than ignored. A bare array has no wrapper to scan.
  if (isRecord(value) && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key === "findings" && Array.isArray(child)) continue;
      violations.push(...outOfSchemaViolations(child));
    }
  }

  // The aggregate is what the Run reports: every candidate's violations plus
  // the model's prose around the JSON. The JSON span itself is not linted
  // wholesale — its `quote` field is the Writer's own prose, and a Violation is
  // never about the prose — so only the text outside it is scanned.
  const prose = span === raw ? "" : raw.split(span).join(" ");
  return { findings, violations: dedupeViolations([...violations, ...lintViolations(prose)]) };
}

/**
 * Extracts the first JSON value the response contains. Tries the whole string,
 * then each fenced block, then each balanced `{...}` or `[...]` run, in that
 * order, so the most literal reading wins.
 */
export function extractJson(raw: string): unknown {
  return extractJsonWithSpan(raw).value;
}

/**
 * The parsed value and the exact raw substring it was read from, so a caller
 * can tell the model's prose around the JSON from the JSON itself.
 */
export function extractJsonWithSpan(raw: string): { value: unknown; span: string } {
  for (const candidate of jsonCandidates(raw)) {
    const parsed = tryParse(candidate);
    if (parsed !== undefined) return { value: parsed, span: candidate };
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

/**
 * The fields the model authors. `quote` is deliberately absent: a Finding that
 * survives Containment quotes text that resolves inside the Target, so the
 * quote is the Writer's own prose. Flagging it would flag the Writer rather than
 * the model, and CONTEXT.md defines a Violation as never about the prose.
 */
const AUTHORED_FIELDS = ["issue", "diagnosis", "pattern"];

/** Known fields the model does not author, so a string there is not a breach. */
const NON_AUTHORED_KNOWN_FIELDS = new Set(
  FINDING_FIELDS.filter((field) => !AUTHORED_FIELDS.includes(field)),
);

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
    violations: [],
  };
  if (pattern !== null) draft.pattern = pattern;
  return draft;
}

/**
 * Praise and rewrite-shaped content in a returned record: the fields the model
 * authored, plus every string under any other field. The schema's field set is
 * closed, so an out-of-schema string is both linted — praise in it is named as
 * praise — and quarantined whole as a rewrite, since no out-of-schema field may
 * carry model prose toward a Document. Fields are never joined, so two adjacent
 * values cannot manufacture a phrase neither one contains.
 *
 * One function for both output shapes, parameterized by the authored field set,
 * so the Findings parser and the Reader parser cannot enforce different linter
 * policies.
 */
export function violationsForFields(
  value: Record<string, unknown>,
  authoredFields: readonly string[],
  ignoredKnownFields: ReadonlySet<string> = new Set(),
): Violation[] {
  const authored: string[] = [];
  const breaches: unknown[] = [];

  for (const [key, field] of Object.entries(value)) {
    if (authoredFields.includes(key) && typeof field === "string") {
      authored.push(field);
    } else if (ignoredKnownFields.has(key) && typeof field === "string") {
      // A known field the model does not author, such as the Writer's `quote`.
      continue;
    } else {
      breaches.push(field);
    }
  }

  return dedupeViolations([
    ...authored.flatMap((text) => lintViolations(text)),
    ...breaches.flatMap((field) => outOfSchemaViolations(field)),
  ]);
}

function violationsOf(candidate: Record<string, unknown>): Violation[] {
  return violationsForFields(candidate, AUTHORED_FIELDS, NON_AUTHORED_KNOWN_FIELDS);
}

/** Every string at or below `value`: linted for praise and quarantined whole. */
function outOfSchemaViolations(value: unknown): Violation[] {
  const strings: string[] = [];
  collectStrings(value, strings);

  const violations: Violation[] = [];
  for (const text of strings) {
    violations.push(...lintViolations(text));
    const prose = text.trim();
    if (prose !== "") violations.push({ kind: "rewrite", text: prose });
  }
  return violations;
}

function collectStrings(value: unknown, strings: string[]): void {
  if (typeof value === "string") {
    strings.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, strings);
    return;
  }
  if (isRecord(value)) {
    for (const child of Object.values(value)) collectStrings(child, strings);
  }
}

function integerOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}
