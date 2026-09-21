import { afterEach, describe, expect, it } from "vitest";
import type { DocTree } from "../core/docTree";
import type { Finding } from "../core/finding";
import { HEDGES_PASS, ORWELL_RULES_PASS } from "../core/starterPasses";
import { loadOrCreateDocument, persistDocument, withTree } from "./documents";
import {
  listFindings,
  listFindingsForPass,
  replaceFindingsForPass,
  declineFinding,
  markFindingAddressed,
  resolveDocumentFindings,
} from "./findings";
import { openObelusDatabase, type DocumentRecord, type ObelusDatabase } from "./obelusDatabase";
import { listRevisions, takeRevision } from "./revisions";
import { runRulePasses } from "./ruleRuns";

const openedDatabases: ObelusDatabase[] = [];

function uniqueName(): string {
  return `obelus-findings-${crypto.randomUUID()}`;
}

async function openTestDatabase(): Promise<ObelusDatabase> {
  const database = await openObelusDatabase(uniqueName());
  openedDatabases.push(database);
  return database;
}

afterEach(async () => {
  for (const database of openedDatabases.splice(0)) database.close();
});

function paragraphDoc(text: string): DocTree {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

async function save(
  database: ObelusDatabase,
  document: DocumentRecord,
  tree: DocTree,
  now: number,
): Promise<DocumentRecord> {
  const updated = withTree(document, tree, now);
  await persistDocument(database, updated);
  return updated;
}

describe("runRulePasses", () => {
  it("stores a Finding in the published shape with its provenance", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = await save(database, document, paragraphDoc("This is very good."), 1_100);

    const findings = await runRulePasses(database, saved, {
      passes: [HEDGES_PASS],
      now: 1_200,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      passId: "hedges",
      status: "open",
      anchor: { quote: "very", state: "attached" },
      provenance: { providerId: "local", model: "rule", at: 1_200 },
    });
    expect(findings[0].provenance.revisionId).toEqual(expect.any(String));

    const stored = await listFindings(database, document.id);
    expect(stored).toHaveLength(1);
    expect(Object.keys(stored[0])).not.toContain("documentId");
  });

  it("takes a baseline Revision so a Finding can name one", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = await save(database, document, paragraphDoc("very good"), 1_100);

    await runRulePasses(database, saved, { passes: [HEDGES_PASS], now: 1_200 });

    const revisions = await listRevisions(database, document.id);
    expect(revisions).toHaveLength(1);
  });

  it("takes no Revision when the Run finds nothing", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = await save(database, document, paragraphDoc("clean prose only"), 1_100);

    const findings = await runRulePasses(database, saved, { passes: [HEDGES_PASS], now: 1_200 });

    expect(findings).toEqual([]);
    expect(await listRevisions(database, document.id)).toEqual([]);
  });

  it("records the Revision current when the Finding was produced", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = await save(database, document, paragraphDoc("This is very good."), 1_100);

    await runRulePasses(database, saved, { passes: [HEDGES_PASS], now: 1_200 });

    const revisions = await listRevisions(database, document.id);
    const findings = await listFindingsForPass(database, document.id, HEDGES_PASS.id);
    const revision = revisions.find((entry) => entry.id === findings[0].provenance.revisionId);
    expect(revision?.canonical).toBe(saved.canonical);
  });

  it("does not duplicate a Finding when the same text is saved again", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = await save(database, document, paragraphDoc("very good"), 1_100);

    const first = await runRulePasses(database, saved, { passes: [HEDGES_PASS], now: 1_200 });
    const second = await runRulePasses(database, saved, { passes: [HEDGES_PASS], now: 1_300 });

    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(await listFindings(database, document.id)).toHaveLength(1);
  });

  it("re-resolves and orphans a Finding whose hedge is gone, keeping it open", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const withHedge = await save(database, document, paragraphDoc("very good"), 1_100);
    const first = await runRulePasses(database, withHedge, { passes: [HEDGES_PASS], now: 1_200 });

    const withoutHedge = await save(database, withHedge, paragraphDoc("good"), 1_300);
    const second = await runRulePasses(database, withoutHedge, {
      passes: [HEDGES_PASS],
      now: 1_400,
    });

    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].status).toBe("open");
    expect(second[0].anchor.state).toBe("orphaned");
    expect((await listFindings(database, document.id))[0].anchor.state).toBe("orphaned");
  });

  it("reconciles a rewritten hedge rather than double-flagging it", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const withVery = await save(database, document, paragraphDoc("very good"), 1_100);
    const first = await runRulePasses(database, withVery, { passes: [HEDGES_PASS], now: 1_200 });

    // "very" is rewritten to another hedge. Projection resolves the stored
    // Finding onto the same span the Run re-found, so it is one Finding.
    const withReally = await save(database, withVery, paragraphDoc("really good"), 1_300);
    const second = await runRulePasses(database, withReally, {
      passes: [HEDGES_PASS],
      now: 1_400,
    });

    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].anchor.state).toBe("attached");
    expect(await listFindings(database, document.id)).toHaveLength(1);
  });

  it("does not mint a Revision on the fast save debounce", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const first = await save(database, document, paragraphDoc("very good"), 1_100);
    await runRulePasses(database, first, { passes: [HEDGES_PASS], now: 1_200 });

    const second = await save(database, first, paragraphDoc("very good quite good"), 1_300);
    await runRulePasses(database, second, { passes: [HEDGES_PASS], now: 1_400 });

    expect(await listRevisions(database, document.id)).toHaveLength(1);
  });

  it("replaces only the Pass's Findings, leaving another Pass's intact", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = await save(database, document, paragraphDoc("very good"), 1_100);

    const otherPass = { ...HEDGES_PASS, id: "other" };
    await runRulePasses(database, saved, { passes: [HEDGES_PASS, otherPass], now: 1_200 });

    await replaceFindingsForPass(database, document.id, HEDGES_PASS.id, []);

    const remaining = await listFindings(database, document.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].passId).toBe("other");
  });

  it("produces no Findings for a disabled rule Pass", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = await save(database, document, paragraphDoc("This is very good."), 1_100);
    const disabled = { ...HEDGES_PASS, enabled: false };

    const findings = await runRulePasses(database, saved, { passes: [disabled], now: 1_200 });

    expect(findings).toEqual([]);
    expect(await listFindings(database, document.id)).toEqual([]);
  });

  it("runs an enabled exclusive Pass alone, holding the other rule Passes", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    // The prose trips both a hedge and Orwell's jargon; only Orwell may report.
    const saved = await save(
      database,
      document,
      paragraphDoc("This is very good and we leverage synergy."),
      1_100,
    );
    const orwell = { ...ORWELL_RULES_PASS, enabled: true };

    const findings = await runRulePasses(database, saved, {
      passes: [HEDGES_PASS, orwell],
      now: 1_200,
    });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.passId === "orwell")).toBe(true);
  });
});

describe("finding status", () => {
  async function storeOneFinding(): Promise<{
    database: ObelusDatabase;
    documentId: string;
    findingId: string;
  }> {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = await save(database, document, paragraphDoc("very good"), 1_100);
    const findings = await runRulePasses(database, saved, { passes: [HEDGES_PASS], now: 1_200 });
    return { database, documentId: document.id, findingId: findings[0].id };
  }

  it("marks a Finding addressed and persists it without a declineReason", async () => {
    const { database, documentId, findingId } = await storeOneFinding();

    const updated = await markFindingAddressed(database, findingId);

    expect(updated).toMatchObject({ id: findingId, status: "addressed" });
    expect(updated?.declineReason).toBeUndefined();
    const stored = await listFindings(database, documentId);
    expect(stored[0].status).toBe("addressed");
  });

  it("declines a Finding with the `advice` reason the caller passes", async () => {
    const { database, documentId, findingId } = await storeOneFinding();

    const updated = await declineFinding(database, findingId, "advice");

    expect(updated).toMatchObject({ id: findingId, status: "declined", declineReason: "advice" });
    const stored = await listFindings(database, documentId);
    expect(stored[0].declineReason).toBe("advice");
  });

  it("records `violation` when the constitution was breached", async () => {
    const { database, findingId } = await storeOneFinding();

    const updated = await declineFinding(database, findingId, "violation");

    expect(updated?.declineReason).toBe("violation");
  });

  it("does not raise a declined Finding again on a later Run of unchanged text", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = await save(database, document, paragraphDoc("very good"), 1_100);
    const first = await runRulePasses(database, saved, { passes: [HEDGES_PASS], now: 1_200 });
    await declineFinding(database, first[0].id, "advice");

    const second = await runRulePasses(database, saved, { passes: [HEDGES_PASS], now: 1_300 });

    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].status).toBe("declined");
    expect(second[0].declineReason).toBe("advice");
    expect(await listFindings(database, document.id)).toHaveLength(1);
  });

  it("does not raise an addressed Finding again either", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = await save(database, document, paragraphDoc("very good"), 1_100);
    const first = await runRulePasses(database, saved, { passes: [HEDGES_PASS], now: 1_200 });
    await markFindingAddressed(database, first[0].id);

    const second = await runRulePasses(database, saved, { passes: [HEDGES_PASS], now: 1_300 });

    expect(second[0].id).toBe(first[0].id);
    expect(second[0].status).toBe("addressed");
  });

  it("does not let a concurrent rule Run reset a status the Writer just set", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = await save(database, document, paragraphDoc("very good"), 1_100);
    const first = await runRulePasses(database, saved, { passes: [HEDGES_PASS], now: 1_200 });

    // A save's Run and the Writer's keypress overlap. Without one queue the Run
    // can commit an `open` copy after the status write and re-raise the Finding.
    await Promise.all([
      runRulePasses(database, saved, { passes: [HEDGES_PASS], now: 1_300 }),
      markFindingAddressed(database, first[0].id),
    ]);

    expect((await listFindings(database, document.id))[0].status).toBe("addressed");
  });

  it("returns null for a Finding id that is not stored", async () => {
    const { database } = await storeOneFinding();

    expect(await markFindingAddressed(database, "missing")).toBeNull();
    expect(await declineFinding(database, "missing", "advice")).toBeNull();
  });
});

describe("resolveDocumentFindings", () => {
  function storedFinding(quote: string, offset: number, revisionId: string): Finding {
    return {
      id: crypto.randomUUID(),
      passId: "cliche",
      promptHash: "hash",
      anchor: { quote, offset, state: "attached" },
      issue: "Cliché",
      diagnosis: "Worn.",
      status: "open",
      provenance: { providerId: "openai", model: "gpt-test", at: 1_200, revisionId },
    };
  }

  /** A Document with one manually stored Finding pinned to a Revision. */
  async function documentWithFinding(quote: string, offset: number) {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = await save(database, document, paragraphDoc("The very good cat sat."), 1_100);
    const revision = await takeRevision(database, saved, { now: 1_150 });
    if (revision === null) throw new Error("expected a baseline Revision");
    const finding = storedFinding(quote, offset, revision.id);
    await replaceFindingsForPass(database, saved.id, finding.passId, [finding]);
    return { database, documentId: saved.id, saved };
  }

  it("keeps a Finding attached and following a rewrite inside its span", async () => {
    const { database, documentId, saved } = await documentWithFinding("very good", 4);
    const rewritten = await save(database, saved, paragraphDoc("The very great cat sat."), 1_300);

    const resolution = await resolveDocumentFindings(database, rewritten);

    expect(resolution.findings).toHaveLength(1);
    expect(resolution.findings[0].anchor.state).toBe("attached");
    expect(resolution.intervals).toEqual([{ start: 4, end: 14 }]);
    expect((await listFindings(database, documentId))[0].anchor.state).toBe("attached");
  });

  it("persists orphaned and drops the Highlight when the quote is deleted", async () => {
    const { database, documentId, saved } = await documentWithFinding("very good", 4);
    const rewritten = await save(database, saved, paragraphDoc("The cat sat."), 1_300);

    const resolution = await resolveDocumentFindings(database, rewritten);

    expect(resolution.findings[0]).toMatchObject({ status: "open", anchor: { state: "orphaned" } });
    expect(resolution.intervals).toEqual([]);
    expect((await listFindings(database, documentId))[0].anchor.state).toBe("orphaned");
  });

  it("leaves other Passes' Findings in place rather than dropping them", async () => {
    const { database, saved } = await documentWithFinding("very good", 4);
    const ruleFindings = await runRulePasses(database, saved, { passes: [HEDGES_PASS], now: 1_200 });

    const resolution = await resolveDocumentFindings(database, saved);

    expect(resolution.findings).toHaveLength(1 + ruleFindings.length);
    expect(ruleFindings.length).toBeGreaterThan(0);
  });
});
