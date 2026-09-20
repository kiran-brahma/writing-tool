/**
 * The Library's storage: the list the Writer sees, plus the metadata writes
 * behind tagging, status and renaming. It reads the Document records and joins
 * the open-Finding count onto each; the pure search and tag filters live in
 * `src/core/library.ts`.
 */

import { normalizeTags, type DocumentStatus, type LibraryEntry } from "../core/library";
import {
  createDocument,
  normalizeDocument,
  SCRATCHPAD_DOCUMENT_ID,
  type NormalizedDocumentRecord,
} from "./documents";
import type { DocumentRecord, ObelusDatabase } from "./obelusDatabase";

/** Project one Document into its Library row. */
export function toLibraryEntry(document: DocumentRecord, openFindings: number): LibraryEntry {
  const normalized = normalizeDocument(document);
  return {
    id: normalized.id,
    title: normalized.title,
    canonical: normalized.canonical,
    wordCount: normalized.wordCount,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    openFindings,
    tags: normalized.tags,
    status: normalized.status,
    scratchpad: normalized.id === SCRATCHPAD_DOCUMENT_ID,
  };
}

/**
 * Story 20: how many Findings are still open per Document. Only `open` counts:
 * an addressed or declined Finding has left the queue, so it is not attention
 * the Writer still owes. Internal to `listLibrary`, which is the Library's one
 * read entry point.
 */
async function openFindingCounts(database: ObelusDatabase): Promise<Map<string, number>> {
  const findings = await database.findings.toArray();
  const counts = new Map<string, number>();
  for (const finding of findings) {
    if (finding.status !== "open") continue;
    counts.set(finding.documentId, (counts.get(finding.documentId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Story 20: every Document in the Library, newest edited first, each with its
 * open-Finding count. This is the whole list; search and tag filtering happen
 * in Core so they need no database.
 */
export async function listLibrary(database: ObelusDatabase): Promise<LibraryEntry[]> {
  const [documents, counts] = await Promise.all([
    database.documents.orderBy("updatedAt").reverse().toArray(),
    openFindingCounts(database),
  ]);
  return documents.map((document) => toLibraryEntry(document, counts.get(document.id) ?? 0));
}

/** Creates and persists a new empty Document, the "New Document" action. */
export async function createLibraryDocument(
  database: ObelusDatabase,
  now: number = Date.now(),
): Promise<DocumentRecord> {
  const document = createDocument(now);
  await database.documents.put(document);
  return document;
}

/** The metadata fields the Writer may change without touching the prose. */
export interface DocumentMetadataPatch {
  title?: string;
  status?: DocumentStatus;
  tags?: string[];
}

/**
 * Applies a title, status or tag change to a record, normalizing the result.
 * An all-blank title falls back to `Untitled`. Extracted so the shell can patch
 * the active Document's in-memory record — which may hold unsaved prose — before
 * any concurrent save runs, rather than reading a stale stored copy.
 */
export function applyMetadataPatch(
  record: DocumentRecord,
  patch: DocumentMetadataPatch,
): NormalizedDocumentRecord {
  const current = normalizeDocument(record);
  return {
    ...current,
    title: patch.title === undefined ? current.title : (patch.title.trim() || "Untitled"),
    status: patch.status ?? current.status,
    tags: patch.tags === undefined ? current.tags : normalizeTags(patch.tags),
  };
}

/**
 * Applies a metadata patch to a stored Document and returns the updated record,
 * or `null` when no Document has that id. `updatedAt` is left alone: it is the
 * prose's last-edited time, so tagging a Document does not reorder the Library.
 */
export function updateDocumentMetadata(
  database: ObelusDatabase,
  documentId: string,
  patch: DocumentMetadataPatch,
): Promise<DocumentRecord | null> {
  return database.transaction("rw", database.documents, async () => {
    const record = await database.documents.get(documentId);
    if (record === undefined) return null;

    const updated = applyMetadataPatch(record, patch);
    await database.documents.put(updated);
    return updated;
  });
}
