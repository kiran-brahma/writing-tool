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
  adversarialAuditResponse,
  adversarialJudgeResponse,
  adversarialReaderResponse,
  adversarialResponse,
  FIXTURE_DROPPED,
  FIXTURE_JUDGE_PRAISE,
  FIXTURE_JUDGE_REWRITE,
  FIXTURE_PRAISE,
  FIXTURE_REWRITE,
  HARNESS_AUDIT_PASSES,
  HARNESS_DOCUMENTS,
  HARNESS_DOCUMENT_PASSES,
  HARNESS_JUDGE_PASSAGES,
  HARNESS_PASSES,
  HARNESS_READER_PASSES,
} from "./fixtures";
import { storeHarnessReport } from "./store";

const RAN_AT = Date.UTC(2026, 8, 19, 12, 0, 0);

let report: HarnessReport;
let voiceListReport: HarnessReport;
let framedReport: HarnessReport;
let documentReport: HarnessReport;
let readerReport: HarnessReport;
let auditReport: HarnessReport;
let chunkedAuditReport: HarnessReport;
let judgeReport: JudgeHarnessReport;
let transports: FixtureTransport[];
let voiceListTransports: FixtureTransport[];
let framedTransports: FixtureTransport[];
let readerTransports: FixtureTransport[];
let auditTransports: FixtureTransport[];
let chunkedAuditTransports: Map<string, FixtureTransport>;
let judgeTransports: FixtureTransport[];

beforeAll(async () => {
  transports = [];
  readerTransports = [];
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

  // Story 151: the findings run with a Voice list, so the new system clause is
  // exercised through the real `critique` entry point and held to the same
  // constitution properties as every other findings case.
  voiceListTransports = [];
  voiceListReport = await runConstitutionHarness({
    connection: connection(),
    documents: HARNESS_DOCUMENTS,
    passes: HARNESS_PASSES,
    screeningFrame: true,
    voiceList: ["leverage", "at its core"],
    transportFor: (testCase) => {
      const transport = createFixtureTransport({
        respond: () => adversarialResponse(testCase.target),
      });
      voiceListTransports.push(transport);
      return transport;
    },
  });

  // Story 153: a non-default Screening frame is a new standing instruction, so
  // it runs through the real `critique` entry point and is held to the same
  // constitution properties as every other findings case.
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

  readerReport = await runConstitutionHarness({
    connection: connection(),
    documents: HARNESS_DOCUMENTS,
    passes: HARNESS_READER_PASSES,
    screeningFrame: true,
    transportFor: (testCase) => {
      const transport = createFixtureTransport({
        respond: () => adversarialReaderResponse(testCase.target),
      });
      readerTransports.push(transport);
      return transport;
    },
  });

  auditTransports = [];
  auditReport = await runConstitutionHarness({
    connection: connection(),
    documents: HARNESS_DOCUMENTS,
    passes: HARNESS_AUDIT_PASSES,
    screeningFrame: true,
    transportFor: (testCase) => {
      const transport = createFixtureTransport({
        respond: () => adversarialAuditResponse(testCase.target),
      });
      auditTransports.push(transport);
      return transport;
    },
  });

  // Story 131: a small character limit forces every fixture Document to chunk,
  // so the harness proves the audit splits, synthesizes and reports the count.
  chunkedAuditTransports = new Map();
  chunkedAuditReport = await runConstitutionHarness({
    connection: connection(),
    documents: HARNESS_DOCUMENTS,
    passes: HARNESS_AUDIT_PASSES,
    screeningFrame: true,
    characterLimit: 250,
    transportFor: (testCase) => {
      const transport = createFixtureTransport({
        respond: () => adversarialAuditResponse(testCase.target),
      });
      chunkedAuditTransports.set(`${testCase.documentId}:${testCase.passId}`, transport);
      return transport;
    },
  });

  // The Judge is not a Pass, so it gets its own small matrix. It is here because
  // `DESIGN.md` Rule 2 covers every returned string, and the Judge's reasons and
  // problem lists were the one model path no case scanned.
  judgeTransports = [];
  judgeReport = await runJudgeConstitutionHarness({
    connection: connection(),
    passages: HARNESS_JUDGE_PASSAGES,
    transportFor: () => {
      // The two swapped calls must agree on a side, so the label each call
      // prefers is supplied per call: `A` first, `B` under the swapped order.
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

  it("holds the Findings prompts to the constitution with a Voice list attached", () => {
    expect(voiceListReport.cases).toHaveLength(9);
    expect(voiceListReport.ok).toBe(true);
    for (const testCase of voiceListReport.cases) {
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

    // The clause reached the request as a system instruction, not as prose.
    expect(JSON.stringify(voiceListTransports[0].requests[0].body)).toContain("their own voice");
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

    // The chosen frame reached the request as the system instruction, not as
    // prose, and it kept the constitution's clauses.
    const system = JSON.stringify(framedTransports[0].requests[0].body);
    expect(system).toContain("hostile domain expert");
    expect(system).toContain("do not praise the writing");
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

  it("runs the Reader pass over the fixture Documents with the account checks", () => {
    expect(HARNESS_READER_PASSES).toHaveLength(1);
    expect(readerReport.cases).toHaveLength(3);
    expect(readerReport.ok).toBe(true);
  });

  it("holds the Reader prompt and account to the same constitution properties", () => {
    for (const testCase of readerReport.cases) {
      expect(testCase.error).toBeNull();
      expect(testCase.account).not.toBeNull();
      expect(testCase.account).not.toHaveProperty("rewrite");
      expect(testCase.violations).toContainEqual({ kind: "praise", text: FIXTURE_PRAISE });
      expect(testCase.violations).toContainEqual({ kind: "rewrite", text: FIXTURE_REWRITE });
      for (const name of [
        "parses",
        "praiseFlagged",
        "noRewriteField",
        "promptConstitution",
      ] as const) {
        expect(check(testCase, name).ok, `${testCase.passId} ${name}`).toBe(true);
      }
    }

    // The constitutional guarantee is the schema itself: the request closes the
    // object and carries no field for rewritten prose. The prompt names
    // "replacement prose" only to ban it, so the assertion is on the schema.
    const body = JSON.stringify(readerTransports[0].requests[0].body);
    expect(body).toContain('"additionalProperties":false');
    expect(body).not.toContain("rewrite");
  });

  it("runs the Audit pass over the fixture Documents with the account checks", () => {
    expect(HARNESS_AUDIT_PASSES).toHaveLength(1);
    expect(auditReport.cases).toHaveLength(3);
    expect(auditReport.ok).toBe(true);
  });

  it("holds the Audit prompt and account to the same constitution properties", () => {
    for (const testCase of auditReport.cases) {
      expect(testCase.error).toBeNull();
      expect(testCase.auditAccount).not.toBeNull();
      expect(testCase.auditAccount).not.toHaveProperty("rewrite");
      expect(testCase.violations).toContainEqual({ kind: "praise", text: FIXTURE_PRAISE });
      expect(testCase.violations).toContainEqual({ kind: "rewrite", text: FIXTURE_REWRITE });
      for (const name of [
        "parses",
        "praiseFlagged",
        "noRewriteField",
        "promptConstitution",
      ] as const) {
        expect(check(testCase, name).ok, `${testCase.passId} ${name}`).toBe(true);
      }
    }

    // The constitutional guarantee is the schema itself: the request closes the
    // object and carries no field for rewritten prose.
    const body = JSON.stringify(auditTransports[0].requests[0].body);
    expect(body).toContain('"additionalProperties":false');
    expect(body).not.toContain("rewrite");
  });

  it("chunks a long Audit and reports its chunk count", () => {
    expect(chunkedAuditReport.cases).toHaveLength(3);
    for (const testCase of chunkedAuditReport.cases) {
      expect(testCase.error).toBeNull();
      expect(testCase.chunks).toBeGreaterThan(1);
      expect(testCase.auditAccount).not.toBeNull();
      expect(check(testCase, "parses").ok).toBe(true);
      expect(check(testCase, "praiseFlagged").ok).toBe(true);
      expect(check(testCase, "noRewriteField").ok).toBe(true);
    }
  });

  it("reports every model call a chunked Audit made, the synthesis included", () => {
    // Story 131: `chunks` is how many calls the Run took — one per chunk, plus
    // the synthesis over their accounts.
    for (const testCase of chunkedAuditReport.cases) {
      const transport = chunkedAuditTransports.get(`${testCase.documentId}:${testCase.passId}`);
      expect(transport?.requests.length).toBeGreaterThan(2);
      expect(testCase.chunks).toBe(transport?.requests.length);
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
      // Two calls: the answer and its label-swapped twin.
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
