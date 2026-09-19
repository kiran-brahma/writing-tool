import { canonicalText, wordCount } from "../core/canonicalText";
import { emptyDocTree, type DocTree } from "../core/docTree";
import type { DocumentRecord } from "./obelusDatabase";
import type { ObelusDatabase } from "./obelusDatabase";

/**
 * The single Document of record a fresh install opens into. A stable id keeps
 * creation idempotent, so a double-mounted effect cannot create two Documents.
 */
export const DEFAULT_DOCUMENT_ID = "default";

export function createDocument(now: number = Date.now()): DocumentRecord {
  const tree = emptyDocTree();
  const canonical = canonicalText(tree);
  return {
    id: DEFAULT_DOCUMENT_ID,
    title: "Untitled",
    tree,
    canonical,
    wordCount: wordCount(canonical),
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
  const canonical = canonicalText(tree);
  return {
    ...document,
    tree,
    canonical,
    wordCount: wordCount(canonical),
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
