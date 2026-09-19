import { afterEach, describe, expect, it } from "vitest";
import { canonicalText } from "../core/canonicalText";
import type { DocTree } from "../core/docTree";
import { loadOrCreateDocument, persistDocument, withTree } from "./documents";
import {
  NewerDatabaseError,
  ObelusDatabase,
  openObelusDatabase,
  type DocumentRecord,
} from "./obelusDatabase";
import { latestRevision, listRevisions, takeRevision } from "./revisions";

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
  it("creates migration 1 and is forward-only", async () => {
    const database = await openTestDatabase();

    expect(database.verno).toBe(1);
    expect(database.tables.map((table) => table.name).sort()).toEqual(["documents", "revisions"]);
  });

  it("refuses a database newer than the running code, leaving it intact", async () => {
    const name = uniqueName();
    await createRawDatabase(name, 20, "future-prose");

    await expect(openObelusDatabase(name)).rejects.toBeInstanceOf(NewerDatabaseError);
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

  it("stores the canonical string, not a join to mutable state", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const tree = paragraphDoc("immutable");
    const saved = await saveDocument(database, document, tree, 1_100);
    const revision = await takeRevision(database, saved, { now: 1_200 });

    expect(revision?.canonical).toBe(canonicalText(tree));
    expect(Object.keys(revision ?? {}).sort()).toEqual([
      "canonical",
      "createdAt",
      "documentId",
      "flagged",
      "id",
      "note",
      "parentId",
      "wordCount",
    ]);
  });
});
