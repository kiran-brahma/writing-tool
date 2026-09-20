/**
 * Durability: the whole-Library backup, its import, and the single-Document
 * bundle. A backup is a JSON snapshot of every Library store; import replaces
 * the Library with that snapshot, so the file is a recovery path rather than a
 * merge. Keys are excluded by default and included only on explicit opt-in.
 *
 * Nothing here leaves the browser: these functions read and write IndexedDB and
 * return plain objects. The shell turns them into a download.
 */

import type { Pass } from "../core/pass";
import type { Connection } from "../wire/connection";
import { enqueueMutation } from "./mutationQueue";
import type {
  DocumentRecord,
  FindingRecord,
  ObelusDatabase,
  ReaderAccountRecord,
  RevisionRecord,
  RunResponseRecord,
  SettingsRecord,
} from "./obelusDatabase";

/** The tag written into a whole-Library backup, so import can tell what it holds. */
export const LIBRARY_BACKUP_FORMAT = "obelus.library-backup";

/** The tag written into a single-Document bundle. */
export const DOCUMENT_BUNDLE_FORMAT = "obelus.document-bundle";

/**
 * The backup schema version this build writes and the newest it can read. A
 * file from a newer build is refused rather than half-read, the same stance the
 * database takes toward a newer schema.
 */
export const BACKUP_FORMAT_VERSION = 1;

/** The settings key that carries the last-backed-up timestamp. */
export const LAST_BACKED_UP_SETTING_KEY = "lastBackedUp";

export interface LibraryBackup {
  format: typeof LIBRARY_BACKUP_FORMAT;
  version: number;
  /** The moment the backup was written; also the reminder's new timestamp. */
  exportedAt: number;
  /** Whether the file carries persisted Connection keys. */
  includesKeys: boolean;
  documents: DocumentRecord[];
  revisions: RevisionRecord[];
  findings: FindingRecord[];
  passes: Pass[];
  connections: Connection[];
  settings: SettingsRecord[];
  runResponses: RunResponseRecord[];
  readerAccounts: ReaderAccountRecord[];
}

export interface DocumentBundle {
  format: typeof DOCUMENT_BUNDLE_FORMAT;
  version: number;
  exportedAt: number;
  document: DocumentRecord;
  revisions: RevisionRecord[];
  findings: FindingRecord[];
  runResponses: RunResponseRecord[];
  readerAccounts: ReaderAccountRecord[];
}

/** A file that is not an Obelus backup or bundle, refused before anything is written. */
export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupFormatError";
  }
}

/** The timestamp of the last backup, or null when the Writer has never made one. */
export async function loadLastBackedUp(database: ObelusDatabase): Promise<number | null> {
  const record = await database.settings.get(LAST_BACKED_UP_SETTING_KEY);
  return typeof record?.value === "number" && Number.isFinite(record.value)
    ? record.value
    : null;
}

export interface ExportLibraryOptions {
  /** Story 112: false strips every persisted key from the file. */
  includeKeys?: boolean;
  now?: number;
}

/**
 * Story 111: the whole Library as one backup object, read in a single snapshot
 * so a Run cannot commit between two table reads. A session-mode key was never
 * persisted, so even `includeKeys: true` cannot put it in the file. Stamping the
 * reminder is a separate step the caller takes once the file has been handed
 * off.
 */
export async function exportLibraryBackup(
  database: ObelusDatabase,
  options: ExportLibraryOptions = {},
): Promise<LibraryBackup> {
  const includeKeys = options.includeKeys ?? false;
  const now = options.now ?? Date.now();

  const [documents, revisions, findings, passes, connections, settings, runResponses, readerAccounts] =
    await database.transaction(
      "r",
      [
        database.documents,
        database.revisions,
        database.findings,
        database.passes,
        database.connections,
        database.settings,
        database.runResponses,
        database.readerAccounts,
      ],
      () =>
        Promise.all([
          database.documents.toArray(),
          database.revisions.toArray(),
          database.findings.toArray(),
          database.passes.toArray(),
          database.connections.toArray(),
          database.settings.toArray(),
          database.runResponses.toArray(),
          database.readerAccounts.toArray(),
        ]),
    );

  return {
    format: LIBRARY_BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: now,
    includesKeys: includeKeys,
    documents,
    revisions,
    findings,
    passes,
    connections: connections.map((connection) => connectionForBackup(connection, includeKeys)),
    // The file carries the backup time rather than the pre-backup setting, so a
    // restore does not rewind the reminder.
    settings: withSetting(settings, LAST_BACKED_UP_SETTING_KEY, now),
    runResponses,
    readerAccounts,
  };
}

/**
 * Story 113: records that a backup was written. The shell calls this only after
 * the backup has been serialized, so the reminder cannot claim a file that was
 * never produced.
 */
export async function saveLastBackedUp(database: ObelusDatabase, at: number): Promise<void> {
  await database.settings.put({ key: LAST_BACKED_UP_SETTING_KEY, value: at });
}

/**
 * Story 112: a session key is never persisted, so it must never enter a file
 * even if a bug left one on the record. A persisted key is included only when
 * the Writer opted in.
 */
function connectionForBackup(connection: Connection, includeKeys: boolean): Connection {
  if (connection.keyMode !== "persisted") return { ...connection, apiKey: "" };
  return includeKeys ? connection : { ...connection, apiKey: "" };
}

/** Replace one setting in an in-memory list, or append it. */
function withSetting(settings: SettingsRecord[], key: string, value: unknown): SettingsRecord[] {
  const replaced = settings.map((setting) => (setting.key === key ? { key, value } : setting));
  return replaced.some((setting) => setting.key === key)
    ? replaced
    : [...replaced, { key, value }];
}

export function serializeLibraryBackup(backup: LibraryBackup): string {
  return JSON.stringify(backup, null, 2);
}

export function serializeDocumentBundle(bundle: DocumentBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/**
 * Reads a backup file back into a `LibraryBackup`, refusing anything that is
 * not one before it can touch the Library. The envelope is checked strictly —
 * tag, version, and every collection present — while the records inside are
 * trusted to the same normalization the rest of storage applies on read.
 */
export function parseLibraryBackup(text: string): LibraryBackup {
  const value = parseEnvelope(text, {
    what: "backup",
    format: LIBRARY_BACKUP_FORMAT,
    fields: [
      "documents",
      "revisions",
      "findings",
      "passes",
      "connections",
      "settings",
      "runResponses",
      "readerAccounts",
    ],
  });
  if (typeof value.exportedAt !== "number" || !Number.isFinite(value.exportedAt)) {
    throw new BackupFormatError("That backup has no valid timestamp.");
  }
  // A Document the app cannot render must be refused here, before it becomes
  // the most-recent Document and wedges every later open.
  if (!Array.isArray(value.documents) || !value.documents.every(isDocumentRecord)) {
    throw new BackupFormatError("That backup holds a Document Obelus cannot read.");
  }
  return value as unknown as LibraryBackup;
}

export function parseDocumentBundle(text: string): DocumentBundle {
  const value = parseEnvelope(text, {
    what: "bundle",
    format: DOCUMENT_BUNDLE_FORMAT,
    fields: ["revisions", "findings", "runResponses", "readerAccounts"],
  });
  if (!isDocumentRecord(value.document)) {
    throw new BackupFormatError("That bundle has no readable Document.");
  }
  return value as unknown as DocumentBundle;
}

/**
 * The envelope both formats share: a tag, a readable version, and the named
 * collections present. The record contents are trusted to the same
 * normalization the rest of storage applies on read.
 */
function parseEnvelope(
  text: string,
  options: { what: string; format: string; fields: string[] },
): Record<string, unknown> {
  const value = parseObject(text, options.what);
  if (value.format !== options.format) {
    throw new BackupFormatError(`That file is not an Obelus ${options.what}.`);
  }
  requireReadableVersion(value.version, options.what);
  for (const field of options.fields) {
    if (!Array.isArray(value[field])) {
      throw new BackupFormatError(`That ${options.what} is missing its "${field}" list.`);
    }
  }
  return value;
}

function parseObject(text: string, what: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // The parse failure is the answer: a file that is not JSON is not a backup.
    throw new BackupFormatError(`That ${what} file is not readable JSON.`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BackupFormatError(`That ${what} file does not contain an Obelus object.`);
  }
  return parsed as Record<string, unknown>;
}

/** A newer file is refused rather than half-read, exactly as a newer database is. */
function requireReadableVersion(version: unknown, what: string): void {
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new BackupFormatError(`That ${what} has no readable version.`);
  }
  if (version > BACKUP_FORMAT_VERSION) {
    throw new BackupFormatError(
      `That ${what} was written by a newer Obelus (format version ${version}; this build reads ` +
        `up to ${BACKUP_FORMAT_VERSION}). Update Obelus, or restore an older ${what}.`,
    );
  }
}

/**
 * The Document envelope a backup or bundle must carry before it may replace or
 * join the Library. The derived fields are required; the Library metadata
 * `tags` and `status` are optional and normalized on read.
 */
function isDocumentRecord(value: unknown): value is DocumentRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.tree === "object" &&
    candidate.tree !== null &&
    typeof candidate.canonical === "string" &&
    typeof candidate.wordCount === "number" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number"
  );
}

/**
 * Story 111: replaces the whole Library with a backup. Every store is cleared
 * and refilled in one transaction, so a failure leaves the Library as it was
 * rather than half-restored. The last-backed-up timestamp becomes the file's
 * timestamp: the imported state is exactly what was backed up.
 */
export function importLibraryBackup(
  database: ObelusDatabase,
  backup: LibraryBackup,
): Promise<void> {
  // Queued with rule, model and Reader Runs, so a restore lands after any write
  // already in flight rather than being overwritten by one that predates it.
  return enqueueMutation(database, () =>
    database.transaction(
      "rw",
      [
        database.documents,
        database.revisions,
        database.findings,
        database.passes,
        database.connections,
        database.settings,
        database.runResponses,
        database.readerAccounts,
      ],
      async () => {
        // A backup that excluded keys is authoritative about prose, not about
        // secrets: restoring it over a Library that already holds a persisted
        // key keeps that key rather than silently blanking it. A backup that
        // included keys wins outright.
        const existingKeys = new Map<string, string>();
        if (backup.includesKeys !== true) {
          for (const existing of await database.connections.toArray()) {
            if (existing.apiKey !== "") existingKeys.set(existing.id, existing.apiKey);
          }
        }
        const connections = backup.connections.map((connection) => {
          const existing = existingKeys.get(connection.id);
          return existing !== undefined && connection.apiKey === ""
            ? { ...connection, apiKey: existing }
            : connection;
        });

        await Promise.all([
          database.documents.clear(),
          database.revisions.clear(),
          database.findings.clear(),
          database.passes.clear(),
          database.connections.clear(),
          database.settings.clear(),
          database.runResponses.clear(),
          database.readerAccounts.clear(),
        ]);

        await database.documents.bulkPut(backup.documents);
        await database.revisions.bulkPut(backup.revisions);
        await database.findings.bulkPut(backup.findings);
        await database.passes.bulkPut(backup.passes);
        await database.connections.bulkPut(connections);
        await database.settings.bulkPut(backup.settings);
        await database.runResponses.bulkPut(backup.runResponses);
        await database.readerAccounts.bulkPut(backup.readerAccounts);

        // The restored settings may carry a stale reminder; the file's timestamp
        // is the honest one, because that is when the data was last captured.
        await database.settings.put({ key: LAST_BACKED_UP_SETTING_KEY, value: backup.exportedAt });
      },
    ),
  );
}

/**
 * Story 114: one Document as a bundle carrying its Revisions and Findings — and
 * the raw Run responses and Reader accounts that belong to the same prose, so
 * the piece moves intact. Returns null when no Document has that id.
 */
export async function exportDocumentBundle(
  database: ObelusDatabase,
  documentId: string,
  now: number = Date.now(),
): Promise<DocumentBundle | null> {
  const document = await database.documents.get(documentId);
  if (document === undefined) return null;

  const [revisions, findings, runResponses, readerAccounts] = await Promise.all([
    database.revisions.where("documentId").equals(documentId).toArray(),
    database.findings.where("documentId").equals(documentId).toArray(),
    database.runResponses.where("documentId").equals(documentId).toArray(),
    database.readerAccounts.where("documentId").equals(documentId).toArray(),
  ]);

  return {
    format: DOCUMENT_BUNDLE_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: now,
    document,
    revisions,
    findings,
    runResponses,
    readerAccounts,
  };
}

export interface ImportDocumentBundleOptions {
  /** The new Document's id; generated when omitted. */
  id?: string;
  now?: number;
}

/**
 * Story 114's other half: imports a Document bundle as a *new* Document. Every
 * id is regenerated and every internal join remapped, so importing the same
 * bundle twice yields two independent Documents rather than an overwrite. A
 * Finding's `provenance.revisionId` is remapped with the Revisions; a
 * provenance Revision the bundle never carried is given a fresh, unreachable id
 * so it resolves by quote match instead of colliding with a Revision from
 * another Document.
 */
export function importDocumentBundle(
  database: ObelusDatabase,
  bundle: DocumentBundle,
  options: ImportDocumentBundleOptions = {},
): Promise<DocumentRecord> {
  const now = options.now ?? Date.now();
  const documentId = options.id ?? crypto.randomUUID();

  const referencedRevisionIds = [
    ...bundle.revisions.map((revision) => revision.id),
    ...bundle.revisions.flatMap((revision) =>
      revision.parentId === null ? [] : [revision.parentId],
    ),
    ...bundle.findings.map((finding) => finding.provenance.revisionId),
    ...bundle.readerAccounts.map((account) => account.provenance.revisionId),
  ];
  const revisionIds = freshIdMap(referencedRevisionIds);
  // Every referenced Revision gets a fresh id, so a join can never point at a
  // Revision owned by another Document. A reference the bundle never carried
  // maps to a fresh unreachable id, so it resolves by quote match instead.
  const revisionIdFor = (id: string): string => revisionIds.get(id) ?? crypto.randomUUID();

  const document: DocumentRecord = {
    ...bundle.document,
    id: documentId,
    updatedAt: now,
  };
  const revisions: RevisionRecord[] = bundle.revisions.map((revision) => ({
    ...revision,
    id: revisionIdFor(revision.id),
    parentId: revision.parentId === null ? null : revisionIdFor(revision.parentId),
    documentId,
  }));
  const findings: FindingRecord[] = bundle.findings.map((finding) => ({
    ...finding,
    id: crypto.randomUUID(),
    documentId,
    provenance: {
      ...finding.provenance,
      revisionId: revisionIdFor(finding.provenance.revisionId),
    },
  }));
  const runResponses: RunResponseRecord[] = bundle.runResponses.map((response) => ({
    ...response,
    documentId,
  }));
  const readerAccounts: ReaderAccountRecord[] = bundle.readerAccounts.map((account) => ({
    ...account,
    id: crypto.randomUUID(),
    documentId,
    provenance: {
      ...account.provenance,
      revisionId: revisionIdFor(account.provenance.revisionId),
    },
  }));

  // Queued with Runs, so importing a copy cannot interleave with a write.
  return enqueueMutation(database, async () => {
    await database.transaction(
      "rw",
      [
        database.documents,
        database.revisions,
        database.findings,
        database.runResponses,
        database.readerAccounts,
      ],
      async () => {
        await database.documents.put(document);
        await database.revisions.bulkPut(revisions);
        await database.findings.bulkPut(findings);
        await database.runResponses.bulkPut(runResponses);
        await database.readerAccounts.bulkPut(readerAccounts);
      },
    );
    return document;
  });
}

/**
 * A fresh id for every distinct id, stable within one import. Duplicates map to
 * the same new id, so a Finding and its Revision stay joined.
 */
function freshIdMap(ids: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const id of ids) {
    if (!map.has(id)) map.set(id, crypto.randomUUID());
  }
  return map;
}
