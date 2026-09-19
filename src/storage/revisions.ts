import Dexie from "dexie";
import type { DocumentRecord, ObelusDatabase, RevisionRecord } from "./obelusDatabase";

/** Revisions for a Document, newest first. */
export async function listRevisions(
  database: ObelusDatabase,
  documentId: string,
): Promise<RevisionRecord[]> {
  return revisionsOf(database, documentId).reverse().toArray();
}

export async function latestRevision(
  database: ObelusDatabase,
  documentId: string,
): Promise<RevisionRecord | undefined> {
  return revisionsOf(database, documentId).reverse().first();
}

function revisionsOf(database: ObelusDatabase, documentId: string) {
  return database.revisions
    .where("[documentId+createdAt]")
    .between([documentId, Dexie.minKey], [documentId, Dexie.maxKey]);
}

export interface TakeRevisionOptions {
  /** A milestone the Writer marked, carrying an optional note. */
  flagged?: boolean;
  note?: string | null;
  now?: number;
}

/**
 * A Revision whose canonical string is exactly the Document's. A Finding's
 * `provenance.revisionId` and its Anchor offset must name the same canonical, so
 * a Run that has something new to attribute takes a Revision when the latest
 * one is stale rather than reusing it. `takeRevision` skips an unchanged one, so
 * an idle re-run takes nothing.
 */
export async function ensureRevisionForCanonical(
  database: ObelusDatabase,
  document: DocumentRecord,
  now: number = Date.now(),
): Promise<RevisionRecord> {
  const latest = await latestRevision(database, document.id);
  if (latest !== undefined && latest.canonical === document.canonical) return latest;

  const created = await takeRevision(database, document, { now });
  if (created !== null) return created;

  // A queued write changed the latest Revision first; re-read rather than guess.
  const again = await latestRevision(database, document.id);
  if (again === undefined) {
    throw new Error(`Could not take a Revision for Document "${document.id}".`);
  }
  return again;
}

/**
 * Revision writes are serialised per database. `takeRevision` reads the latest
 * Revision then writes its child; without ordering, the idle auto-Revision and a
 * Writer-flagged milestone can overlap and fork the lineage that diff and Judge
 * work depend on.
 */
const revisionQueues = new WeakMap<ObelusDatabase, Promise<void>>();

/**
 * Takes a Revision from the Document's current canonical text. An auto-Revision
 * is skipped when nothing has changed since the last one; a flagged Revision is
 * always taken, because it is the Writer marking a milestone by hand.
 *
 * The record is written once and never updated: prose and metadata are both
 * immutable, which is what keeps a Revision free of mutable state.
 */
export function takeRevision(
  database: ObelusDatabase,
  document: DocumentRecord,
  options: TakeRevisionOptions = {},
): Promise<RevisionRecord | null> {
  const previous = revisionQueues.get(database) ?? Promise.resolve();
  const queued = previous.then(() => takeRevisionNow(database, document, options));
  // Keep later Revisions ordered even if this one fails; the failure is still
  // returned to this call's caller.
  revisionQueues.set(
    database,
    queued.then(
      () => undefined,
      () => undefined,
    ),
  );
  return queued;
}

async function takeRevisionNow(
  database: ObelusDatabase,
  document: DocumentRecord,
  options: TakeRevisionOptions,
): Promise<RevisionRecord | null> {
  const { flagged = false, note = null, now = Date.now() } = options;
  const latest = await latestRevision(database, document.id);

  if (!flagged && latest !== undefined && latest.canonical === document.canonical) {
    return null;
  }

  const revision: RevisionRecord = {
    id: crypto.randomUUID(),
    documentId: document.id,
    parentId: latest?.id ?? null,
    createdAt: now,
    wordCount: document.wordCount,
    flagged,
    note: flagged ? note : null,
    canonical: document.canonical,
  };

  await database.revisions.put(revision);
  return revision;
}
