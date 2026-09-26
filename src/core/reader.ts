import type { Connection } from "../wire/connection";
import type { RunConfig } from "./critique";
import type { Provenance, Violation } from "./finding";
import { dedupeViolations } from "./lintViolations";
import { buildPassRequest, provenanceFor } from "./modelCall";
import { lintProseAroundSpan } from "./parseFindings";
import { isReaderPass, type Pass } from "./pass";
import {
  extractJsonWithSpan,
  UnsupportedOutputShapeError,
  violationsForFields,
} from "./parseFindings";
import { isRecord, stringOrNull } from "./parseJson";
import { fillPrompt, promptValues } from "./prompt";
import type { Target } from "./target";

/**
 * The Reader account: what a Section says, what a distracted reader would miss,
 * and the gap between the two. It is the `section-summary` output shape, and it
 * is analysis, not prose: the schema below is the whole shape, so there is no
 * field for a rewritten Section to travel through. A Reader pass is asked for
 * one Section at a time, over the one canonical string every other feature
 * measures against — DESIGN §6.
 */

/** The three fields the model authors, with their wire names. */
const READER_MODEL_FIELDS = [
  "what_this_section_says",
  "what_a_distracted_reader_would_miss",
  "gap_between_intent_and_effect",
] as const;

/**
 * The Reader account schema Obelus sends a model. Like the Findings schema,
 * this is a constitutional decision rather than a prompt instruction:
 * `additionalProperties: false` and the three string fields leave a model
 * nowhere to put replacement prose. The field names are the ones DESIGN §6
 * names, so the stored account needs no translation at the seam.
 */
export const READER_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    what_this_section_says: {
      type: "string",
      description: "What this Section communicates to a reader.",
    },
    what_a_distracted_reader_would_miss: {
      type: "string",
      description: "What a distracted reader would fail to take away from the Section.",
    },
    gap_between_intent_and_effect: {
      type: "string",
      description: "The gap between what the Section meant to do and what it does.",
    },
  },
  required: [...READER_MODEL_FIELDS],
  additionalProperties: false,
};

/** The fields a Reader account carries, in the domain's naming. */
export interface ReaderAccountContent {
  /** What the Section says. */
  whatItSays: string;
  /** What a distracted reader would miss. */
  whatIsMissed: string;
  /** The gap between what the Section meant and what it achieves. */
  gap: string;
}

/**
 * A Reader account with what produced it. It is stored as its own output shape,
 * derived from a Section: the account never masquerades as a Finding, and a
 * Finding never masquerades as an account.
 */
export interface ReaderAccount extends ReaderAccountContent {
  provenance: Provenance;
  /** Praise or rewrite-shaped content the linter caught, struck through on display. */
  violations?: Violation[];
}

export interface ParsedReaderAccount {
  account: ReaderAccountContent;
  /** Model drift across the whole response: praise and quarantined rewrites. */
  violations: Violation[];
}

export interface ReaderRunResult {
  account: ReaderAccount;
  violations: Violation[];
  rawResponse: string;
}

/** Raised when a response contains no Reader account Obelus can read. */
class ReaderAccountParseError extends Error {
  constructor(message = "The model response did not contain a Reader account Obelus could read.") {
    super(message);
    this.name = "ReaderAccountParseError";
  }
}

/**
 * Tolerant parsing, like the Findings parser and sharing its linter: extract
 * JSON from surrounding prose, validate the three fields, then lint every
 * returned string. An out-of-schema field is both linted — praise in it is
 * named as praise — and quarantined whole as a rewrite, because no
 * out-of-schema field may carry model prose toward the Writer. The prose around
 * the JSON is linted too, so praise the model wraps the object in cannot slip
 * through unseen.
 */
export function parseReaderAccount(raw: string): ParsedReaderAccount {
  const { value, span } = extractJsonWithSpan(raw);
  if (!isRecord(value)) throw new ReaderAccountParseError();

  const account = validateReaderAccount(value);
  if (account === null) throw new ReaderAccountParseError();

  const prose = lintProseAroundSpan(raw, span);
  return {
    account,
    violations: dedupeViolations([...violationsForFields(value, READER_MODEL_FIELDS), ...prose]),
  };
}

function validateReaderAccount(value: Record<string, unknown>): ReaderAccountContent | null {
  const whatItSays = stringOrNull(value.what_this_section_says);
  const whatIsMissed = stringOrNull(value.what_a_distracted_reader_would_miss);
  const gap = stringOrNull(value.gap_between_intent_and_effect);
  if (whatItSays === null || whatIsMissed === null || gap === null) return null;
  return { whatItSays, whatIsMissed, gap };
}

/**
 * The entry point above the seam for the Reader pass: one Section-scope model
 * Pass, one call, one Reader account. It builds the request and the provenance
 * through the same helpers `critique` uses, so the two output shapes cannot
 * drift apart in what they send or what they record.
 */
export async function readSection(
  target: Target,
  pass: Pass,
  connection: Connection,
  config: RunConfig,
): Promise<ReaderRunResult> {
  if (pass.kind !== "model") {
    throw new Error(`Pass "${pass.id}" is a rule Pass; a Reader run cannot run it.`);
  }
  if (!isReaderPass(pass)) throw new UnsupportedOutputShapeError(pass.output);

  const prompt = fillPrompt(pass.prompt ?? "", promptValues(target));
  const request = buildPassRequest({
    pass,
    connection,
    prompt,
    schema: READER_SCHEMA,
    screeningFrame: config.screeningFrame,
    ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
  });

  // #46: the Run's signal travels with the request, as it does for `critique`,
  // so a cancelled Reader Run stops waiting on the Provider.
  const rawResponse = await config.transport.send({
    ...request,
    ...(config.signal === undefined ? {} : { signal: config.signal }),
  });
  const parsed = parseReaderAccount(rawResponse);
  const now = config.now ?? Date.now();
  const account: ReaderAccount = {
    ...parsed.account,
    provenance: provenanceFor(connection, config.revisionId, now),
    ...(parsed.violations.length === 0 ? {} : { violations: parsed.violations }),
  };

  return { account, violations: parsed.violations, rawResponse };
}
