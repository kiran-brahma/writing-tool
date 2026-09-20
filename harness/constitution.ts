import { resolveAnchor } from "../src/core/anchor";
import { isContained } from "../src/core/containment";
import { critique, type Target } from "../src/core/critique";
import { describeError } from "../src/errors";
import type { Finding, Violation } from "../src/core/finding";
import type { Pass } from "../src/core/pass";
import { isReaderPass } from "../src/core/pass";
import { targetForPass } from "../src/core/passContext";
import { readSection, type ReaderAccount } from "../src/core/reader";
import { constitutionPromptClauses } from "../src/core/starterPasses";
import { extractJson } from "../src/core/parseFindings";
import type { Connection } from "../src/wire/connection";
import type { Transport } from "../src/wire/transport";
import {
  FIXTURE_DROPPED,
  FIXTURE_PRAISE,
  FIXTURE_REWRITE,
  type HarnessDocument,
} from "./fixtures";

/**
 * The constitution regression harness. It runs three fixture Documents × three
 * model Passes through the real `critique` entry point and asserts the four
 * properties the constitution rests on: the output parses, praise is flagged by
 * the linter rather than silently kept, no rewrite field survives into a
 * Finding, and every kept Finding anchors inside its Target. A fifth check
 * guards the prompt clauses those properties depend on, so editing a Pass
 * prompt into a constitution breach fails the harness rather than passing
 * silently.
 *
 * The transport is injected per case, so the harness can answer each case with
 * the same adversarial fixture response while still exercising the whole path
 * above the seam. The result is timestamped and stored by the caller; the
 * harness itself never touches the UI.
 */

export interface HarnessCase {
  documentId: string;
  passId: string;
  target: Target;
}

export type HarnessCheckName =
  | "parses"
  | "praiseFlagged"
  | "noRewriteField"
  | "anchorsContained"
  | "promptConstitution";

export interface HarnessCheck {
  name: HarnessCheckName;
  ok: boolean;
  detail: string;
}

export interface HarnessCaseResult {
  documentId: string;
  passId: string;
  /** Null only when the fixture Document had no Target Paragraph at all. */
  target: Target | null;
  ok: boolean;
  checks: HarnessCheck[];
  findings: Finding[];
  violations: Violation[];
  droppedAnchors: number;
  /** The Reader account a section-summary Pass returned, if any. */
  account: ReaderAccount | null;
  rawResponse: string | null;
  error: string | null;
}

export interface HarnessReport {
  ok: boolean;
  ranAt: number;
  cases: HarnessCaseResult[];
}

export interface HarnessOptions {
  connection: Connection;
  documents: HarnessDocument[];
  passes: Pass[];
  screeningFrame: boolean;
  /** One Transport per case, so each case can carry its own recorded response. */
  transportFor: (testCase: HarnessCase) => Transport;
  /** Fixed for a reproducible result; defaults to now. */
  now?: number;
}

export async function runConstitutionHarness(
  options: HarnessOptions,
): Promise<HarnessReport> {
  const ranAt = options.now ?? Date.now();
  const cases: HarnessCaseResult[] = [];

  for (const document of options.documents) {
    for (const pass of options.passes) {
      const target = targetForPass(pass, document.tree, document.targetBlockIndex, document.title);
      if (target === null) {
        cases.push(
          failureCase(
            document.id,
            pass.id,
            null,
            `Fixture Document "${document.id}" has no Target Paragraph.`,
          ),
        );
        continue;
      }
      cases.push(await runCase({ documentId: document.id, passId: pass.id, target }, pass, options, ranAt));
    }
  }

  return { ok: cases.every((testCase) => testCase.ok), ranAt, cases };
}

async function runCase(
  testCase: HarnessCase,
  pass: Pass,
  options: HarnessOptions,
  ranAt: number,
): Promise<HarnessCaseResult> {
  // The Reader account is a different output shape with different checks: it
  // has no Anchors to contain, but the same parser, linter and prompt clauses
  // guard it. Dispatching here keeps one harness for every model Pass.
  if (isReaderPass(pass)) return runReaderCase(testCase, pass, options, ranAt);

  let run;
  try {
    run = await critique(testCase.target, pass, options.connection, {
      transport: options.transportFor(testCase),
      screeningFrame: options.screeningFrame,
      revisionId: "harness-revision",
      now: ranAt,
    });
  } catch (error) {
    // A response the parser cannot read is a failed case, not a thrown harness:
    // the report records it against the case that produced it.
    return failureCase(testCase.documentId, testCase.passId, testCase.target, describeError(error));
  }

  const checks: HarnessCheck[] = [
    parseCheck(run.rawResponse),
    praiseCheck(run.violations),
    rewriteCheck(run.findings, run.violations),
    containmentCheck(run.findings, testCase.target, run.droppedAnchors, pass.scope),
    promptCheck(pass),
  ];

  return {
    documentId: testCase.documentId,
    passId: testCase.passId,
    target: testCase.target,
    ok: checks.every((check) => check.ok),
    checks,
    findings: run.findings,
    violations: run.violations,
    droppedAnchors: run.droppedAnchors,
    account: null,
    rawResponse: run.rawResponse,
    error: null,
  };
}

/**
 * The Reader-pass half of a harness case: the same parser, linter and prompt
 * checks as a Findings case, without Containment. A Reader account has no
 * Anchor to contain; the rewrite check is what proves its schema refuses
 * replacement prose.
 */
async function runReaderCase(
  testCase: HarnessCase,
  pass: Pass,
  options: HarnessOptions,
  ranAt: number,
): Promise<HarnessCaseResult> {
  let run;
  try {
    run = await readSection(testCase.target, pass, options.connection, {
      transport: options.transportFor(testCase),
      screeningFrame: options.screeningFrame,
      revisionId: "harness-revision",
      now: ranAt,
    });
  } catch (error) {
    return failureCase(testCase.documentId, testCase.passId, testCase.target, describeError(error));
  }

  const checks: HarnessCheck[] = [
    parseCheck(run.rawResponse),
    praiseCheck(run.violations),
    accountRewriteCheck(run.account, run.violations),
    promptCheck(pass),
  ];

  return {
    documentId: testCase.documentId,
    passId: testCase.passId,
    target: testCase.target,
    ok: checks.every((check) => check.ok),
    checks,
    findings: [],
    violations: run.violations,
    droppedAnchors: 0,
    account: run.account,
    rawResponse: run.rawResponse,
    error: null,
  };
}

/** Parses the raw response independently of the parser under test. */
function parseCheck(rawResponse: string): HarnessCheck {
  try {
    extractJson(rawResponse);
    return {
      name: "parses",
      ok: true,
      detail: "The response contained JSON the parser could read.",
    };
  } catch (error) {
    return { name: "parses", ok: false, detail: describeError(error) };
  }
}

function praiseCheck(violations: Violation[]): HarnessCheck {
  const flagged = violations.some(
    (violation) => violation.kind === "praise" && violation.text === FIXTURE_PRAISE,
  );
  return {
    name: "praiseFlagged",
    ok: flagged,
    detail: flagged
      ? `The linter flagged the fixture's praise "${FIXTURE_PRAISE}".`
      : `The linter did not flag the fixture's praise "${FIXTURE_PRAISE}".`,
  };
}

function rewriteCheck(findings: Finding[], violations: Violation[]): HarnessCheck {
  const leaked = findings.filter((finding) => "rewrite" in finding);
  const quarantined = violations.some(
    (violation) => violation.kind === "rewrite" && violation.text === FIXTURE_REWRITE,
  );
  const ok = leaked.length === 0 && quarantined;

  return {
    name: "noRewriteField",
    ok,
    detail: ok
      ? `No Finding carried a rewrite field; "${FIXTURE_REWRITE}" was quarantined as a Violation.`
      : `${leaked.length} Finding(s) carried a rewrite field; quarantined=${String(quarantined)}.`,
  };
}

/** The reader-account half of the rewrite check: no rewrite field, quarantined. */
function accountRewriteCheck(account: ReaderAccount, violations: Violation[]): HarnessCheck {
  const leaked = "rewrite" in account;
  const quarantined = violations.some(
    (violation) => violation.kind === "rewrite" && violation.text === FIXTURE_REWRITE,
  );
  const ok = !leaked && quarantined;

  return {
    name: "noRewriteField",
    ok,
    detail: ok
      ? `The Reader account carried no rewrite field; "${FIXTURE_REWRITE}" was quarantined.`
      : `Reader account rewrite field leaked=${String(leaked)}; quarantined=${String(quarantined)}.`,
  };
}

function containmentCheck(
  findings: Finding[],
  target: Target,
  dropped: number,
  scope: Pass["scope"],
): HarnessCheck {
  const outside = findings.filter(
    (finding) => !isContained(resolveAnchor(finding.anchor, target.canonical), target.interval),
  );
  // A structural Pass is shown the whole Document, so the fixture's
  // context-above Finding is inside its Target and must be kept, not dropped.
  const expectedDropped = scope === "document" ? 0 : FIXTURE_DROPPED;
  const ok = outside.length === 0 && dropped === expectedDropped;

  return {
    name: "anchorsContained",
    ok,
    detail: ok
      ? `Every kept Finding anchored inside the Target; ${dropped} outside Finding(s) dropped.`
      : `${outside.length} kept Finding(s) fell outside the Target; dropped=${dropped}, expected ${expectedDropped}.`,
  };
}

/** The prompt clauses the constitution depends on; a Pass that drops one fails. */
function promptCheck(pass: Pass): HarnessCheck {
  const prompt = pass.prompt ?? "";
  const missing = constitutionPromptClauses(pass.scope).filter(
    (clause) => !clause.pattern.test(prompt),
  );
  return {
    name: "promptConstitution",
    ok: missing.length === 0,
    detail:
      missing.length === 0
        ? `"${pass.id}" keeps every clause the constitution depends on.`
        : `"${pass.id}" dropped: ${missing.map((clause) => clause.name).join(", ")}.`,
  };
}

/** A case that could not run: the checks collapse to the parse failure. */
function failureCase(
  documentId: string,
  passId: string,
  target: Target | null,
  error: string,
): HarnessCaseResult {
  return {
    documentId,
    passId,
    target,
    ok: false,
    checks: [{ name: "parses", ok: false, detail: error }],
    findings: [],
    violations: [],
    droppedAnchors: 0,
    account: null,
    rawResponse: null,
    error,
  };
}
