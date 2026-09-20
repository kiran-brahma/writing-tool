import Dexie, { type Table } from "dexie";
import type { DocTree } from "../core/docTree";
import type { Finding } from "../core/finding";
import type { Pass } from "../core/pass";

/**
 * Storage is one database, versioned, with forward-only migrations. A database
 * newer than the running code is refused rather than downgraded: a stale
 * deployment must not risk the Library.
 */

export interface DocumentRecord {
  id: string;
  title: string;
  /** The Document of record is the editor's tree; Markdown is interchange. */
  tree: DocTree;
  canonical: string;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * A Revision is immutable prose plus metadata. It carries no join to mutable or
 * ephemeral state — no "Findings addressed", no "Run in progress". `parentId`
 * is the previous Revision, `documentId` is which Document it belongs to.
 */
export interface RevisionRecord {
  id: string;
  documentId: string;
  parentId: string | null;
  createdAt: number;
  wordCount: number;
  flagged: boolean;
  note: string | null;
  canonical: string;
}

export interface FindingRecord extends Finding {
  /** The join key storage needs; the domain Finding shape does not carry it. */
  documentId: string;
}

export const OBELUS_DATABASE_VERSION = 3;
export const DEFAULT_DATABASE_NAME = "obelus";

/** Dexie scales declared versions by ten to form the native IndexedDB version. */
function nativeVersionFor(declaredVersion: number): number {
  return Math.round(declaredVersion * 10);
}

export class NewerDatabaseError extends Error {
  constructor(databaseName: string, existingVersion: number, requiredVersion: number) {
    super(
      `This browser holds a newer Obelus database ("${databaseName}", schema version ` +
        `${existingVersion / 10}) than this build understands (schema version ${requiredVersion}). ` +
        `Open the newest version of Obelus, or restore a backup. Obelus will not downgrade or ` +
        `delete your Library.`,
    );
    this.name = "NewerDatabaseError";
  }
}

export class ObelusDatabase extends Dexie {
  documents!: Table<DocumentRecord, string>;
  revisions!: Table<RevisionRecord, string>;
  findings!: Table<FindingRecord, string>;
  passes!: Table<Pass, string>;

  constructor(name: string = DEFAULT_DATABASE_NAME) {
    super(name);
    // Migration 1: Documents and Revisions. Forward-only: there is no upgrade
    // function that rewrites existing data, and no delete-and-recreate fallback.
    this.version(1).stores({
      documents: "id, updatedAt",
      revisions: "id, documentId, createdAt, [documentId+createdAt]",
    });
    // Migration 2: Findings, the repository #14 introduces. Additive (a new
    // store and nothing rewritten), which is the safe kind of migration; the
    // Writer's Documents and Revisions are untouched by the upgrade.
    this.version(2).stores({
      documents: "id, updatedAt",
      revisions: "id, documentId, createdAt, [documentId+createdAt]",
      findings: "id, documentId, [documentId+passId]",
    });
    // Migration 3: Passes, the repository #6 introduces. Additive again: the
    // Writer's edited Rule config and enabled flags persist, and the Starter
    // pack is seeded by id on first load rather than by an upgrade rewrite.
    this.version(3).stores({
      documents: "id, updatedAt",
      revisions: "id, documentId, createdAt, [documentId+createdAt]",
      findings: "id, documentId, [documentId+passId]",
      passes: "id, kind",
    });
  }
}

/**
 * Reads the native version of an existing database without Dexie. Opening with
 * no version neither upgrades nor touches stores, and Dexie cannot be trusted
 * to notice a newer database: it catches `VersionError` and silently opens the
 * newer schema instead.
 *
 * On a fresh install this creates an empty native-v1 database, which the real
 * Dexie open then upgrades into migration 1. It is deliberately left in place:
 * deleting it would need a second connection to close first, and a probe that
 * deletes a database is a probe that can endanger the Library.
 */
function readExistingNativeVersion(databaseName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => {
      const version = request.result.version;
      request.result.close();
      resolve(version);
    };
    request.onerror = () => {
      reject(request.error ?? new Error(`Could not inspect database "${databaseName}".`));
    };
  });
}

/**
 * Opens the one Obelus database. A database newer than this code is refused
 * with `NewerDatabaseError`, and nothing is written to it.
 */
export async function openObelusDatabase(
  name: string = DEFAULT_DATABASE_NAME,
): Promise<ObelusDatabase> {
  const existingVersion = await readExistingNativeVersion(name);
  const requiredVersion = nativeVersionFor(OBELUS_DATABASE_VERSION);

  if (existingVersion > requiredVersion) {
    throw new NewerDatabaseError(name, existingVersion, OBELUS_DATABASE_VERSION);
  }

  const database = new ObelusDatabase(name);
  await database.open();
  return database;
}
