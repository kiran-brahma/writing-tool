import Dexie, { type Table } from "dexie";
import type { DocTree } from "../core/docTree";

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

export const OBELUS_DATABASE_VERSION = 1;
export const DEFAULT_DATABASE_NAME = "obelus";

/** Dexie scales declared versions by ten to form the native IndexedDB version. */
function nativeVersionFor(declaredVersion: number): number {
  return Math.round(declaredVersion * 10);
}

export class NewerDatabaseError extends Error {
  readonly databaseName: string;
  readonly existingVersion: number;
  readonly requiredVersion: number;

  constructor(databaseName: string, existingVersion: number, requiredVersion: number) {
    super(
      `This browser holds a newer Obelus database ("${databaseName}", schema version ` +
        `${existingVersion / 10}) than this build understands (schema version ${requiredVersion}). ` +
        `Open the newest version of Obelus, or restore a backup. Obelus will not downgrade or ` +
        `delete your Library.`,
    );
    this.name = "NewerDatabaseError";
    this.databaseName = databaseName;
    this.existingVersion = existingVersion;
    this.requiredVersion = requiredVersion;
  }
}

export class ObelusDatabase extends Dexie {
  documents!: Table<DocumentRecord, string>;
  revisions!: Table<RevisionRecord, string>;

  constructor(name: string = DEFAULT_DATABASE_NAME) {
    super(name);
    // Migration 1. Forward-only: there is no upgrade function that rewrites
    // existing data, and no delete-and-recreate fallback anywhere.
    this.version(OBELUS_DATABASE_VERSION).stores({
      documents: "id, updatedAt",
      revisions: "id, documentId, createdAt, [documentId+createdAt]",
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
