/**
 * The durability actions, as a hook: back the Library up, restore it, and move
 * a single Document as a bundle. The storage mechanics live in
 * `src/storage/durability.ts`; this owns the sequence around them — flush the
 * pending save, parse before touching a single store, clear the Revision clock,
 * and only then replace. The shell turns the returned text into a download.
 */

import { useCallback, type RefObject } from "react";
import type { PersistenceController } from "../editor/persistence";
import { describeError } from "../errors";
import {
  exportDocumentBundle,
  exportLibraryBackup,
  importDocumentBundle,
  importLibraryBackup,
  parseDocumentBundle,
  parseLibraryBackup,
  saveLastBackedUp,
  serializeDocumentBundle,
  serializeLibraryBackup,
} from "../storage/durability";
import type { DocumentRecord, ObelusDatabase } from "../storage/obelusDatabase";

export interface DurabilityOptions {
  databaseRef: RefObject<ObelusDatabase | null>;
  persistenceRef: RefObject<PersistenceController | null>;
  documentRef: RefObject<DocumentRecord | null>;
  /** Opens a Document by id, used after a bundle import. */
  openDocument: (documentId: string) => Promise<void>;
  /** Re-reads the whole in-memory view after a Library restore. */
  reloadLibrary: (database: ObelusDatabase) => Promise<void>;
  /** Story 113: records the new backed-up timestamp in the shell. */
  onBackedUp: (at: number) => void;
  /** Surfaces a backup failure, or clears it with `null`. */
  onError: (message: string | null) => void;
}

export interface DurabilityHandle {
  /**
   * Story 111: the Library as a backup file's text. The shell's `deliver`
   * receives the text; the reminder is stamped only after it returns, so a
   * download that never hands off does not count as a backup.
   */
  backupLibrary: (includeKeys: boolean, deliver: (json: string) => void) => Promise<boolean>;
  /** Story 111: replaces the Library from a backup file's text. */
  restoreLibrary: (json: string) => Promise<boolean>;
  /** Story 114: one Document as a bundle file's text, or null on failure. */
  exportBundle: (documentId: string) => Promise<string | null>;
  /** Story 114: imports a Document bundle as a new Document and opens it. */
  importBundle: (json: string) => Promise<string | null>;
}

export function useDurability(options: DurabilityOptions): DurabilityHandle {
  const {
    databaseRef,
    persistenceRef,
    documentRef,
    openDocument,
    reloadLibrary,
    onBackedUp,
    onError,
  } = options;

  /**
   * Story 111: the Library as a backup file's text. Pending prose is flushed
   * first, so the file holds what is on screen. `deliver` hands the text to the
   * shell, and the reminder is stamped only once that has returned, so a failed
   * download does not record a backup that never reached a file.
   */
  const backupLibrary = useCallback(
    async (includeKeys: boolean, deliver: (json: string) => void): Promise<boolean> => {
      const database = databaseRef.current;
      if (database === null) return false;
      try {
        await persistenceRef.current?.flush();
        const backup = await exportLibraryBackup(database, { includeKeys });
        const json = serializeLibraryBackup(backup);
        deliver(json);
        await saveLastBackedUp(database, backup.exportedAt);
        onBackedUp(backup.exportedAt);
        onError(null);
        return true;
      } catch (error) {
        onError(describeError(error));
        return false;
      }
    },
    [databaseRef, persistenceRef, onBackedUp, onError],
  );

  /**
   * Story 111: replaces the Library from a backup file. The parse refuses a
   * foreign or newer file before the transaction touches a store. The flush
   * settles pending prose and the idle Revision clock, so no write that predates
   * the restore can land after it; `importLibraryBackup` queues with runs for
   * the rest.
   */
  const restoreLibrary = useCallback(
    async (json: string): Promise<boolean> => {
      const database = databaseRef.current;
      if (database === null) return false;
      try {
        const backup = parseLibraryBackup(json);
        await persistenceRef.current?.flush();
        await persistenceRef.current?.takeRevision();
        await importLibraryBackup(database, backup);
      } catch (error) {
        onError(describeError(error));
        return false;
      }
      try {
        await reloadLibrary(database);
      } catch (error) {
        // The import committed even though the in-memory view could not refresh.
        // Report the restore as done so the Writer does not retry blindly.
        onError(
          `Your Library was restored, but the view could not refresh: ${describeError(error)}. ` +
            `Reopen Obelus.`,
        );
        return true;
      }
      onError(null);
      return true;
    },
    [databaseRef, persistenceRef, reloadLibrary, onError],
  );

  /** Story 114: one Document, with its Revisions and Findings, as file text. */
  const exportBundle = useCallback(
    async (documentId: string): Promise<string | null> => {
      const database = databaseRef.current;
      if (database === null) return null;
      try {
        // Export the on-screen prose for the active Document, not a stale save.
        if (documentRef.current?.id === documentId) await persistenceRef.current?.flush();
        const bundle = await exportDocumentBundle(database, documentId);
        return bundle === null ? null : serializeDocumentBundle(bundle);
      } catch (error) {
        onError(describeError(error));
        return null;
      }
    },
    [databaseRef, persistenceRef, documentRef, onError],
  );

  /** Story 114: imports a bundle as a new Document and opens it. */
  const importBundle = useCallback(
    async (json: string): Promise<string | null> => {
      const database = databaseRef.current;
      if (database === null) return null;
      try {
        const bundle = parseDocumentBundle(json);
        await persistenceRef.current?.flush();
        const imported = await importDocumentBundle(database, bundle);
        await openDocument(imported.id);
        onError(null);
        return imported.id;
      } catch (error) {
        onError(describeError(error));
        return null;
      }
    },
    [databaseRef, persistenceRef, openDocument, onError],
  );

  return { backupLibrary, restoreLibrary, exportBundle, importBundle };
}
