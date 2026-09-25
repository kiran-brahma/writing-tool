import { canonicalText, wordCount } from "../core/canonicalText";
import { emptyDocTree, type DocTree } from "../core/docTree";
import type { DocumentStatus } from "../core/library";
import { parseCanonical } from "../core/parseCanonical";
import { isQuotaExceededError } from "../errors";
import type { DocumentRecord } from "./obelusDatabase";
import type { ObelusDatabase } from "./obelusDatabase";
import { pruneRevisions } from "./revisions";
import { clearRunCache } from "./runCache";

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

/**
 * A Document save refused because the stored record is newer than the one this
 * tab holds. Obelus writes the whole record, so persisting a stale one would
 * silently erase whatever the other writer typed. It is thrown rather than
 * swallowed so the Writer sees it: their prose is still in this tab, and the
 * other version is still in storage.
 */
export class DocumentConflictError extends Error {
  constructor() {
    super(
      "Another tab saved this Document after you opened it, so Obelus refused to " +
        "overwrite it. Your writing is still open here: copy it somewhere safe, then " +
        "reload this tab to pick up the other version.",
    );
    this.name = "DocumentConflictError";
  }
}

/**
 * Persists an already-projected Document record, as `withTree` produces.
 *
 * The write is optimistic: a stored record whose `updatedAt` is newer than the
 * one being written belongs to another tab (metadata edits leave `updatedAt`
 * alone, so only prose moves it), and writing over it would lose that tab's
 * work. Two tabs on one Document cannot be merged here, so the later writer is
 * told rather than allowed to clobber.
 */
export async function persistDocument(
  database: ObelusDatabase,
  document: DocumentRecord,
): Promise<void> {
  const stored = await database.documents.get(document.id);
  if (stored !== undefined && stored.updatedAt > document.updatedAt) {
    throw new DocumentConflictError();
  }
  await database.documents.put(document);
}

/** How a Document save ended. `trimmed` means history was dropped to fit. */
export type DocumentSaveOutcome = "stored" | "trimmed";

/**
 * Persists a Document, recovering once from a full storage quota.
 *
 * The Library grows with history rather than with the prose: Revisions hold
 * whole canonical strings and the Run cache holds whole results. When the
 * browser refuses the write, the honest move is to spend what can be rebuilt —
 * the Run cache, then the oldest automatic Revisions, which the spec already
 * calls pruned — and try once more. The outcome is returned rather than logged,
 * so the shell can tell the Writer their history was trimmed and that a backup
 * is the real defence. A failure that is not a full quota, or a second failure,
 * is a real one and is thrown.
 */
export async function saveDocument(
  database: ObelusDatabase,
  document: DocumentRecord,
): Promise<DocumentSaveOutcome> {
  try {
    await persistDocument(database, document);
    return "stored";
  } catch (error) {
    if (!isQuotaExceededError(error)) throw error;
    await clearRunCache(database, document.id);
    await pruneRevisions(database, document.id);
    await persistDocument(database, document);
    return "trimmed";
  }
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
    database.auditAccounts,
    async () => {
      await database.documents.put(updated);
      await database.findings.where("documentId").equals(document.id).delete();
      // Raw responses belonged to the prose that was replaced, so they go with
      // the Findings rather than being shown against unrelated text.
      await database.runResponses.where("documentId").equals(document.id).delete();
      // A Reader account is derived from a Section of the replaced prose, so it
      // goes with the Findings rather than describing text that is gone.
      await database.readerAccounts.where("documentId").equals(document.id).delete();
      // An Audit account is derived from the whole replaced prose, so it goes
      // too rather than judging text that is gone.
      await database.auditAccounts.where("documentId").equals(document.id).delete();
    },
  );
  return updated;
}
