import { canonicalText, wordCount } from "../core/canonicalText";
import { emptyDocTree, type DocTree } from "../core/docTree";
import { parseCanonical } from "../core/parseCanonical";
import type { DocumentRecord } from "./obelusDatabase";
import type { ObelusDatabase } from "./obelusDatabase";

/**
 * The single Document of record a fresh install opens into. A stable id keeps
 * creation idempotent, so a double-mounted effect cannot create two Documents.
 */
export const DEFAULT_DOCUMENT_ID = "default";

/** The derived fields of a Document: canonical text and its word count. */
function derive(tree: DocTree): Pick<DocumentRecord, "canonical" | "wordCount"> {
  const canonical = canonicalText(tree);
  return { canonical, wordCount: wordCount(canonical) };
}

export function createDocument(now: number = Date.now()): DocumentRecord {
  const tree = emptyDocTree();
  return {
    id: DEFAULT_DOCUMENT_ID,
    title: "Untitled",
    tree,
    ...derive(tree),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The Document of record for this browser. Story 1 wants a Writer to open the
 * URL and start writing immediately, so the first run creates the one Document
 * rather than asking for a name. Many Documents arrive with the Library.
 */
export async function loadOrCreateDocument(
  database: ObelusDatabase,
  now: number = Date.now(),
): Promise<DocumentRecord> {
  const existing = await database.documents.get(DEFAULT_DOCUMENT_ID);
  if (existing !== undefined) return existing;

  const document = createDocument(now);
  await database.documents.put(document);
  return document;
}

/** Pure projection: a new Document record for a new tree, canonical derived. */
export function withTree(
  document: DocumentRecord,
  tree: DocTree,
  now: number = Date.now(),
): DocumentRecord {
  return {
    ...document,
    tree,
    ...derive(tree),
    updatedAt: now,
  };
}

/** Persists an already-projected Document record, as `withTree` produces. */
export async function persistDocument(
  database: ObelusDatabase,
  document: DocumentRecord,
): Promise<void> {
  await database.documents.put(document);
}

/**
 * Story 19: the Document as Markdown. It returns `canonical`, which is the
 * canonical render of the tree: exporting the stored string rather than
 * rendering again guarantees the file matches exactly what model Passes and
 * Anchors saw.
 */
export function exportDocument(document: DocumentRecord): string {
  return document.canonical;
}

/**
 * Story 18: a new record for a Document imported from Markdown. Import parses
 * the canonical grammar with `parseCanonical`, the exact inverse of the one
 * renderer; the canonical string and word count are derived from the imported
 * tree and `updatedAt` moves to now. The id and title remain the Document's,
 * because Markdown carries neither.
 */
export function documentFromMarkdown(
  document: DocumentRecord,
  markdown: string,
  now: number = Date.now(),
): DocumentRecord {
  return withTree(document, parseCanonical(markdown), now);
}

/**
 * Replaces the Document's prose from Markdown and persists it. The replacement
 * and the clearing of the old Findings happen in one transaction: a Document
 * swapped wholesale must not leave Findings from the previous prose looking for
 * text that is gone, and a failed import must not clear the queue while leaving
 * the prose unchanged.
 */
export async function importDocument(
  database: ObelusDatabase,
  document: DocumentRecord,
  markdown: string,
  now: number = Date.now(),
): Promise<DocumentRecord> {
  const updated = documentFromMarkdown(document, markdown, now);
  await database.transaction("rw", database.documents, database.findings, async () => {
    await database.documents.put(updated);
    await database.findings.where("documentId").equals(document.id).delete();
  });
  return updated;
}
