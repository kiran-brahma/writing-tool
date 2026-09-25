import { resolveAnchor } from "../src/core/anchor";
import { auditDocument, type AuditAccount } from "../src/core/audit";
import { isContained } from "../src/core/containment";
import { critique, type Target } from "../src/core/critique";
import { describeError } from "../src/errors";
import type { Finding, Violation } from "../src/core/finding";
import { judge } from "../src/core/judge";
import type { Pass } from "../src/core/pass";
import { isAuditPass, isReaderPass } from "../src/core/pass";
import { targetForPass } from "../src/core/passContext";
import { readSection, type ReaderAccount } from "../src/core/reader";
import { constitutionPromptClauses } from "../src/core/starterPasses";
import { extractJson } from "../src/core/parseFindings";
import type { Connection } from "../src/wire/connection";
import type { Transport } from "../src/wire/transport";
import {
  FIXTURE_DROPPED,
  FIXTURE_IN_TARGET_ISSUES,
  FIXTURE_JUDGE_PRAISE,
  FIXTURE_JUDGE_REWRITE,
  FIXTURE_OUT_OF_TARGET_ISSUES,
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
  /** The Audit account an audit Pass returned, if any. */
  auditAccount: AuditAccount | null;
  /** Story 131: how many chunks the Run was split into; 1 when it fit. */
  chunks: number;
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
  /**
   * Story 131: the character limit for a chunked Run. Omitted, the Core default
   * applies and a short fixture Document is never split.
   */
  characterLimit?: number;
  /**
   * Story 151: the Voice list for a Findings case, so the harness exercises the
   * new system clause. Omitted, no Voice list is sent.
   */
  voiceList?: string[];
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
  // The Audit is a different output shape again, document-scoped and schema-
  // guided; it too shares the parser, linter and prompt clauses.
  if (isAuditPass(pass)) return runAuditCase(testCase, pass, options, ranAt);

  let run;
  try {
    run = await critique(testCase.target, pass, options.connection, {
      transport: options.transportFor(testCase),
      screeningFrame: options.screeningFrame,
      revisionId: "harness-revision",
      now: ranAt,
      ...(options.characterLimit === undefined ? {} : { characterLimit: options.characterLimit }),
      ...(options.voiceList === undefined ? {} : { voiceList: options.voiceList }),
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
    auditAccount: null,
    chunks: run.chunks,
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
    auditAccount: null,
    chunks: 1,
    rawResponse: run.rawResponse,
    error: null,
  };
}

/**
 * The Audit-pass half of a harness case: the same parser, linter and prompt
 * checks as a Findings case, without Containment. An Audit account has no
 * Anchor to contain; the rewrite check is what proves its schema refuses
 * replacement prose, and the chunk count proves a long Document was split and
 * synthesized rather than silently cut.
 */
async function runAuditCase(
  testCase: HarnessCase,
  pass: Pass,
  options: HarnessOptions,
  ranAt: number,
): Promise<HarnessCaseResult> {
  let run;
  try {
    run = await auditDocument(testCase.target, pass, options.connection, {
      transport: options.transportFor(testCase),
      screeningFrame: options.screeningFrame,
      revisionId: "harness-revision",
      now: ranAt,
      ...(options.characterLimit === undefined ? {} : { characterLimit: options.characterLimit }),
    });
  } catch (error) {
    return failureCase(testCase.documentId, testCase.passId, testCase.target, describeError(error));
  }

  const checks: HarnessCheck[] = [
    parseCheck(run.rawResponse),
    praiseCheck(run.violations),
    auditRewriteCheck(run.account, run.violations),
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
    account: null,
    auditAccount: run.account,
    chunks: run.chunks,
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
  // The field check above cannot fire on its own: a Finding is built from a
  // fixed key set, so a smuggled `rewrite` is dropped before it could appear.
  // What can fail, and is the real property, is the quarantined string never
  // reaching a Finding's text.
  const smuggled = findings.filter((finding) => findingText(finding).includes(FIXTURE_REWRITE));
  const quarantined = violations.some(
    (violation) => violation.kind === "rewrite" && violation.text === FIXTURE_REWRITE,
  );
  const ok = leaked.length === 0 && smuggled.length === 0 && quarantined;

  return {
    name: "noRewriteField",
    ok,
    detail: ok
      ? `No Finding carried a rewrite field or text; "${FIXTURE_REWRITE}" was quarantined as a Violation.`
      : `${leaked.length} Finding(s) carried a rewrite field, ${smuggled.length} carried the ` +
        `rewrite text; quarantined=${String(quarantined)}.`,
  };
}

/** Every string a Finding carries, for the smuggled-prose check. */
function findingText(finding: Finding): string {
  return [finding.issue, finding.diagnosis, finding.pattern ?? "", finding.anchor.quote].join("\n");
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

/** The Audit-account half of the rewrite check: no rewrite field, quarantined. */
function auditRewriteCheck(account: AuditAccount, violations: Violation[]): HarnessCheck {
  const leaked = "rewrite" in account;
  const quarantined = violations.some(
    (violation) => violation.kind === "rewrite" && violation.text === FIXTURE_REWRITE,
  );
  const ok = !leaked && quarantined;

  return {
    name: "noRewriteField",
    ok,
    detail: ok
      ? `The Audit account carried no rewrite field; "${FIXTURE_REWRITE}" was quarantined.`
      : `Audit account rewrite field leaked=${String(leaked)}; quarantined=${String(quarantined)}.`,
  };
}

function containmentCheck(
  findings: Finding[],
  target: Target,
  dropped: number,
  scope: Pass["scope"],
): HarnessCheck {
  // A structural Pass is shown the whole Document, so the fixture's
  // context-above Finding is inside its Target and must be kept, not dropped.
  const expectedDropped = scope === "document" ? 0 : FIXTURE_DROPPED;
  const expectedIssues =
    scope === "document"
      ? [...FIXTURE_IN_TARGET_ISSUES, ...FIXTURE_OUT_OF_TARGET_ISSUES]
      : FIXTURE_IN_TARGET_ISSUES;
  const forbiddenIssues = scope === "document" ? [] : FIXTURE_OUT_OF_TARGET_ISSUES;

  // Asserted against the fixture's own labels rather than by re-running the
  // containment primitives production already ran: recomputing
  // `isContained(resolveAnchor(...))` here could never disagree with the code
  // under test, so it could never fail.
  const kept = findings.map((finding) => finding.issue);
  const missing = expectedIssues.filter((issue) => !kept.includes(issue));
  const leaked = forbiddenIssues.filter((issue) => kept.includes(issue));
  // Secondary, and not the load-bearing assertion: this can only agree with the
  // containment path. The label check above is what can fail.
  const outside = findings.filter(
    (finding) => !isContained(resolveAnchor(finding.anchor, target.canonical), target.interval),
  );
  const ok =
    missing.length === 0 && leaked.length === 0 && outside.length === 0 && dropped === expectedDropped;

  return {
    name: "anchorsContained",
    ok,
    detail: ok
      ? `Every expected Finding survived; ${dropped} outside Finding(s) dropped.`
      : `missing=[${missing.join(", ")}] leaked=[${leaked.join(", ")}] ` +
        `outside=${outside.length} dropped=${dropped}, expected ${expectedDropped}.`,
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
    auditAccount: null,
    chunks: 0,
    rawResponse: null,
    error,
  };
}

/**
 * One Judge case: the two passages compared and what the constitution checked.
 * The Judge is not a Pass, so it is not part of the Pass matrices above; it
 * gets this small one because `DESIGN.md` Rule 2 covers every returned string,
 * and the Judge's reasons and problem lists were the one model path no test
 * scanned.
 */
export interface JudgeHarnessCase {
  id: string;
  ok: boolean;
  checks: HarnessCheck[];
  violations: Violation[];
  stable: boolean;
  error: string | null;
}

export interface JudgeHarnessReport {
  ok: boolean;
  ranAt: number;
  cases: JudgeHarnessCase[];
}

export interface JudgeHarnessOptions {
  connection: Connection;
  passages: { id: string; before: string; after: string }[];
  /** One Transport per case, so each case carries its own recorded response. */
  transportFor: (id: string) => Transport;
  now?: number;
}

/**
 * The Judge half of the constitution harness. It runs the real `judge` entry
 * point over each passage pair with an adversarial response and asserts the
 * properties the constitution rests on for the Judge too: the answer parses,
 * praise in a reason or a problem list is flagged rather than shown, and the
 * rewrite the model offered is quarantined rather than kept.
 */
export async function runJudgeConstitutionHarness(
  options: JudgeHarnessOptions,
): Promise<JudgeHarnessReport> {
  const ranAt = options.now ?? Date.now();
  const cases: JudgeHarnessCase[] = [];

  for (const passage of options.passages) {
    try {
      const result = await judge(passage.before, passage.after, options.connection, {
        transport: options.transportFor(passage.id),
        // Fixed so the fixture's per-call labels map to a stable Verdict; a
        // randomised order would make the case's stability a coin flip.
        labelOrder: ["A", "B"],
      });
      const checks: HarnessCheck[] = [
        judgeParseCheck(result.stable),
        judgePraiseCheck(result.violations),
        judgeRewriteCheck(result.violations),
      ];
      cases.push({
        id: passage.id,
        ok: checks.every((check) => check.ok),
        checks,
        violations: result.violations,
        stable: result.stable,
        error: null,
      });
    } catch (error) {
      cases.push({
        id: passage.id,
        ok: false,
        checks: [{ name: "parses", ok: false, detail: describeError(error) }],
        violations: [],
        stable: false,
        error: describeError(error),
      });
    }
  }

  return { ok: cases.every((testCase) => testCase.ok), ranAt, cases };
}

/** The Judge answered in the schema, producing a Verdict rather than Unstable. */
function judgeParseCheck(stable: boolean): HarnessCheck {
  return {
    name: "parses",
    ok: stable,
    detail: stable
      ? "The Judge's two answers agreed and produced a Verdict."
      : "The Judge's answers disagreed, so the fixture never reached a Verdict.",
  };
}

/** The Judge's praise is flagged, not rendered as an unmarked compliment. */
function judgePraiseCheck(violations: Violation[]): HarnessCheck {
  const flagged = violations.some(
    (violation) => violation.kind === "praise" && violation.text === FIXTURE_JUDGE_PRAISE,
  );
  return {
    name: "praiseFlagged",
    ok: flagged,
    detail: flagged
      ? `The linter flagged the Judge's praise "${FIXTURE_JUDGE_PRAISE}".`
      : `The linter did not flag the Judge's praise "${FIXTURE_JUDGE_PRAISE}".`,
  };
}

/** The rewrite the Judge offered is quarantined, never shown as usable prose. */
function judgeRewriteCheck(violations: Violation[]): HarnessCheck {
  const quarantined = violations.some(
    (violation) => violation.kind === "rewrite" && violation.text === FIXTURE_JUDGE_REWRITE,
  );
  return {
    name: "noRewriteField",
    ok: quarantined,
    detail: quarantined
      ? `The Judge's rewrite "${FIXTURE_JUDGE_REWRITE}" was quarantined as a Violation.`
      : `The Judge's rewrite was not quarantined; violations=${JSON.stringify(violations)}.`,
  };
}
