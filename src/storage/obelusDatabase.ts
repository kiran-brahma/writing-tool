import Dexie, { type Table } from "dexie";
import type { DocTree } from "../core/docTree";
import type { Finding, Interval, Violation } from "../core/finding";
import type { DocumentStatus } from "../core/library";
import type { Pass } from "../core/pass";
import type { ReaderAccount } from "../core/reader";
import type { SectionRef } from "../core/sections";
import type { Connection } from "../wire/connection";
import type { ModelUsage } from "../wire/modelRequest";

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
  /**
   * Story 22's tags. Optional because Documents written before the Library
   * (#8) do not carry them; `normalizeDocument` supplies `[]` on read. The
   * field is stored but not indexed, so adding it rewrites no existing record.
   */
  tags?: string[];
  /** Story 23's status; absent reads as `draft` via `normalizeDocument`. */
  status?: DocumentStatus;
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

/**
 * A Reader account as stored, derived from a Section. It carries the Section's
 * identity so an account can be shown against the heading it was about, and the
 * `passId`/`promptHash` that produced it so a re-run replaces its own accounts
 * and a reload can still name the Pass. It is a separate record kind from a
 * Finding: reader output never mixes with the queue that still needs work.
 */
export interface ReaderAccountRecord extends ReaderAccount {
  id: string;
  documentId: string;
  passId: string;
  promptHash: string;
  section: SectionRef;
}

/**
 * The raw provider response behind a model Run, kept so the global
 * "show raw response" toggle can expose it for any Finding — including one
 * loaded after a reload. Keyed by Document, Pass and `promptHash`, so a Finding
 * kept from an earlier prompt shows the response that produced it. The Run
 * cache (#16) will key a fuller Run record on a still richer key.
 */
export interface RunResponseRecord {
  documentId: string;
  passId: string;
  promptHash: string;
  rawResponse: string;
  at: number;
}

/**
 * A whole model Run, cached under the Run key (story 53): the hash of the
 * Document's text and title, the Pass, its `promptHash`, the Connection and
 * model, the Target interval the Run was asked about, and the two settings that
 * shape the request. A cache hit restores the Findings, the raw response and the
 * usage, and makes no Provider call. `documentId` is carried for cleanup and
 * does not join the key; the cache is about the prose, not the Document record.
 *
 * The Target interval is part of the entry because a local Pass's input depends
 * on the cursor: two Runs with the same Document text but a different Target are
 * different requests. It is not an indexed field, so adding it needs no schema
 * version.
 */
export interface RunCacheRecord {
  /** `runCacheKey(...)`; the primary key. */
  key: string;
  documentId: string;
  canonicalHash: string;
  passId: string;
  promptHash: string;
  connectionId: string;
  protocol: string;
  baseUrl: string;
  model: string;
  screeningFrame: boolean;
  characterLimit: number;
  /** The Target's half-open interval in the Document's canonical string. */
  target: Interval;
  findings: Finding[];
  violations: Violation[];
  droppedAnchors: number;
  rawResponse: string;
  chunks: number;
  usage?: ModelUsage;
  at: number;
}

/**
 * A settings row, keyed by name. Slots live here rather than on a Connection,
 * because which Connection is the Critic is about the Writer's pairing, not
 * about either Connection.
 */
export interface SettingsRecord {
  key: string;
  value: unknown;
}

export const OBELUS_DATABASE_VERSION = 7;
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
  connections!: Table<Connection, string>;
  settings!: Table<SettingsRecord, string>;
  runResponses!: Table<RunResponseRecord, [string, string, string]>;
  readerAccounts!: Table<ReaderAccountRecord, string>;
  runCache!: Table<RunCacheRecord, string>;

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
    // Migration 4: Connections and settings, the repository #3 introduces.
    // Additive once more: prefilled Connections are seeded by id on first load,
    // so the Writer's Documents, Revisions, Findings and Passes are untouched.
    this.version(4).stores({
      documents: "id, updatedAt",
      revisions: "id, documentId, createdAt, [documentId+createdAt]",
      findings: "id, documentId, [documentId+passId]",
      passes: "id, kind",
      connections: "id, builtIn",
      settings: "key",
    });
    // Migration 5: raw provider responses, the repository #4 introduces so the
    // raw-response toggle works for a Finding after a reload. Additive: a new
    // store keyed by Document and Pass, and nothing existing is rewritten.
    this.version(5).stores({
      documents: "id, updatedAt",
      revisions: "id, documentId, createdAt, [documentId+createdAt]",
      findings: "id, documentId, [documentId+passId]",
      passes: "id, kind",
      connections: "id, builtIn",
      settings: "key",
      runResponses: "[documentId+passId+promptHash], documentId",
    });
    // Migration 6: Reader accounts, the repository #11 introduces. Additive: a
    // new store for the Reader pass's own output shape, and nothing existing is
    // rewritten. A Reader account is derived from a Section, so it is keyed by
    // Document and Pass and carries the Section's identity.
    this.version(6).stores({
      documents: "id, updatedAt",
      revisions: "id, documentId, createdAt, [documentId+createdAt]",
      findings: "id, documentId, [documentId+passId]",
      passes: "id, kind",
      connections: "id, builtIn",
      settings: "key",
      runResponses: "[documentId+passId+promptHash], documentId",
      readerAccounts: "id, documentId, [documentId+passId]",
    });
    // Migration 7: the Run cache, the repository #16 introduces. Additive: a new
    // store for a whole model Run's result, keyed by the canonical hash, the
    // Pass, its promptHash, the Connection and the model, and nothing existing
    // is rewritten. It ships in its own commit, ahead of the Run-cache behaviour
    // that uses the store, as docs/migrations.md requires: deploy this migration
    // alone, then the behaviour in the next deploy.
    this.version(7).stores({
      documents: "id, updatedAt",
      revisions: "id, documentId, createdAt, [documentId+createdAt]",
      findings: "id, documentId, [documentId+passId]",
      passes: "id, kind",
      connections: "id, builtIn",
      settings: "key",
      runResponses: "[documentId+passId+promptHash], documentId",
      readerAccounts: "id, documentId, [documentId+passId]",
      runCache: "key, documentId",
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
