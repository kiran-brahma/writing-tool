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
  runJudgeConstitutionHarness,
  type HarnessCheck,
  type HarnessCheckName,
  type HarnessReport,
  type JudgeHarnessReport,
} from "./constitution";
import {
  adversarialJudgeResponse,
  adversarialResponse,
  FIXTURE_DROPPED,
  FIXTURE_JUDGE_PRAISE,
  FIXTURE_JUDGE_REWRITE,
  FIXTURE_PRAISE,
  FIXTURE_REWRITE,
  HARNESS_DOCUMENTS,
  HARNESS_JUDGE_PASSAGES,
  HARNESS_PASSES,
} from "./fixtures";
import { storeHarnessReport } from "./store";

const RAN_AT = Date.UTC(2026, 8, 19, 12, 0, 0);

let report: HarnessReport;
let framedReport: HarnessReport;
let judgeReport: JudgeHarnessReport;
let transports: FixtureTransport[];
let framedTransports: FixtureTransport[];
let judgeTransports: FixtureTransport[];

beforeAll(async () => {
  transports = [];
  report = await runConstitutionHarness({
    connection: connection(),
    documents: HARNESS_DOCUMENTS,
    passes: HARNESS_PASSES,
    screeningFrame: true,
    transportFor: (testCase) => {
      const transport = createFixtureTransport({
        respond: () => adversarialResponse(testCase.target),
      });
      transports.push(transport);
      return transport;
    },
  });

  framedTransports = [];
  framedReport = await runConstitutionHarness({
    connection: connection(),
    documents: HARNESS_DOCUMENTS,
    passes: HARNESS_PASSES.map((pass): Pass => ({ ...pass, frame: "skeptic" })),
    screeningFrame: true,
    transportFor: (testCase) => {
      const transport = createFixtureTransport({
        respond: () => adversarialResponse(testCase.target),
      });
      framedTransports.push(transport);
      return transport;
    },
  });

  judgeTransports = [];
  judgeReport = await runJudgeConstitutionHarness({
    connection: connection(),
    passages: HARNESS_JUDGE_PASSAGES,
    transportFor: () => {
      let call = 0;
      const transport = createFixtureTransport({
        respond: () => {
          call += 1;
          return adversarialJudgeResponse(call === 1 ? "A" : "B");
        },
      });
      judgeTransports.push(transport);
      return transport;
    },
  });
});

function connection(): Connection {
  const prefill = CONNECTION_PREFILLS.find((entry) => entry.id === "openai");
  if (prefill === undefined) throw new Error("no openai prefill in the Connection table");
  return { ...connectionFromPrefill(prefill), model: "harness-model", apiKey: "harness-key" };
}

function check(testCase: { checks: HarnessCheck[] }, name: HarnessCheckName) {
  const found = testCase.checks.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`case has no "${name}" check`);
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

  it("holds the Findings run to the constitution with a non-default frame", () => {
    expect(framedReport.cases).toHaveLength(9);
    expect(framedReport.ok).toBe(true);
    for (const testCase of framedReport.cases) {
      expect(testCase.error).toBeNull();
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

    const system = JSON.stringify(framedTransports[0].requests[0].body);
    expect(system).toContain("hostile domain expert");
    expect(system).toContain("do not praise the writing");
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
      transportFor: () =>
        createFixtureTransport({ respond: () => adversarialResponse(firstTarget()) }),
    });

    expect(drifted.ok).toBe(false);
    expect(check(drifted.cases[0], "promptConstitution").ok).toBe(false);
  });

  it("runs the Judge over every fixture passage pair", () => {
    expect(HARNESS_JUDGE_PASSAGES.length).toBeGreaterThanOrEqual(2);
    expect(judgeReport.cases).toHaveLength(HARNESS_JUDGE_PASSAGES.length);
    expect(judgeReport.ok).toBe(true);
  });

  it("asserts the Judge's answer parses into a stable Verdict", () => {
    for (const testCase of judgeReport.cases) {
      expect(testCase.error).toBeNull();
      expect(testCase.stable).toBe(true);
      expect(check(testCase, "parses").ok).toBe(true);
    }
  });

  it("asserts that Judge praise is flagged, not shown as an unmarked compliment", () => {
    for (const testCase of judgeReport.cases) {
      expect(testCase.violations).toContainEqual({ kind: "praise", text: FIXTURE_JUDGE_PRAISE });
      expect(check(testCase, "praiseFlagged").ok).toBe(true);
    }
  });

  it("asserts that a Judge rewrite is quarantined, never kept as prose", () => {
    for (const testCase of judgeReport.cases) {
      expect(testCase.violations).toContainEqual({ kind: "rewrite", text: FIXTURE_JUDGE_REWRITE });
      expect(check(testCase, "noRewriteField").ok).toBe(true);
    }
  });

  it("keeps the Judge's own request closed and free of a persona", () => {
    for (const transport of judgeTransports) {
      expect(transport.requests).toHaveLength(2);
      for (const request of transport.requests) {
        const body = JSON.stringify(request.body);
        expect(body).not.toContain("rewrite");
        expect(body).not.toContain("system");
      }
    }
  });

  it("stores the result locally with a timestamp", () => {
    const path = storeHarnessReport(process.cwd(), report);

    expect(path).toMatch(/\.scratch\/harness\/.+\.json$/);
    const stored = JSON.parse(readFileSync(path, "utf8")) as HarnessReport;
    expect(stored.ranAt).toBe(report.ranAt);
    expect(stored.ranAt).toBeGreaterThan(0);
    expect(stored.ok).toBe(true);
    expect(stored.cases).toHaveLength(9);

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

function firstTarget() {
  const target = report.cases[0].target;
  if (target === null) throw new Error("first harness case has no Target");
  return target;
}
