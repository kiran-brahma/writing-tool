import { afterEach, describe, expect, it } from "vitest";
import type { BlockNode, DocTree, ParagraphNode } from "../core/docTree";
import { HEDGES_PASS } from "../core/starterPasses";
import {
  createDocument,
  exportDocument,
  importDocument,
  loadOrCreateDocument,
  persistDocument,
  withTree,
} from "./documents";
import { listFindings } from "./findings";
import { openObelusDatabase, type ObelusDatabase } from "./obelusDatabase";
import { runRulePasses } from "./ruleRuns";

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
