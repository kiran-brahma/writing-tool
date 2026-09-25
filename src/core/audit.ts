import type { Connection } from "../wire/connection";
import type { ModelRequest } from "../wire/modelRequest";
import { DEFAULT_CHARACTER_LIMIT } from "./chunking";
import { chunkedResults } from "./chunkedRun";
import type { RunConfig } from "./critique";
import type { Provenance, Violation } from "./finding";
import { dedupeViolations, lintViolations } from "./lintViolations";
import { buildPassRequest, provenanceFor } from "./modelCall";
import { lintProseAroundSpan } from "./parseFindings";
import { isAuditPass, type Pass } from "./pass";
import {
  extractJsonWithSpan,
  outOfSchemaViolations,
  UnsupportedOutputShapeError,
} from "./parseFindings";
import { isRecord, stringOrNull } from "./parseJson";
import { fillPrompt, promptValues } from "./prompt";
import type { Target } from "./target";

/**
 * The Audit account: the reasoning analysis a document-scope Audit pass returns.
 * It is its own output shape, stored apart from Findings and Reader accounts
 * because it judges the whole piece rather than quoting a span. Like the Reader
 * account, what the model authors is a closed shape with no field for rewritten
 * prose, so an audit cannot hand the Writer a sentence.
 *
 * The wire schema the model answers to is declared once (`AUDIT_SCHEMA`). The
 * parser validates the known fields by hand, exactly as the Findings and Reader
 * parsers do; the lint walk is schema-guided, so every field the schema declares
 * is linted and an unknown field is quarantined whole.
 */

/**
 * One fallacy the audit named — or a fault it described in plain terms, when no
 * label fit. `name` is null in that case rather than forcing a taxonomy.
 */
interface AuditFallacy {
  name: string | null;
  /** The quoted span the fault lives in. */
  passage: string;
  why: string;
  /** The premise or step the argument leaves out. */
  missing: string;
}

/** The premises, sub-conclusions and conclusion the audit reconstructed. */
interface AuditArgumentMap {
  premises: string[];
  subConclusions: string[];
  conclusion: string;
}

/** The reasoning kind, its form, the soundness judgment and any enthymemes. */
interface AuditReasoning {
  kind: "deductive" | "inductive";
  form?: string;
  soundness: string;
  enthymemes: string[];
}

/** The intensional and extensional definitions the audit found, when it found any. */
interface AuditDefinitions {
  intensional: string | null;
  extensional: string | null;
}

/**
 * The fields the model authors for an Audit account. `type` is the audit's own
 * argument/observation call; every other field follows from it. The shape is
 * closed and carries no field for a rewritten sentence.
 */
export interface AuditAccountContent {
  type: "argument" | "observation";
  corePayload: string;
  argumentMap?: AuditArgumentMap;
  reasoning?: AuditReasoning;
  fallacies: AuditFallacy[];
  definitions?: AuditDefinitions;
  priority: string[];
}

/**
 * An Audit account with what produced it. Stored as its own record kind, so an
 * account never masquerades as a Finding and a Finding never masquerades as an
 * account.
 */
export interface AuditAccount extends AuditAccountContent {
  provenance: Provenance;
  /** Praise or rewrite-shaped content the linter caught, struck through on display. */
  violations?: Violation[];
}

/**
 * The Audit schema Obelus sends a model. Like the Findings and Reader schemas,
 * this is a constitutional decision rather than a prompt instruction:
 * `additionalProperties: false` at every level, and no field for replacement
 * prose, leave a model nowhere to put a sentence of its own (story 134).
 *
 * `provenance` and `violations` are deliberately absent: Obelus stamps those on
 * read, exactly as it does for a Reader account, so the model cannot author them.
 */
export const AUDIT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["argument", "observation"],
      description:
        "Whether the piece carries an argument to reconstruct, or only an observation.",
    },
    corePayload: {
      type: "string",
      description: "The central claim or observation the piece is actually making.",
    },
    argumentMap: {
      type: "object",
      description: "The premises, sub-conclusions and conclusion the audit reconstructed.",
      properties: {
        premises: { type: "array", items: { type: "string" } },
        subConclusions: { type: "array", items: { type: "string" } },
        conclusion: { type: "string" },
      },
      required: ["premises", "subConclusions", "conclusion"],
      additionalProperties: false,
    },
    reasoning: {
      type: "object",
      description: "The reasoning kind, its form, its soundness and any enthymemes.",
      properties: {
        kind: { type: "string", enum: ["deductive", "inductive"] },
        form: { type: "string" },
        soundness: { type: "string" },
        enthymemes: { type: "array", items: { type: "string" } },
      },
      required: ["kind", "soundness", "enthymemes"],
      additionalProperties: false,
    },
    fallacies: {
      type: "array",
      description: "Named fallacies, or faults described in plain terms when no label fit.",
      items: {
        type: "object",
        properties: {
          name: { type: ["string", "null"] },
          passage: { type: "string" },
          why: { type: "string" },
          missing: { type: "string" },
        },
        required: ["name", "passage", "why", "missing"],
        additionalProperties: false,
      },
    },
    definitions: {
      type: "object",
      description: "The intensional and extensional definitions the audit found.",
      properties: {
        intensional: { type: ["string", "null"] },
        extensional: { type: ["string", "null"] },
      },
      required: ["intensional", "extensional"],
      additionalProperties: false,
    },
    priority: {
      type: "array",
      description: "What to fix first, most consequential first.",
      items: { type: "string" },
    },
  },
  required: ["type", "corePayload", "fallacies", "priority"],
  additionalProperties: false,
};

/** A parsed Audit account and the drift the linter caught across the response. */
export interface ParsedAuditAccount {
  account: AuditAccountContent;
  /** Model drift across the whole response: praise and quarantined rewrites. */
  violations: Violation[];
}

export interface AuditRunResult {
  account: AuditAccount;
  violations: Violation[];
  rawResponse: string;
  /**
   * Story 131: how many Section chunks the Run was split into. `1` for a
   * Document that fit one call; more when it was chunked and synthesized.
   */
  chunks: number;
}

/** Raised when a response contains no Audit account Obelus can read. */
export class AuditAccountParseError extends Error {
  constructor(message = "The model response did not contain an Audit account Obelus could read.") {
    super(message);
    this.name = "AuditAccountParseError";
  }
}

/**
 * Tolerant parsing, like the Findings and Reader parsers: extract JSON from
 * surrounding prose, validate the account, then lint. An out-of-schema field is
 * both linted — praise in it is named as praise — and quarantined whole as a
 * rewrite, because no out-of-schema field may carry model prose toward the
 * Writer. The prose around the JSON is linted too, so praise the model wraps
 * the object in cannot slip through unseen.
 *
 * The lint is schema-guided, because the Audit account nests where the other
 * shapes do not: every string under a known schema path is the model's prose
 * and is linted, every string under an unknown path is a breach and is
 * quarantined, and `fallacies[].passage` is exempt because it quotes the
 * Writer's own words.
 */
export function parseAuditAccount(raw: string): ParsedAuditAccount {
  const { value, span } = extractJsonWithSpan(raw);
  if (!isRecord(value) || Array.isArray(value)) throw new AuditAccountParseError();

  const account = validateAuditAccount(value);
  if (account === null) throw new AuditAccountParseError();

  const prose = lintProseAroundSpan(raw, span);
  return {
    account,
    violations: dedupeViolations([...auditViolations(value), ...prose]),
  };
}

/** Every known field the model authors, linted; every unknown field quarantined. */
function auditViolations(value: Record<string, unknown>): Violation[] {
  const authored: string[] = [];
  const breaches: unknown[] = [];
  walkAudit(value, AUDIT_SCHEMA, authored, breaches);
  return dedupeViolations([
    ...authored.flatMap((text) => lintViolations(text)),
    ...breaches.flatMap((field) => outOfSchemaViolations(field)),
  ]);
}

/**
 * Walks the value and the schema together. A string under a known schema path
 * is authored prose; a value under an unknown key, at any depth, is a breach.
 * `passage` is skipped because it is a quotation of the piece, and a Violation
 * is never about the prose.
 */
function walkAudit(
  value: unknown,
  schema: Record<string, unknown>,
  authored: string[],
  breaches: unknown[],
): void {
  const type = schema.type;
  if (type === "string" || (Array.isArray(type) && type.includes("string"))) {
    if (typeof value === "string") authored.push(value);
    else if (value !== null && value !== undefined) breaches.push(value);
    return;
  }

  if (type === "object") {
    // A non-object where an object is expected is a breach: no out-of-schema
    // value may carry model prose toward the Writer.
    if (value !== null && value !== undefined && (!isRecord(value) || Array.isArray(value))) {
      breaches.push(value);
      return;
    }
    if (!isRecord(value) || Array.isArray(value)) return;
    const properties = isRecord(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};
    for (const [key, child] of Object.entries(value)) {
      const childSchema = properties[key];
      if (!isRecord(childSchema)) {
        breaches.push(child);
        continue;
      }
      // A fallacy's passage is the Writer's quote, never the model's prose.
      if (key === "passage") continue;
      walkAudit(child, childSchema, authored, breaches);
    }
    return;
  }

  if (type === "array") {
    if (!Array.isArray(value)) {
      if (value !== null && value !== undefined) breaches.push(value);
      return;
    }
    if (isRecord(schema.items)) {
      for (const item of value) walkAudit(item, schema.items, authored, breaches);
    }
    return;
  }

  // A schema node this walker does not understand is a breach, never silently
  // ignored: no value may escape linting because its schema shape is unfamiliar.
  if (value !== null && value !== undefined) breaches.push(value);
}

function validateAuditAccount(value: Record<string, unknown>): AuditAccountContent | null {
  const type = value.type;
  if (type !== "argument" && type !== "observation") return null;

  const corePayload = stringOrNull(value.corePayload);
  if (corePayload === null) return null;
  if (!Array.isArray(value.fallacies) || !Array.isArray(value.priority)) return null;

  const account: AuditAccountContent = {
    type,
    corePayload,
    fallacies: value.fallacies.flatMap(validateFallacy),
    priority: value.priority.filter((entry): entry is string => typeof entry === "string"),
  };

  const argumentMap = validateArgumentMap(value.argumentMap);
  if (argumentMap !== null) account.argumentMap = argumentMap;
  const reasoning = validateReasoning(value.reasoning);
  if (reasoning !== null) account.reasoning = reasoning;
  const definitions = validateDefinitions(value.definitions);
  if (definitions !== null) account.definitions = definitions;
  return account;
}

/**
 * One fallacy, or none when it is malformed. A missing or blank `name` reads as
 * `null`: the audit described the fault in plain terms rather than force it into
 * a label that did not fit.
 */
function validateFallacy(candidate: unknown): AuditFallacy[] {
  if (!isRecord(candidate)) return [];
  const passage = stringOrNull(candidate.passage);
  const why = stringOrNull(candidate.why);
  const missing = stringOrNull(candidate.missing);
  if (passage === null || why === null || missing === null) return [];
  const name =
    typeof candidate.name === "string" && candidate.name.trim() !== "" ? candidate.name : null;
  return [{ name, passage, why, missing }];
}

function validateArgumentMap(value: unknown): AuditArgumentMap | null {
  if (!isRecord(value) || Array.isArray(value)) return null;
  const premises = stringArray(value.premises);
  const subConclusions = stringArray(value.subConclusions);
  const conclusion = stringOrNull(value.conclusion);
  if (premises === null || subConclusions === null || conclusion === null) return null;
  return { premises, subConclusions, conclusion };
}

function validateReasoning(value: unknown): AuditReasoning | null {
  if (!isRecord(value) || Array.isArray(value)) return null;
  const kind = value.kind;
  if (kind !== "deductive" && kind !== "inductive") return null;
  const soundness = stringOrNull(value.soundness);
  const enthymemes = stringArray(value.enthymemes);
  if (soundness === null || enthymemes === null) return null;
  const form = stringOrNull(value.form);
  return { kind, soundness, enthymemes, ...(form === null ? {} : { form }) };
}

function validateDefinitions(value: unknown): AuditDefinitions | null {
  if (!isRecord(value) || Array.isArray(value)) return null;
  if (!("intensional" in value) || !("extensional" in value)) return null;
  return {
    intensional: value.intensional === null ? null : stringOrNull(value.intensional),
    extensional: value.extensional === null ? null : stringOrNull(value.extensional),
  };
}

/** The string entries of an array, or null when the value is not an array. */
function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * The entry point above the seam for the Audit pass: one document-scope model
 * Pass reads the whole Document, classifies it, and returns one Audit account.
 * It builds its request through the same helper `critique` and `readSection`
 * use, so what it sends and what it records cannot drift from the other shapes —
 * except the Screening frame, which the Audit's own method replaces (story
 * 154), and which `sendAudit` therefore never sets.
 *
 * Story 131: a Document longer than the character limit is split Section by
 * Section with overlap, each chunk is audited, and a second synthesis call
 * produces the document-level account. The Run reports its chunk count.
 */
export async function auditDocument(
  target: Target,
  pass: Pass,
  connection: Connection,
  config: RunConfig,
): Promise<AuditRunResult> {
  if (pass.kind !== "model") {
    throw new Error(`Pass "${pass.id}" is a rule Pass; an Audit run cannot run it.`);
  }
  if (!isAuditPass(pass)) throw new UnsupportedOutputShapeError(pass.output);

  const limit = config.characterLimit ?? DEFAULT_CHARACTER_LIMIT;
  const chunks = await chunkedResults(target, limit, pass, "Audit", (chunk) =>
    sendAudit(auditPrompt(pass, chunk), pass, connection, config),
  );
  if (chunks.length === 1) return chunks[0];

  const synthesis = await sendAudit(
    synthesisPrompt(chunks.map((chunk) => accountContent(chunk.account))),
    pass,
    connection,
    config,
  );
  const violations = dedupeViolations([
    ...chunks.flatMap((chunk) => chunk.violations),
    ...synthesis.violations,
  ]);
  const now = config.now ?? Date.now();
  const account: AuditAccount = {
    ...synthesis.account,
    provenance: provenanceFor(connection, config.revisionId, now),
    ...(violations.length === 0 ? {} : { violations }),
  };
  return {
    account,
    violations,
    rawResponse: [...chunks.map((chunk) => chunk.rawResponse), synthesis.rawResponse].join(
      "\n\n--- chunk ---\n\n",
    ),
    chunks: chunks.length,
  };
}

/** The Pass's prompt with the chunk's Target values filled in. */
function auditPrompt(pass: Pass, target: Target): string {
  return fillPrompt(pass.prompt ?? "", promptValues(target));
}

/**
 * The content the model authored, with Obelus's own `provenance` and the
 * linter's `violations` stripped. The synthesis call receives only this, so a
 * long Document's chunk metadata and any quarantined rewrite text never travel
 * back to the Provider on the second call.
 */
function accountContent(account: AuditAccount): AuditAccountContent {
  return {
    type: account.type,
    corePayload: account.corePayload,
    fallacies: account.fallacies,
    priority: account.priority,
    ...(account.argumentMap === undefined ? {} : { argumentMap: account.argumentMap }),
    ...(account.reasoning === undefined ? {} : { reasoning: account.reasoning }),
    ...(account.definitions === undefined ? {} : { definitions: account.definitions }),
  };
}

/**
 * One Audit model call: the request every chunk and the synthesis share, so the
 * two cannot drift in the schema, the frame exemption or the signal. The prompt
 * is the only thing that differs.
 */
async function sendAudit(
  prompt: string,
  pass: Pass,
  connection: Connection,
  config: RunConfig,
): Promise<AuditRunResult> {
  const built = buildPassRequest({
    pass,
    connection,
    prompt,
    schema: AUDIT_SCHEMA,
    // The global setting travels, but `buildPassRequest` refuses to attach a
    // frame to an Audit pass: its method defines its stance (story 154).
    screeningFrame: config.screeningFrame,
    ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
  });
  const request: ModelRequest = {
    ...built,
    ...(config.signal === undefined ? {} : { signal: config.signal }),
  };

  const rawResponse = await config.transport.send(request);
  return finishAudit(rawResponse, connection, config);
}

/** Parses one response into an account with its provenance and drift. */
function finishAudit(rawResponse: string, connection: Connection, config: RunConfig): AuditRunResult {
  const parsed = parseAuditAccount(rawResponse);
  const now = config.now ?? Date.now();
  const account: AuditAccount = {
    ...parsed.account,
    provenance: provenanceFor(connection, config.revisionId, now),
    ...(parsed.violations.length === 0 ? {} : { violations: parsed.violations }),
  };
  return { account, violations: parsed.violations, rawResponse, chunks: 1 };
}

/**
 * The synthesis prompt. It carries the constitution's two clauses itself, so a
 * synthesis call cannot drift even though the harness checks the Pass prompt.
 * It never quotes the piece back: the chunk accounts are the input.
 */
function synthesisPrompt(accounts: AuditAccountContent[]): string {
  const audits = accounts
    .map((account, index) => `CHUNK ${index + 1} AUDIT:\n${JSON.stringify(account)}`)
    .join("\n\n");
  return [
    "You audited a long document in sections. Here is what each section's audit found, as JSON.",
    "",
    audits,
    "",
    "Synthesize one Audit account for the whole document: one type, one core claim, the argument",
    "map, the reasoning kind and soundness, every fallacy or plain-terms fault that stands across",
    "chunks, any definitions, and the one or two things to fix first in priority.",
    "Return the same JSON shape. The piece is analyzed and never rewritten. " +
      "Do not praise the writing and do not suggest replacement prose.",
  ].join("\n");
}
