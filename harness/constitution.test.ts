import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveAnchor } from "../src/core/anchor";
import type { Pass } from "../src/core/pass";
import { CLICHE_PASS } from "../src/core/starterPasses";
import {
  CONNECTION_PREFILLS,
  connectionFromPrefill,
  type Connection,
} from "../src/wire/connection";
import { createFixtureTransport, type FixtureTransport } from "../src/wire/fixtureTransport";
import {
  runConstitutionHarness,
  type HarnessCaseResult,
  type HarnessCheckName,
  type HarnessReport,
} from "./constitution";
import {
  adversarialResponse,
  FIXTURE_DROPPED,
  FIXTURE_PRAISE,
  FIXTURE_REWRITE,
  HARNESS_DOCUMENTS,
  HARNESS_DOCUMENT_PASSES,
  HARNESS_PASSES,
} from "./fixtures";
import { storeHarnessReport } from "./store";

const RAN_AT = Date.UTC(2026, 8, 19, 12, 0, 0);

let report: HarnessReport;
let documentReport: HarnessReport;
let transports: FixtureTransport[];

beforeAll(async () => {
  transports = [];
  report = await runConstitutionHarness({
    connection: connection(),
    documents: HARNESS_DOCUMENTS,
    passes: HARNESS_PASSES,
    screeningFrame: true,
    // No fixed clock: the stored timestamp is the real run time, so successive
    // runs leave a history rather than overwriting one file.
    transportFor: (testCase) => {
      const transport = createFixtureTransport({
        respond: () => adversarialResponse(testCase.target),
      });
      transports.push(transport);
      return transport;
    },
  });

  documentReport = await runConstitutionHarness({
    connection: connection(),
    documents: HARNESS_DOCUMENTS,
    passes: HARNESS_DOCUMENT_PASSES,
    screeningFrame: true,
    transportFor: (testCase) =>
      createFixtureTransport({ respond: () => adversarialResponse(testCase.target) }),
  });
});

function connection(): Connection {
  const prefill = CONNECTION_PREFILLS.find((entry) => entry.id === "openai");
  if (prefill === undefined) throw new Error("no openai prefill in the Connection table");
  return { ...connectionFromPrefill(prefill), model: "harness-model", apiKey: "harness-key" };
}

function check(testCase: HarnessCaseResult, name: HarnessCheckName) {
  const found = testCase.checks.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`case ${testCase.passId} has no "${name}" check`);
  return found;
}

describe("constitution harness", () => {
  it("runs three fixture Documents × three model Passes", () => {
    expect(HARNESS_DOCUMENTS).toHaveLength(3);
    expect(HARNESS_PASSES).toHaveLength(3);
    expect(report.cases).toHaveLength(9);
    expect(report.ok).toBe(true);
  });

  it("asserts that model output parses", () => {
    for (const testCase of report.cases) {
      expect(testCase.error).toBeNull();
      expect(testCase.findings.length).toBeGreaterThan(0);
      expect(check(testCase, "parses").ok).toBe(true);
    }
  });

  it("asserts that no un-flagged praise survives the linter", () => {
    for (const testCase of report.cases) {
      expect(testCase.violations).toContainEqual({ kind: "praise", text: FIXTURE_PRAISE });
      expect(check(testCase, "praiseFlagged").ok).toBe(true);
    }
  });

  it("asserts that no rewrite field ever appears in a response", () => {
    for (const testCase of report.cases) {
      expect(testCase.violations).toContainEqual({ kind: "rewrite", text: FIXTURE_REWRITE });
      for (const finding of testCase.findings) {
        expect(finding).not.toHaveProperty("rewrite");
      }
      expect(check(testCase, "noRewriteField").ok).toBe(true);
    }

    // The request schema has no field for rewritten prose either.
    expect(JSON.stringify(transports[0].requests[0].body)).not.toContain("rewrite");
  });

  it("asserts that Findings anchor inside their Target", () => {
    for (const testCase of report.cases) {
      expect(testCase.target).not.toBeNull();
      if (testCase.target === null) continue;
      expect(testCase.droppedAnchors).toBe(FIXTURE_DROPPED);
      expect(check(testCase, "anchorsContained").ok).toBe(true);
      for (const finding of testCase.findings) {
        const interval = resolveAnchor(finding.anchor, testCase.target.canonical);
        expect(interval).not.toBeNull();
        expect(interval?.start ?? -1).toBeGreaterThanOrEqual(testCase.target.interval.start);
        expect(interval?.end ?? -1).toBeLessThanOrEqual(testCase.target.interval.end);
      }
    }
  });

  it("asserts every Pass prompt keeps the constitution's clauses", () => {
    for (const testCase of report.cases) {
      expect(check(testCase, "promptConstitution").ok).toBe(true);
    }
  });

  it("runs three fixture Documents × the two document-scope model Passes", () => {
    expect(HARNESS_DOCUMENT_PASSES).toHaveLength(2);
    expect(documentReport.cases).toHaveLength(6);
    expect(documentReport.ok).toBe(true);
  });

  it("holds the document-scope prompts to the same four properties", () => {
    for (const testCase of documentReport.cases) {
      expect(testCase.error).toBeNull();
      expect(testCase.findings.length).toBeGreaterThan(0);
      // The whole Document is the Target, so the fixture's context-above
      // Finding is inside it: nothing is dropped for a structural Pass.
      expect(testCase.droppedAnchors).toBe(0);
      for (const name of [
        "parses",
        "praiseFlagged",
        "noRewriteField",
        "anchorsContained",
        "promptConstitution",
      ] as const) {
        expect(check(testCase, name).ok, `${testCase.passId} ${name}`).toBe(true);
      }
    }
  });

  it("fails a Pass whose prompt drops a constitution clause", async () => {
    const stripped: Pass = {
      ...CLICHE_PASS,
      prompt: (CLICHE_PASS.prompt ?? "").replace(
        "Do not praise the writing and do not suggest replacement prose.",
        "",
      ),
    };
    const drifted = await runConstitutionHarness({
      connection: connection(),
      documents: [HARNESS_DOCUMENTS[0]],
      passes: [stripped],
      screeningFrame: true,
      now: RAN_AT,
      transportFor: () => createFixtureTransport({ respond: () => adversarialResponse(firstTarget()) }),
    });

    expect(drifted.ok).toBe(false);
    expect(check(drifted.cases[0], "promptConstitution").ok).toBe(false);
  });

  it("stores the result locally with a timestamp", () => {
    const path = storeHarnessReport(process.cwd(), report);

    expect(path).toMatch(/\.scratch\/harness\/.+\.json$/);
    const stored = JSON.parse(readFileSync(path, "utf8")) as HarnessReport;
    expect(stored.ranAt).toBe(report.ranAt);
    expect(stored.ranAt).toBeGreaterThan(0);
    expect(stored.ok).toBe(true);
    expect(stored.cases).toHaveLength(9);

    // The manual run needs to show the Writer the result and the timestamp,
    // whatever reporter is watching; stderr is not intercepted.
    process.stderr.write(
      `constitution harness: ${report.ok ? "PASS" : "FAIL"} at ` +
        `${new Date(report.ranAt).toISOString()} -> ${path}\n`,
    );
  });

  it("fails a case whose model output does not parse", async () => {
    const broken = await runConstitutionHarness({
      connection: connection(),
      documents: HARNESS_DOCUMENTS,
      passes: HARNESS_PASSES,
      screeningFrame: true,
      now: RAN_AT,
      transportFor: () => createFixtureTransport({ respond: () => "this is not JSON" }),
    });

    expect(broken.ok).toBe(false);
    for (const testCase of broken.cases) {
      expect(check(testCase, "parses").ok).toBe(false);
      expect(testCase.error).not.toBeNull();
    }
  });
});

/** The Target the one-document drift test uses, to keep its response well-formed. */
function firstTarget() {
  const target = report.cases[0].target;
  if (target === null) throw new Error("first harness case has no Target");
  return target;
}
