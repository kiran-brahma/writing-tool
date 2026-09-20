import { afterEach, describe, expect, it } from "vitest";
import type { DocTree } from "../core/docTree";
import {
  createDocument,
  ensureScratchpad,
  loadOrCreateDocument,
  persistDocument,
  SCRATCHPAD_DOCUMENT_ID,
  withTree,
} from "./documents";
import {
  createLibraryDocument,
  listLibrary,
  updateDocumentMetadata,
} from "./library";
import { openObelusDatabase, type DocumentRecord, type FindingRecord, type ObelusDatabase } from "./obelusDatabase";

const openedDatabases: ObelusDatabase[] = [];

function uniqueName(): string {
  return `obelus-library-${crypto.randomUUID()}`;
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

/** A stored Finding in the shape storage carries: the domain shape plus the join. */
function finding(
  id: string,
  documentId: string,
  status: "open" | "addressed" | "declined",
): FindingRecord {
  return {
    id,
    documentId,
    passId: "hedges",
    promptHash: "hash",
    anchor: { quote: "very", offset: 0, state: "attached" },
    issue: "Hedge",
    diagnosis: "Cut it.",
    status,
    provenance: { providerId: "rule", model: "rules", at: 1, revisionId: "revision-1" },
  };
}

describe("listLibrary", () => {
  it("lists every Document newest edited first with its counts and metadata", async () => {
    const database = await openTestDatabase();
    const older = await createLibraryDocument(database, 1_000);
    const savedOlder = await save(database, older, paragraphDoc("one two three"), 1_100);
    const newer = await createLibraryDocument(database, 2_000);
    const savedNewer = await save(database, newer, paragraphDoc("four five"), 2_100);
    await updateDocumentMetadata(database, savedNewer.id, {
      tags: ["essay"],
      status: "revising",
    });
    await database.findings.put(finding("f-1", savedNewer.id, "open"));
    await database.findings.put(finding("f-2", savedNewer.id, "open"));
    await database.findings.put(finding("f-3", savedOlder.id, "open"));

    const entries = await listLibrary(database);

    expect(entries.map((entry) => entry.id)).toEqual([savedNewer.id, savedOlder.id]);
    expect(entries[0]).toMatchObject({
      title: "Untitled",
      wordCount: 2,
      updatedAt: 2_100,
      openFindings: 2,
      tags: ["essay"],
      status: "revising",
      scratchpad: false,
    });
    expect(entries[1]).toMatchObject({ wordCount: 3, updatedAt: 1_100, openFindings: 1 });
  });

  it("counts only open Findings, not addressed or declined ones", async () => {
    const database = await openTestDatabase();
    const document = await createLibraryDocument(database, 1_000);
    await database.findings.put(finding("f-1", document.id, "open"));
    await database.findings.put(finding("f-2", document.id, "addressed"));
    await database.findings.put(finding("f-3", document.id, "declined"));

    const [entry] = await listLibrary(database);

    expect(entry.openFindings).toBe(1);
  });

  it("carries the body text that story 21 searches", async () => {
    const database = await openTestDatabase();
    const document = await createLibraryDocument(database, 1_000);
    await save(database, document, paragraphDoc("a half-remembered phrase"), 1_100);

    const [entry] = await listLibrary(database);

    expect(entry.canonical).toBe("a half-remembered phrase\n");
  });

  it("reads a pre-Library Document as untagged and draft", async () => {
    const database = await openTestDatabase();
    // A Document record as migration 1 wrote it: no `tags`, no `status`.
    await database.documents.put({
      id: "legacy",
      title: "Legacy prose",
      tree: paragraphDoc("legacy"),
      canonical: "legacy\n",
      wordCount: 1,
      createdAt: 1,
      updatedAt: 1,
    });

    const [entry] = await listLibrary(database);

    expect(entry.tags).toEqual([]);
    expect(entry.status).toBe("draft");
  });

  it("marks the Scratchpad as such", async () => {
    const database = await openTestDatabase();
    await ensureScratchpad(database, 1_000);

    const [entry] = await listLibrary(database);

    expect(entry.id).toBe(SCRATCHPAD_DOCUMENT_ID);
    expect(entry.title).toBe("Scratchpad");
    expect(entry.scratchpad).toBe(true);
  });
});

describe("createLibraryDocument", () => {
  it("creates a new empty Document in draft, distinct from any other", async () => {
    const database = await openTestDatabase();
    const first = await createLibraryDocument(database, 1_000);
    const second = await createLibraryDocument(database, 2_000);

    expect(first.id).not.toBe(second.id);
    expect(first).toMatchObject({ title: "Untitled", wordCount: 0, tags: [], status: "draft" });
    expect(await database.documents.count()).toBe(2);
  });
});

describe("updateDocumentMetadata", () => {
  it("sets the status without touching the prose or its last-edited time", async () => {
    const database = await openTestDatabase();
    const document = await createLibraryDocument(database, 1_000);
    const saved = await save(database, document, paragraphDoc("prose"), 1_100);

    const updated = await updateDocumentMetadata(database, saved.id, { status: "done" });

    expect(updated).toMatchObject({ status: "done", canonical: "prose\n", updatedAt: 1_100 });
    await expect(database.documents.get(saved.id)).resolves.toMatchObject({ status: "done" });
  });

  it("normalizes tags on write", async () => {
    const database = await openTestDatabase();
    const document = await createLibraryDocument(database, 1_000);

    const updated = await updateDocumentMetadata(database, document.id, {
      tags: ["  Essay ", "essay", "", "Fiction"],
    });

    expect(updated?.tags).toEqual(["Essay", "Fiction"]);
  });

  it("falls back to Untitled when the title is blank", async () => {
    const database = await openTestDatabase();
    const document = await createLibraryDocument(database, 1_000);

    const updated = await updateDocumentMetadata(database, document.id, { title: "   " });

    expect(updated?.title).toBe("Untitled");
  });

  it("returns null for an unknown Document and writes nothing", async () => {
    const database = await openTestDatabase();

    await expect(updateDocumentMetadata(database, "missing", { title: "x" })).resolves.toBeNull();
    expect(await database.documents.count()).toBe(0);
  });
});

describe("Scratchpad", () => {
  it("exists automatically and is created once", async () => {
    const database = await openTestDatabase();

    const first = await ensureScratchpad(database, 1_000);
    const second = await ensureScratchpad(database, 2_000);

    expect(first.id).toBe(SCRATCHPAD_DOCUMENT_ID);
    expect(second.id).toBe(SCRATCHPAD_DOCUMENT_ID);
    expect(await database.documents.count()).toBe(1);
  });

  it("is what a fresh install opens into", async () => {
    const database = await openTestDatabase();

    const opened = await loadOrCreateDocument(database, 1_000);

    expect(opened.id).toBe(SCRATCHPAD_DOCUMENT_ID);
  });

  it("does not replace Documents already in the Library", async () => {
    const database = await openTestDatabase();
    const existing = await createLibraryDocument(database, 1_000);
    await save(database, existing, paragraphDoc("kept"), 1_500);

    await loadOrCreateDocument(database, 2_000);

    await expect(database.documents.get(existing.id)).resolves.toMatchObject({
      canonical: "kept\n",
    });
    expect(await database.documents.count()).toBe(2);
  });

  it("reopens a pre-Library Document rather than the new Scratchpad", async () => {
    const database = await openTestDatabase();
    await database.documents.put({
      id: "default",
      title: "Legacy prose",
      tree: paragraphDoc("legacy"),
      canonical: "legacy\n",
      wordCount: 1,
      createdAt: 1,
      updatedAt: 1,
    });

    const opened = await loadOrCreateDocument(database, 2_000);

    // The Writer's existing Document opens; the Scratchpad is created but does
    // not steal launch by being the newest.
    expect(opened.id).toBe("default");
    expect(await database.documents.get(SCRATCHPAD_DOCUMENT_ID)).toBeDefined();
  });
});

describe("createDocument", () => {
  it("starts a Document in the draft status with no tags", () => {
    const document = createDocument(1_000);

    expect(document.status).toBe("draft");
    expect(document.tags).toEqual([]);
  });
});
