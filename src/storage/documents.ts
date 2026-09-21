import { canonicalText, wordCount } from "../core/canonicalText";
import { emptyDocTree, type DocTree } from "../core/docTree";
import type { DocumentStatus } from "../core/library";
import { parseCanonical } from "../core/parseCanonical";
import type { DocumentRecord } from "./obelusDatabase";
import type { ObelusDatabase } from "./obelusDatabase";

/**
 * The one Document that always exists: the Scratchpad (story 24). A stable id
 * makes creation idempotent, so a double-mounted effect cannot create two.
 */
export const SCRATCHPAD_DOCUMENT_ID = "scratchpad";

/** The derived fields of a Document: canonical text and its word count. */
function derive(tree: DocTree): Pick<DocumentRecord, "canonical" | "wordCount"> {
  const canonical = canonicalText(tree);
  return { canonical, wordCount: wordCount(canonical) };
}

/**
 * A new empty Document with a fresh id, carrying the Library fields so nothing
 * downstream has to fill them in.
 */
export function createDocument(now: number = Date.now()): DocumentRecord {
  const tree = emptyDocTree();
  return {
    id: crypto.randomUUID(),
    title: "Untitled",
    tree,
    ...derive(tree),
    tags: [],
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

/** Story 24: the auto-created Scratchpad, a Document under a stable id. */
function createScratchpad(now: number = Date.now()): DocumentRecord {
  return { ...createDocument(now), id: SCRATCHPAD_DOCUMENT_ID, title: "Scratchpad" };
}

/**
 * Ensures the Scratchpad exists and returns it. Idempotent by the stable id, so
 * it is safe to call on every open.
 */
export async function ensureScratchpad(
  database: ObelusDatabase,
  now: number = Date.now(),
): Promise<DocumentRecord> {
  const existing = await database.documents.get(SCRATCHPAD_DOCUMENT_ID);
  if (existing !== undefined) return existing;

  const scratchpad = createScratchpad(now);
  await database.documents.put(scratchpad);
  return scratchpad;
}

/**
 * The Document to open on launch: the most recently edited. The Scratchpad is
 * guaranteed to exist, which is what a fresh install opens into (stories 1 and
 * 24). The Scratchpad is created *after* the read on purpose: on an upgrade the
 * Writer's existing Documents must win, and a fresh Scratchpad stamped
 * `updatedAt = now` would otherwise sort first and drop them into an empty one.
 */
export async function loadOrCreateDocument(
  database: ObelusDatabase,
  now: number = Date.now(),
): Promise<DocumentRecord> {
  const mostRecent = await database.documents.orderBy("updatedAt").reverse().first();
  const scratchpad = await ensureScratchpad(database, now);
  return mostRecent ?? scratchpad;
}

/**
 * A Document with its Library fields filled in. Documents written before the
 * Library carry no `tags` or `status`; they read as untagged and `draft`. The
 * fields are stored unindexed, so no migration rewrites existing records — the
 * defaults are applied where the value is read.
 */
export type NormalizedDocumentRecord = DocumentRecord & {
  tags: string[];
  status: DocumentStatus;
};

export function normalizeDocument(record: DocumentRecord): NormalizedDocumentRecord {
  return {
    ...record,
    tags: record.tags ?? [],
    status: record.status ?? "draft",
  };
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
function documentFromMarkdown(
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
  await database.transaction(
    "rw",
    database.documents,
    database.findings,
    database.runResponses,
    database.readerAccounts,
    async () => {
      await database.documents.put(updated);
      await database.findings.where("documentId").equals(document.id).delete();
      // Raw responses belonged to the prose that was replaced, so they go with
      // the Findings rather than being shown against unrelated text.
      await database.runResponses.where("documentId").equals(document.id).delete();
      // A Reader account is derived from a Section of the replaced prose, so it
      // goes with the Findings rather than describing text that is gone.
      await database.readerAccounts.where("documentId").equals(document.id).delete();
    },
  );
  return updated;
}
