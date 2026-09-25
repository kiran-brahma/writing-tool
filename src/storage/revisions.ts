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
 * The latest Revision, taking a baseline one when the Document has none. A
 * Finding records the Revision current when it was produced; because Revisions
 * are taken on their own slower cadence, that Revision need not be the text the
 * Run saw, so the Anchor's quote may not be in it. `resolveAnchor` diff-projects
 * from `provenance.revisionId` when the Revision holds the Anchor and falls back
 * to quote match in the current string when it does not.
 */
export async function ensureRevision(
  database: ObelusDatabase,
  document: DocumentRecord,
  now: number = Date.now(),
): Promise<RevisionRecord> {
  const latest = await latestRevision(database, document.id);
  if (latest !== undefined) return latest;

  const created = await takeRevision(database, document, { now });
  if (created !== null) return created;

  // A queued write created the baseline first; re-read rather than guess.
  const again = await latestRevision(database, document.id);
  if (again === undefined) {
    throw new Error(`Could not take a baseline Revision for Document "${document.id}".`);
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
  await pruneRevisions(database, document.id);
  return revision;
}

/**
 * How many un-flagged Revisions a Document keeps. The spec says an
 * auto-Revision is "pruned" and a flagged milestone is not; the auto-Revisions
 * are the ones that would otherwise grow without bound, since every idle
 * debounce writes a full copy of the canonical string. Fifty is deep enough to
 * find "a point from before a bad afternoon" (story 94) and shallow enough
 * that a long Document cannot fill the quota with history nobody opened.
 */
export const AUTO_REVISION_RETENTION = 50;

/**
 * Trims a Document's un-flagged Revisions to the most recent
 * `AUTO_REVISION_RETENTION`, keeping every flagged milestone. Called after each
 * write, inside the same serialised queue, so the Revision just taken is never
 * the one trimmed.
 *
 * A pruned Revision leaves Findings that name it without their prose; that is
 * already a state the code expects (`findings.ts` resolves such an Anchor by
 * quote match instead), so pruning cannot orphan a Finding.
 */
export async function pruneRevisions(
  database: ObelusDatabase,
  documentId: string,
): Promise<number> {
  const newestFirst = await revisionsOf(database, documentId).reverse().toArray();
  const doomed: string[] = [];
  let kept = 0;

  for (const revision of newestFirst) {
    if (revision.flagged) continue;
    kept += 1;
    if (kept > AUTO_REVISION_RETENTION) doomed.push(revision.id);
  }

  if (doomed.length > 0) await database.revisions.bulkDelete(doomed);
  return doomed.length;
}
