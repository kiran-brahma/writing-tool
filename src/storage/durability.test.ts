import { afterEach, describe, expect, it } from "vitest";
import type { DocTree } from "../core/docTree";
import {
  openObelusDatabase,
  type AuditAccountRecord,
  type FindingRecord,
  type ObelusDatabase,
  type ReaderAccountRecord,
  type RevisionRecord,
  type RunResponseRecord,
} from "./obelusDatabase";
import {
  BackupFormatError,
  exportDocumentBundle,
  exportLibraryBackup,
  importDocumentBundle,
  importLibraryBackup,
  LAST_BACKED_UP_SETTING_KEY,
  loadLastBackedUp,
  parseDocumentBundle,
  parseLibraryBackup,
  serializeDocumentBundle,
  serializeLibraryBackup,
  saveLastBackedUp,
} from "./durability";
import type { Connection } from "../wire/connection";
import type { Pass } from "../core/pass";

const openedDatabases: ObelusDatabase[] = [];

function uniqueName(): string {
  return `obelus-durability-${crypto.randomUUID()}`;
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

function document(id: string, title = "Untitled") {
  return {
    id,
    title,
    tree: paragraphDoc(`${title} body`),
    canonical: `${title} body\n`,
    wordCount: 2,
    createdAt: 1_000,
    updatedAt: 2_000,
    tags: ["essay"],
    status: "revising" as const,
  };
}

function revision(id: string, documentId: string): RevisionRecord {
  return {
    id,
    documentId,
    parentId: null,
    createdAt: 2_000,
    wordCount: 2,
    flagged: false,
    note: null,
    canonical: "body\n",
  };
}

function finding(id: string, documentId: string, revisionId: string): FindingRecord {
  return {
    id,
    documentId,
    passId: "hedges",
    promptHash: "hash",
    anchor: { quote: "very", offset: 0, state: "attached" },
    issue: "Hedge",
    diagnosis: "Cut it.",
    status: "open",
    provenance: { providerId: "rule", model: "rules", at: 1, revisionId },
  };
}

function connection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: "openai",
    name: "OpenAI",
    protocol: "openai-shaped",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt",
    apiKey: "sk-secret",
    keyMode: "persisted",
    extraHeaders: {},
    concurrency: 3,
    maxOutputTokens: 8192,
    reasoningEffort: "",
    builtIn: true,
    ...overrides,
  };
}

function pass(): Pass {
  return {
    id: "hedges",
    name: "Hedges",
    description: "Weasel words.",
    kind: "rule",
    scope: "paragraph",
    output: "findings",
    slot: "critic",
    enabled: true,
  };
}

function readerAccount(id: string, documentId: string): ReaderAccountRecord {
  return {
    id,
    documentId,
    passId: "reader",
    promptHash: "hash",
    section: { heading: "Intro", level: 1, headingBlockIndex: 0 },
    whatItSays: "It says.",
    whatIsMissed: "A lot.",
    gap: "A gap.",
    provenance: { providerId: "openai", model: "gpt", at: 3, revisionId: "rev-1" },
  };
}

function auditAccount(id: string, documentId: string): AuditAccountRecord {
  return {
    id,
    documentId,
    passId: "audit",
    promptHash: "hash",
    type: "argument",
    corePayload: "It argues that X follows from Y.",
    fallacies: [],
    priority: ["State the missing premise."],
    provenance: { providerId: "openai", model: "gpt", at: 3, revisionId: "rev-1" },
  };
}

function runResponse(documentId: string): RunResponseRecord {
  return { documentId, passId: "hedges", promptHash: "hash", rawResponse: "{}", at: 3 };
}

async function seed(database: ObelusDatabase): Promise<void> {
  await database.documents.put(document("doc-1", "Essay"));
  await database.revisions.put(revision("rev-1", "doc-1"));
  await database.findings.put(finding("find-1", "doc-1", "rev-1"));
  await database.passes.put(pass());
  await database.connections.put(connection());
  await database.settings.put({ key: "screeningFrame", value: false });
  await database.runResponses.put(runResponse("doc-1"));
  await database.readerAccounts.put(readerAccount("acct-1", "doc-1"));
  await database.auditAccounts.put(auditAccount("audit-1", "doc-1"));
}

describe("exportLibraryBackup", () => {
  it("carries every Library store and stamps the reminder", async () => {
    const database = await openTestDatabase();
    await seed(database);

    const backup = await exportLibraryBackup(database, { now: 5_000 });

    expect(backup.format).toBe("obelus.library-backup");
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBe(5_000);
    expect(backup.documents).toHaveLength(1);
    expect(backup.revisions).toHaveLength(1);
    expect(backup.findings).toHaveLength(1);
    expect(backup.passes).toHaveLength(1);
    expect(backup.connections).toHaveLength(1);
    expect(backup.runResponses).toHaveLength(1);
    expect(backup.readerAccounts).toHaveLength(1);
    expect(backup.auditAccounts).toHaveLength(1);
    expect(backup.settings).toContainEqual({ key: LAST_BACKED_UP_SETTING_KEY, value: 5_000 });

    // Export does not stamp the reminder; only a produced file does.
    await expect(loadLastBackedUp(database)).resolves.toBeNull();
    await saveLastBackedUp(database, backup.exportedAt);
    await expect(loadLastBackedUp(database)).resolves.toBe(5_000);
  });

  it("covers every Library store, so a new table cannot be silently dropped", async () => {
    const database = await openTestDatabase();

    const backup = await exportLibraryBackup(database);

    const backupArrayKeys = Object.entries(backup)
      .filter(([, value]) => Array.isArray(value))
      .map(([key]) => key)
      .sort();
    expect(backupArrayKeys).toEqual(database.tables.map((table) => table.name).sort());
  });

  it("reads a backup written before the auditAccounts store existed", async () => {
    const backup = await exportLibraryBackup(await openTestDatabase());
    const older = JSON.parse(serializeLibraryBackup(backup)) as Record<string, unknown>;
    delete older.auditAccounts;

    const parsed = parseLibraryBackup(JSON.stringify(older));

    // The store postdates the file, so the file carries no accounts and restores
    // as empty rather than being refused.
    expect(parsed.auditAccounts).toEqual([]);
  });

  it("refuses a backup whose Audit-account list is present but unreadable", async () => {
    const backup = await exportLibraryBackup(await openTestDatabase());
    const malformed = JSON.parse(serializeLibraryBackup(backup)) as Record<string, unknown>;
    malformed.auditAccounts = "not a list";

    expect(() => parseLibraryBackup(JSON.stringify(malformed))).toThrow(/Audit-account/);
  });

  it("story 112: strips persisted keys by default", async () => {
    const database = await openTestDatabase();
    await database.connections.put(connection());

    const backup = await exportLibraryBackup(database);

    expect(backup.includesKeys).toBe(false);
    expect(backup.connections[0].apiKey).toBe("");
  });

  it("story 112: keeps a persisted key only on explicit opt-in", async () => {
    const database = await openTestDatabase();
    await database.connections.put(connection());

    const backup = await exportLibraryBackup(database, { includeKeys: true });

    expect(backup.includesKeys).toBe(true);
    expect(backup.connections[0].apiKey).toBe("sk-secret");
  });

  it("strips a session-mode key even if a bug left one on the record", async () => {
    const database = await openTestDatabase();
    // A session key should never be persisted; if one ever were, it still must
    // not enter a backup, opt-in or not.
    await database.connections.put(connection({ keyMode: "session", apiKey: "sk-memory" }));

    const backup = await exportLibraryBackup(database, { includeKeys: true });

    expect(backup.connections[0].apiKey).toBe("");
  });
});

describe("library backup round trip", () => {
  it("story 111: imports a serialized backup back over the Library", async () => {
    const source = await openTestDatabase();
    await seed(source);
    const text = serializeLibraryBackup(await exportLibraryBackup(source, { now: 5_000 }));

    const target = await openTestDatabase();
    await target.documents.put(document("old", "Old"));
    await importLibraryBackup(target, parseLibraryBackup(text));

    const [documents, revisions, findings] = await Promise.all([
      target.documents.toArray(),
      target.revisions.toArray(),
      target.findings.toArray(),
    ]);
    expect(documents.map((entry) => entry.id)).toEqual(["doc-1"]);
    expect(revisions.map((entry) => entry.id)).toEqual(["rev-1"]);
    expect(findings.map((entry) => entry.id)).toEqual(["find-1"]);
    expect(await target.connections.count()).toBe(1);
    expect(await target.readerAccounts.count()).toBe(1);
    expect(await target.auditAccounts.count()).toBe(1);
    await expect(loadLastBackedUp(target)).resolves.toBe(5_000);
  });

  it("replaces the Library rather than merging it", async () => {
    const source = await openTestDatabase();
    await seed(source);
    const backup = await exportLibraryBackup(source, { now: 5_000 });

    const target = await openTestDatabase();
    await target.documents.put(document("keep-me", "Mine"));
    await importLibraryBackup(target, backup);

    await expect(target.documents.get("keep-me")).resolves.toBeUndefined();
  });

  it("keeps the browser's persisted keys when the backup excluded them", async () => {
    const source = await openTestDatabase();
    await source.documents.put(document("doc-1", "Essay"));
    await source.connections.put(connection({ apiKey: "sk-secret" }));
    const backup = await exportLibraryBackup(source);
    expect(backup.includesKeys).toBe(false);

    const target = await openTestDatabase();
    await target.connections.put(connection({ apiKey: "sk-here" }));
    await importLibraryBackup(target, backup);

    await expect(target.connections.get("openai")).resolves.toMatchObject({ apiKey: "sk-here" });
  });

  it("lets a backup that included keys win", async () => {
    const source = await openTestDatabase();
    await source.documents.put(document("doc-1", "Essay"));
    await source.connections.put(connection({ apiKey: "sk-from-file" }));
    const backup = await exportLibraryBackup(source, { includeKeys: true });

    const target = await openTestDatabase();
    await target.connections.put(connection({ apiKey: "sk-here" }));
    await importLibraryBackup(target, backup);

    await expect(target.connections.get("openai")).resolves.toMatchObject({
      apiKey: "sk-from-file",
    });
  });
});

describe("parseLibraryBackup", () => {
  it("refuses a file that is not JSON", () => {
    expect(() => parseLibraryBackup("not json")).toThrow(BackupFormatError);
  });

  it("refuses a different format tag", () => {
    expect(() => parseLibraryBackup(JSON.stringify({ format: "something-else" }))).toThrow(
      BackupFormatError,
    );
  });

  it("refuses a backup written by a newer build", () => {
    const newer = { format: "obelus.library-backup", version: 99 };
    expect(() => parseLibraryBackup(JSON.stringify(newer))).toThrow(/newer Obelus/);
  });

  it("refuses a backup missing a list", async () => {
    const database = await openTestDatabase();
    const backup = await exportLibraryBackup(database);
    const incomplete = { ...backup, documents: undefined };
    expect(() => parseLibraryBackup(JSON.stringify(incomplete))).toThrow(/documents/);
  });

  it("refuses a backup whose Document cannot be read", async () => {
    const database = await openTestDatabase();
    const backup = await exportLibraryBackup(database);
    const malformed = { ...backup, documents: [{ id: "x" }] };
    expect(() => parseLibraryBackup(JSON.stringify(malformed))).toThrow(/cannot read/);
  });
});

describe("document bundle", () => {
  it("story 114: exports a Document with its Revisions, Findings and runs", async () => {
    const database = await openTestDatabase();
    await seed(database);

    const bundle = await exportDocumentBundle(database, "doc-1", 7_000);

    expect(bundle).not.toBeNull();
    expect(bundle?.format).toBe("obelus.document-bundle");
    expect(bundle?.document.id).toBe("doc-1");
    expect(bundle?.revisions.map((entry) => entry.id)).toEqual(["rev-1"]);
    expect(bundle?.findings.map((entry) => entry.id)).toEqual(["find-1"]);
    expect(bundle?.runResponses).toHaveLength(1);
    expect(bundle?.readerAccounts).toHaveLength(1);
  });

  it("returns null for a Document that does not exist", async () => {
    const database = await openTestDatabase();
    await expect(exportDocumentBundle(database, "missing")).resolves.toBeNull();
  });

  it("imports as a new Document with every id regenerated and join remapped", async () => {
    const database = await openTestDatabase();
    await seed(database);
    const text = serializeDocumentBundle((await exportDocumentBundle(database, "doc-1"))!);

    const imported = await importDocumentBundle(database, parseDocumentBundle(text), {
      id: "doc-2",
      now: 8_000,
    });

    expect(imported.id).toBe("doc-2");
    expect(imported.title).toBe("Essay");
    expect(imported.canonical).toBe("Essay body\n");
    expect(imported.updatedAt).toBe(8_000);

    const revisions = await database.revisions.where("documentId").equals("doc-2").toArray();
    expect(revisions).toHaveLength(1);
    expect(revisions[0].id).not.toBe("rev-1");
    const findings = await database.findings.where("documentId").equals("doc-2").toArray();
    expect(findings[0].provenance.revisionId).toBe(revisions[0].id);
    // The original Document is untouched.
    expect((await database.revisions.where("documentId").equals("doc-1").toArray())[0].id).toBe(
      "rev-1",
    );
  });

  it("importing the same bundle twice yields two independent Documents", async () => {
    const database = await openTestDatabase();
    await seed(database);
    const text = serializeDocumentBundle((await exportDocumentBundle(database, "doc-1"))!);

    const first = await importDocumentBundle(database, parseDocumentBundle(text));
    const second = await importDocumentBundle(database, parseDocumentBundle(text));

    expect(first.id).not.toBe(second.id);
    expect(await database.documents.count()).toBe(3);
  });

  it("remaps a Revision's parent and a Reader account's provenance revision", async () => {
    const database = await openTestDatabase();
    await database.documents.put(document("doc-1", "Essay"));
    await database.revisions.bulkPut([
      { ...revision("rev-1", "doc-1"), parentId: null },
      { ...revision("rev-2", "doc-1"), parentId: "rev-1" },
    ]);
    await database.findings.put(finding("find-1", "doc-1", "rev-1"));
    await database.readerAccounts.put(readerAccount("acct-1", "doc-1"));
    await database.auditAccounts.put(auditAccount("audit-1", "doc-1"));

    const text = serializeDocumentBundle((await exportDocumentBundle(database, "doc-1"))!);
    await importDocumentBundle(database, parseDocumentBundle(text), { id: "doc-2" });

    const revisions = await database.revisions.where("documentId").equals("doc-2").toArray();
    const importedRevisionIds = new Set(revisions.map((entry) => entry.id));
    const child = revisions.find((entry) => entry.parentId !== null);
    expect(child?.parentId).toBeDefined();
    expect(importedRevisionIds.has(child!.parentId!)).toBe(true);

    const accounts = await database.readerAccounts.where("documentId").equals("doc-2").toArray();
    expect(importedRevisionIds.has(accounts[0].provenance.revisionId)).toBe(true);

    const audits = await database.auditAccounts.where("documentId").equals("doc-2").toArray();
    expect(audits).toHaveLength(1);
    expect(audits[0].id).not.toBe("audit-1");
    expect(importedRevisionIds.has(audits[0].provenance.revisionId)).toBe(true);
  });

  it("refuses a bundle written by a newer build", () => {
    const newer = { format: "obelus.document-bundle", version: 99, document: {} };
    expect(() => parseDocumentBundle(JSON.stringify(newer))).toThrow(/newer Obelus/);
  });

  it("refuses a bundle whose Document cannot be read", () => {
    const malformed = {
      format: "obelus.document-bundle",
      version: 1,
      document: { id: "x" },
      revisions: [],
      findings: [],
      runResponses: [],
      readerAccounts: [],
    };
    expect(() => parseDocumentBundle(JSON.stringify(malformed))).toThrow(/readable Document/);
  });
});
