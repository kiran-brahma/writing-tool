import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlockNode, DocTree, ParagraphNode } from "../core/docTree";
import { HEDGES_PASS } from "../core/starterPasses";
import {
  DocumentConflictError,
  createDocument,
  exportDocument,
  importDocument,
  loadOrCreateDocument,
  persistDocument,
  saveDocument,
  withTree,
} from "./documents";
import { listFindings } from "./findings";
import { openObelusDatabase, type ObelusDatabase } from "./obelusDatabase";
import { runRulePasses } from "./ruleRuns";
import { saveRunCache, type RunCacheInput } from "./runCache";

const openedDatabases: ObelusDatabase[] = [];

function uniqueName(): string {
  return `obelus-documents-${crypto.randomUUID()}`;
}

async function openTestDatabase(): Promise<ObelusDatabase> {
  const database = await openObelusDatabase(uniqueName());
  openedDatabases.push(database);
  return database;
}

afterEach(async () => {
  for (const database of openedDatabases.splice(0)) database.close();
});

function doc(...content: BlockNode[]): DocTree {
  return { type: "doc", content };
}

function paragraph(text: string): ParagraphNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

const EXPORT_DOCUMENT = doc(
  { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
  paragraph("A plain paragraph."),
  {
    type: "bulletList",
    content: [
      { type: "listItem", content: [paragraph("one")] },
      { type: "listItem", content: [paragraph("two")] },
    ],
  },
);

/** Every block kind canonicalText emits, so the round trip proves all of them. */
const RICH_DOCUMENT = doc(
  { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
  {
    type: "paragraph",
    content: [
      { type: "text", text: "plain " },
      { type: "text", text: "italic", marks: [{ type: "italic" }] },
      { type: "text", text: " " },
      { type: "text", text: "strong", marks: [{ type: "bold" }] },
      { type: "text", text: " " },
      { type: "text", text: "code", marks: [{ type: "code" }] },
      { type: "text", text: " " },
      {
        type: "text",
        text: "link",
        marks: [{ type: "link", attrs: { href: "https://example.com" } }],
      },
    ],
  },
  { type: "blockquote", content: [paragraph("quoted"), paragraph("more")] },
  {
    type: "codeBlock",
    attrs: { language: "ts" },
    content: [{ type: "text", text: "const a = 1;" }],
  },
  {
    type: "orderedList",
    attrs: { start: 2 },
    content: [
      { type: "listItem", content: [paragraph("second")] },
      { type: "listItem", content: [paragraph("third")] },
    ],
  },
  {
    type: "bulletList",
    content: [
      { type: "listItem", content: [paragraph("one")] },
      { type: "listItem", content: [paragraph("two")] },
    ],
  },
);

describe("exportDocument", () => {
  it("renders the Document as Markdown source", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = withTree(document, EXPORT_DOCUMENT, 1_100);

    expect(exportDocument(saved)).toBe("# Title\n\nA plain paragraph.\n\n- one\n- two\n");
  });
});

describe("importDocument", () => {
  it("parses Markdown into the tree and derives the canonical string and word count", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);

    const imported = await importDocument(database, document, "# Title\n\nBody words.\n", 1_200);

    expect(imported.tree).toEqual(
      doc(
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
        paragraph("Body words."),
      ),
    );
    expect(imported.canonical).toBe("# Title\n\nBody words.\n");
    expect(imported.wordCount).toBe(3);
    expect(imported.updatedAt).toBe(1_200);
  });

  it("persists the imported Document", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);

    const imported = await importDocument(database, document, "Changed prose.\n", 1_200);

    expect(await database.documents.get(document.id)).toEqual(imported);
  });

  it("round-trips a Document: export then import returns the same prose", async () => {
    const database = await openTestDatabase();
    const source = withTree(createDocument(1_000), RICH_DOCUMENT, 1_100);
    const markdown = exportDocument(source);

    const imported = await importDocument(database, createDocument(2_000), markdown, 2_100);

    expect(imported.tree).toEqual(RICH_DOCUMENT);
    expect(imported.canonical).toBe(source.canonical);
    expect(imported.wordCount).toBe(source.wordCount);
  });

  it("clears the old Document's Findings when the prose is replaced", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = withTree(document, doc(paragraph("very good")), 1_100);
    await persistDocument(database, saved);
    const findings = await runRulePasses(database, saved, { passes: [HEDGES_PASS], now: 1_200 });
    expect(findings).toHaveLength(1);

    await importDocument(database, saved, "clean prose.\n", 1_300);

    expect(await listFindings(database, document.id)).toEqual([]);
  });

  it("clears the old Document's Audit accounts when the prose is replaced", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    await database.auditAccounts.put({
      id: "audit-1",
      documentId: document.id,
      passId: "audit",
      promptHash: "hash",
      type: "argument",
      corePayload: "It argues.",
      fallacies: [],
      priority: [],
      provenance: { providerId: "openai", model: "gpt", at: 1, revisionId: "rev-1" },
    });

    await importDocument(database, document, "clean prose.\n", 1_300);

    expect(await database.auditAccounts.count()).toBe(0);
  });
});

describe("saveDocument", () => {
  /** A minimal cache input, so a Run cache row can be seeded and then evicted. */
  function cacheInput(documentId: string): RunCacheInput {
    return {
      documentId,
      canonicalHash: "hash",
      passId: "pass-1",
      promptHash: "prompt-hash",
      connectionId: "connection-1",
      protocol: "openai-shaped",
      baseUrl: "https://example.com",
      model: "a-model",
      maxOutputTokens: 4096,
      reasoningEffort: "",
      extraHeaders: {},
      screeningFrame: true,
      characterLimit: 12_000,
      voiceList: [],
      target: { start: 0, end: 10 },
    };
  }

  function quotaError(): DOMException {
    return new DOMException("The quota has been exceeded.", "QuotaExceededError");
  }

  async function seedCache(database: ObelusDatabase, documentId: string): Promise<void> {
    await saveRunCache(
      database,
      cacheInput(documentId),
      {
        findings: [],
        violations: [],
        droppedAnchors: 0,
        rawResponse: "{}",
        fromCache: false,
        chunks: 1,
      },
      1_000,
    );
  }

  it("stores the Document without trimming when the quota is fine", async () => {
    const database = await openTestDatabase();
    const document = createDocument(1_000);

    expect(await saveDocument(database, document)).toBe("stored");
    expect(await database.documents.get(document.id)).not.toBeUndefined();
  });

  it("drops the Run cache and retries once when the quota is full", async () => {
    const database = await openTestDatabase();
    const document = createDocument(1_000);
    await database.documents.put(document);
    await seedCache(database, document.id);

    const put = vi.spyOn(database.documents, "put").mockRejectedValueOnce(quotaError());
    const outcome = await saveDocument(database, { ...document, title: "Renamed" });

    expect(outcome).toBe("trimmed");
    expect(put).toHaveBeenCalledTimes(2);
    // The retry stored the prose rather than leaving the Writer with a banner.
    expect((await database.documents.get(document.id))?.title).toBe("Renamed");
    // The cache is the first thing spent, because it can be rebuilt.
    expect(await database.runCache.count()).toBe(0);
  });

  it("rethrows a failure that is not a full quota, and does not touch the cache", async () => {
    const database = await openTestDatabase();
    const document = createDocument(1_000);
    await database.documents.put(document);
    await seedCache(database, document.id);

    vi.spyOn(database.documents, "put").mockRejectedValueOnce(new Error("the disk is gone"));

    await expect(saveDocument(database, document)).rejects.toThrow("the disk is gone");
    expect(await database.runCache.count()).toBe(1);
  });

  it("rethrows a second quota failure rather than retrying forever", async () => {
    const database = await openTestDatabase();
    const document = createDocument(1_000);

    const put = vi
      .spyOn(database.documents, "put")
      .mockRejectedValueOnce(quotaError())
      .mockRejectedValueOnce(quotaError());

    await expect(saveDocument(database, document)).rejects.toThrow();
    expect(put).toHaveBeenCalledTimes(2);
  });
});

describe("cross-tab writes", () => {
  it("refuses to overwrite a Document another tab saved more recently", async () => {
    const database = await openTestDatabase();
    const document = createDocument(1_000);
    await database.documents.put(document);

    // Another tab types: the stored record moves ahead of the one held here.
    const otherTab = withTree(document, doc(paragraph("The other tab's paragraph.")), 2_000);
    await database.documents.put(otherTab);

    const thisTab = withTree(document, doc(paragraph("This tab's paragraph.")), 1_500);

    await expect(saveDocument(database, thisTab)).rejects.toThrow(DocumentConflictError);
    // The other tab's prose survived; nothing was clobbered.
    expect((await database.documents.get(document.id))?.canonical).toContain("The other tab");
  });

  it("still stores a write that is at or ahead of the stored record", async () => {
    const database = await openTestDatabase();
    const document = createDocument(1_000);
    await database.documents.put(document);

    const sameMoment = withTree(document, doc(paragraph("Same millisecond.")), 1_000);
    expect(await saveDocument(database, sameMoment)).toBe("stored");

    const later = withTree(sameMoment, doc(paragraph("Later.")), 2_000);
    expect(await saveDocument(database, later)).toBe("stored");
  });

  it("leaves a metadata edit alone, because it does not move `updatedAt`", async () => {
    const database = await openTestDatabase();
    const document = createDocument(1_000);
    await database.documents.put(document);

    // Tagging keeps the prose's `updatedAt`, so it is never a conflict, even
    // when it lands after another tab's prose write.
    const tagged = { ...document, title: "Renamed", updatedAt: document.updatedAt };
    expect(await saveDocument(database, tagged)).toBe("stored");
  });
});
