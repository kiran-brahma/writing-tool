import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import type { DocTree } from "../core/docTree";
import { loadOrCreateDocument, persistDocument, withTree } from "./documents";
import {
  NewerDatabaseError,
  ObelusDatabase,
  openObelusDatabase,
  type AuditAccountRecord,
  type DocumentRecord,
} from "./obelusDatabase";
import { latestRevision, listRevisions, takeRevision } from "./revisions";
import { PRIVACY_STORES } from "../privacy/privacyContent";

const openedDatabases: ObelusDatabase[] = [];

function uniqueName(): string {
  return `obelus-test-${crypto.randomUUID()}`;
}

async function openTestDatabase(): Promise<ObelusDatabase> {
  const database = await openObelusDatabase(uniqueName());
  openedDatabases.push(database);
  return database;
}

afterEach(async () => {
  for (const database of openedDatabases.splice(0)) {
    database.close();
  }
});

function paragraphDoc(text: string): DocTree {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

/** The production path: project the tree, then persist the projected record. */
async function saveDocument(
  database: ObelusDatabase,
  document: DocumentRecord,
  tree: DocTree,
  now: number,
): Promise<DocumentRecord> {
  const updated = withTree(document, tree, now);
  await persistDocument(database, updated);
  return updated;
}

/** Creates a native database at an arbitrary, higher version. */
function createRawDatabase(name: string, version: number, seed: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("future");
    };
    request.onsuccess = () => {
      const database = request.result;
      const write = database.transaction("future", "readwrite");
      write.objectStore("future").put(seed, "seed");
      write.oncomplete = () => {
        database.close();
        resolve();
      };
      write.onerror = () => {
        reject(write.error ?? new Error("raw write failed"));
      };
    };
    request.onerror = () => {
      reject(request.error ?? new Error("raw open failed"));
    };
  });
}

function readRawSeed(name: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction("future", "readonly");
      const get = read.objectStore("future").get("seed");
      get.onsuccess = () => {
        const value = get.result;
        database.close();
        resolve(value);
      };
      get.onerror = () => reject(get.error ?? new Error("raw read failed"));
    };
    request.onerror = () => reject(request.error ?? new Error("raw reopen failed"));
  });
}

describe("openObelusDatabase", () => {
  it("creates the current schema with a repository per record kind", async () => {
    const database = await openTestDatabase();

    expect(database.verno).toBe(8);
    expect(database.tables.map((table) => table.name).sort()).toEqual([
      "auditAccounts",
      "connections",
      "documents",
      "findings",
      "passes",
      "readerAccounts",
      "revisions",
      "runCache",
      "runResponses",
      "settings",
    ]);
  });

  it("lists exactly the stores the privacy page tells the Writer to open", async () => {
    // The privacy page's store list is documentation of this schema; a new
    // migration must not leave the page pointing at a store that is not there.
    const database = await openTestDatabase();
    expect(database.tables.map((table) => table.name).sort()).toEqual([...PRIVACY_STORES].sort());
  });

  it("upgrades an old database through every migration without touching existing data", async () => {
    const name = uniqueName();
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      documents: "id, updatedAt",
      revisions: "id, documentId, createdAt, [documentId+createdAt]",
    });
    await legacy.open();
    await legacy.table("documents").put({
      id: "default",
      title: "Legacy prose",
      tree: { type: "doc", content: [{ type: "paragraph" }] },
      canonical: "legacy\n",
      wordCount: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    legacy.close();

    const database = await openObelusDatabase(name);
    openedDatabases.push(database);

    expect(database.verno).toBe(8);
    await expect(database.documents.get("default")).resolves.toMatchObject({
      title: "Legacy prose",
    });
    expect(database.tables.map((table) => table.name)).toContain("findings");
    expect(database.tables.map((table) => table.name)).toContain("passes");
    expect(database.tables.map((table) => table.name)).toContain("runResponses");
  });

  it("adds the Passes store to a migration-2 database, leaving Findings intact", async () => {
    const name = uniqueName();
    const legacy = new Dexie(name);
    legacy.version(2).stores({
      documents: "id, updatedAt",
      revisions: "id, documentId, createdAt, [documentId+createdAt]",
      findings: "id, documentId, [documentId+passId]",
    });
    await legacy.open();
    const finding = {
      id: "finding-1",
      documentId: "default",
      passId: "hedges",
      promptHash: "hash",
      anchor: { quote: "very", offset: 8, state: "attached" },
      issue: "Hedge",
      diagnosis: "Cut it.",
      status: "open",
      provenance: { providerId: "local", model: "rule", at: 1, revisionId: "revision-1" },
    };
    await legacy.table("findings").put(finding);
    legacy.close();

    const database = await openObelusDatabase(name);
    openedDatabases.push(database);

    expect(database.verno).toBe(8);
    await expect(database.findings.get("finding-1")).resolves.toMatchObject({ issue: "Hedge" });
    expect(database.tables.map((table) => table.name)).toContain("passes");
  });

  it("adds the Connections and settings stores without touching Findings", async () => {
    const name = uniqueName();
    const legacy = new Dexie(name);
    legacy.version(3).stores({
      documents: "id, updatedAt",
      revisions: "id, documentId, createdAt, [documentId+createdAt]",
      findings: "id, documentId, [documentId+passId]",
      passes: "id, kind",
    });
    await legacy.open();
    await legacy.table("passes").put({ id: "hedges", name: "Hedges" });
    legacy.close();

    const database = await openObelusDatabase(name);
    openedDatabases.push(database);

    expect(database.verno).toBe(8);
    await expect(database.passes.get("hedges")).resolves.toMatchObject({ name: "Hedges" });
    expect(database.tables.map((table) => table.name)).toContain("connections");
    expect(database.tables.map((table) => table.name)).toContain("settings");
    expect(database.tables.map((table) => table.name)).toContain("runResponses");
  });

  it("adds the runResponses store without touching Connections or settings", async () => {
    const name = uniqueName();
    const legacy = new Dexie(name);
    legacy.version(4).stores({
      documents: "id, updatedAt",
      revisions: "id, documentId, createdAt, [documentId+createdAt]",
      findings: "id, documentId, [documentId+passId]",
      passes: "id, kind",
      connections: "id, builtIn",
      settings: "key",
    });
    await legacy.open();
    await legacy.table("settings").put({ key: "slots", value: { critic: "openai", judge: null } });
    legacy.close();

    const database = await openObelusDatabase(name);
    openedDatabases.push(database);

    expect(database.verno).toBe(8);
    await expect(database.settings.get("slots")).resolves.toMatchObject({
      value: { critic: "openai" },
    });
    expect(database.tables.map((table) => table.name)).toContain("runResponses");
  });

  it("adds the readerAccounts store without touching runResponses or settings", async () => {
    const name = uniqueName();
    const legacy = new Dexie(name);
    legacy.version(5).stores({
      documents: "id, updatedAt",
      revisions: "id, documentId, createdAt, [documentId+createdAt]",
      findings: "id, documentId, [documentId+passId]",
      passes: "id, kind",
      connections: "id, builtIn",
      settings: "key",
      runResponses: "[documentId+passId+promptHash], documentId",
    });
    await legacy.open();
    await legacy.table("runResponses").put({
      documentId: "default",
      passId: "cliche",
      promptHash: "hash",
      rawResponse: "{}",
      at: 1,
    });
    legacy.close();

    const database = await openObelusDatabase(name);
    openedDatabases.push(database);

    expect(database.verno).toBe(8);
    await expect(
      database.runResponses.get(["default", "cliche", "hash"]),
    ).resolves.toMatchObject({ rawResponse: "{}" });
    expect(database.tables.map((table) => table.name)).toContain("readerAccounts");
  });

  it("adds the runCache store to a migration-6 database, leaving Reader accounts intact", async () => {
    const name = uniqueName();
    const legacy = new Dexie(name);
    legacy.version(6).stores({
      documents: "id, updatedAt",
      revisions: "id, documentId, createdAt, [documentId+createdAt]",
      findings: "id, documentId, [documentId+passId]",
      passes: "id, kind",
      connections: "id, builtIn",
      settings: "key",
      runResponses: "[documentId+passId+promptHash], documentId",
      readerAccounts: "id, documentId, [documentId+passId]",
    });
    await legacy.open();
    await legacy.table("readerAccounts").put({
      id: "acct-1",
      documentId: "default",
      passId: "reader",
      promptHash: "hash",
      section: { heading: "One", level: 1, headingBlockIndex: 0 },
      whatItSays: "Says.",
      whatIsMissed: "Misses.",
      gap: "Gap.",
      provenance: { providerId: "openai", model: "m", at: 1, revisionId: "rev-1" },
    });
    legacy.close();

    const database = await openObelusDatabase(name);
    openedDatabases.push(database);

    expect(database.verno).toBe(8);
    await expect(database.readerAccounts.get("acct-1")).resolves.toMatchObject({
      passId: "reader",
      whatItSays: "Says.",
    });
    expect(database.tables.map((table) => table.name)).toContain("runCache");
  });

  it("adds the auditAccounts store to a migration-7 database, leaving the Run cache intact", async () => {
    const name = uniqueName();
    const legacy = new Dexie(name);
    legacy.version(7).stores({
      documents: "id, updatedAt",
      revisions: "id, documentId, createdAt, [documentId+createdAt]",
      findings: "id, documentId, [documentId+passId]",
      passes: "id, kind",
      connections: "id, builtIn",
      settings: "key",
      runResponses: "[documentId+passId+promptHash], documentId",
      readerAccounts: "id, documentId, [documentId+passId]",
      runCache: "key, documentId",
    });
    await legacy.open();
    await legacy.table("runCache").put({
      key: "cache-1",
      documentId: "default",
      canonicalHash: "c",
      passId: "cliche",
      promptHash: "hash",
      connectionId: "openai",
      protocol: "openai-shaped",
      baseUrl: "https://api.openai.com/v1",
      model: "m",
      screeningFrame: false,
      characterLimit: 12000,
      target: { start: 0, end: 1 },
      findings: [],
      violations: [],
      droppedAnchors: 0,
      rawResponse: "{}",
      chunks: 1,
      at: 1,
    });
    legacy.close();

    const database = await openObelusDatabase(name);
    openedDatabases.push(database);

    expect(database.verno).toBe(8);
    await expect(database.runCache.get("cache-1")).resolves.toMatchObject({ passId: "cliche" });
    expect(database.tables.map((table) => table.name)).toContain("auditAccounts");
  });

  it("stores an Audit account with its Document, Pass and promptHash (story 133)", async () => {
    const database = await openTestDatabase();
    const account: AuditAccountRecord = {
      id: "audit-1",
      documentId: "default",
      passId: "audit",
      promptHash: "hash",
      type: "argument",
      corePayload: "The piece argues that X follows from Y.",
      fallacies: [{ name: null, passage: "X follows.", why: "Unstated premise.", missing: "Y." }],
      priority: ["State the missing premise."],
      provenance: { providerId: "openai", model: "m", at: 1, revisionId: "rev-1" },
    };

    await database.auditAccounts.put(account);

    await expect(database.auditAccounts.get("audit-1")).resolves.toEqual(account);
    await expect(
      database.auditAccounts.where("[documentId+passId]").equals(["default", "audit"]).count(),
    ).resolves.toBe(1);
  });

  it("refuses a database newer than the running code, leaving it intact", async () => {
    const name = uniqueName();
    await createRawDatabase(name, 90, "future-prose");

    await expect(openObelusDatabase(name)).rejects.toBeInstanceOf(NewerDatabaseError);
    await expect(openObelusDatabase(name)).rejects.toThrow(/newer Obelus database[\s\S]*will not downgrade/);
    await expect(readRawSeed(name)).resolves.toBe("future-prose");
  });
});

describe("Document persistence", () => {
  it("creates exactly one Document on first open", async () => {
    const database = await openTestDatabase();

    const first = await loadOrCreateDocument(database, 1_000);
    const second = await loadOrCreateDocument(database, 2_000);

    expect(second.id).toBe(first.id);
    expect(await database.documents.count()).toBe(1);
  });

  it("persists the Document of record with its canonical text and word count", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);

    const saved = await saveDocument(database, document, paragraphDoc("three words here"), 2_000);

    expect(saved.canonical).toBe("three words here\n");
    expect(saved.wordCount).toBe(3);
    expect(saved.updatedAt).toBe(2_000);
    await expect(database.documents.get(document.id)).resolves.toEqual(saved);
  });

  it("reopens with the Document of record and its Revisions intact", async () => {
    const name = uniqueName();
    const first = await openObelusDatabase(name);
    const document = await loadOrCreateDocument(first, 1_000);
    const tree: DocTree = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "one" }] },
        { type: "paragraph", content: [{ type: "text", text: "two" }] },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "item" }] }] },
          ],
        },
      ],
    };
    const saved = await saveDocument(first, document, tree, 1_100);
    await takeRevision(first, saved, { now: 1_200 });
    first.close();

    const second = await openObelusDatabase(name);
    openedDatabases.push(second);

    const reopened = await loadOrCreateDocument(second, 2_000);
    expect(reopened.tree).toEqual(tree);
    expect(reopened.canonical).toBe(saved.canonical);
    expect(await listRevisions(second, reopened.id)).toHaveLength(1);
  });
});

describe("Revisions", () => {
  it("takes an auto-Revision only when the text has changed", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const first = await saveDocument(database, document, paragraphDoc("first"), 1_100);

    const revision = await takeRevision(database, first, { now: 1_200 });
    expect(revision).not.toBeNull();
    expect(revision?.canonical).toBe("first\n");
    expect(revision?.wordCount).toBe(1);
    expect(revision?.parentId).toBeNull();
    expect(revision?.flagged).toBe(false);

    const unchanged = await takeRevision(database, first, { now: 1_300 });
    expect(unchanged).toBeNull();
    expect(await database.revisions.count()).toBe(1);
  });

  it("chains a Revision to the previous one", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const first = await saveDocument(database, document, paragraphDoc("one"), 1_100);
    const firstRevision = await takeRevision(database, first, { now: 1_200 });

    const second = await saveDocument(database, first, paragraphDoc("one two"), 1_300);
    const secondRevision = await takeRevision(database, second, { now: 1_400 });

    expect(secondRevision?.parentId).toBe(firstRevision?.id);

    const revisions = await listRevisions(database, document.id);
    expect(revisions.map((entry) => entry.canonical)).toEqual(["one two\n", "one\n"]);
    expect((await latestRevision(database, document.id))?.id).toBe(secondRevision?.id);
  });

  it("serialises concurrent Revision writes onto a single chain", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const first = await saveDocument(database, document, paragraphDoc("one"), 1_100);
    const second = await saveDocument(database, first, paragraphDoc("two"), 1_200);

    const [a, b] = await Promise.all([
      takeRevision(database, first, { now: 1_300 }),
      takeRevision(database, second, { now: 1_400 }),
    ]);

    expect(a?.parentId).toBeNull();
    expect(b?.parentId).toBe(a?.id);
    expect(await database.revisions.count()).toBe(2);
  });

  it("always takes a flagged Revision carrying its note", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = await saveDocument(database, document, paragraphDoc("milestone"), 1_100);

    const milestone = await takeRevision(database, saved, {
      flagged: true,
      note: "first draft done",
      now: 1_200,
    });

    expect(milestone?.flagged).toBe(true);
    expect(milestone?.note).toBe("first draft done");

    const again = await takeRevision(database, saved, { flagged: true, now: 1_300 });
    expect(again).not.toBeNull();
    expect(again?.flagged).toBe(true);
    expect(again?.note).toBeNull();
  });

  it("stores immutable prose with no join to mutable state", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = await saveDocument(database, document, paragraphDoc("immutable"), 1_100);
    const revision = await takeRevision(database, saved, { now: 1_200 });

    expect(revision?.canonical).toBe("immutable\n");

    // Editing the live Document afterwards must not change the Revision.
    await saveDocument(database, saved, paragraphDoc("changed"), 1_300);
    const stored = await database.revisions.get(revision?.id ?? "");
    expect(stored?.canonical).toBe("immutable\n");

    // No field joins the Revision to mutable or ephemeral state.
    expect(Object.keys(stored ?? {})).not.toContain("findings");
    expect(Object.keys(stored ?? {})).not.toContain("run");
  });
});
