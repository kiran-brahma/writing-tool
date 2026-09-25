import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { reResolveFindings, type FindingResolution } from "../core/anchor";
import type { DocTree } from "../core/docTree";
import type { Finding } from "../core/finding";
import type { DocumentStatus, LibraryEntry } from "../core/library";
import type { Pass } from "../core/pass";
import { describeError } from "../errors";
import {
  createPersistence,
  TYPING_PAUSE_MS,
  type PersistenceController,
} from "../editor/persistence";
import {
  exportDocument,
  importDocument,
  loadOrCreateDocument,
  persistDocument,
  saveDocument,
  withTree,
} from "../storage/documents";
import { loadLastBackedUp } from "../storage/durability";
import {
  applyMetadataPatch,
  createLibraryDocument,
  listLibrary,
  updateDocumentMetadata,
  type DocumentMetadataPatch,
} from "../storage/library";
import {
  openObelusDatabase,
  type DocumentRecord,
  type ObelusDatabase,
} from "../storage/obelusDatabase";
import { requestPersistentStorage } from "../storage/persist";
import { takeRevision } from "../storage/revisions";
import { runRulePasses } from "../storage/ruleRuns";
import { useDurability } from "../durability/useDurability";
import type { GlobalSettingsHandle } from "../settings/useGlobalSettings";
import type { ConnectionsHandle } from "../settings/useConnections";
import type { PassSetHandle } from "../passes/usePassSet";
import type { RunsHandle } from "../runs/useRuns";
import { transport as appTransport } from "../wire/productionTransport";
import type { Transport } from "../wire/transport";

/**
 * Shown when a save had to drop history to fit the storage quota. It says what
 * was spent and what the Writer should do, because a silent trim would look
 * like lost work and the backup is the only real defence against eviction.
 */
const STORAGE_TRIMMED_NOTICE =
  "Your Library was full, so Obelus dropped its Run cache and the oldest automatic " +
  "Revisions to save this Document. Your prose is safe. Back up your Library to protect it.";

export interface DocumentLifecycleOptions {
  databaseRef: RefObject<ObelusDatabase | null>;
  documentRef: RefObject<DocumentRecord | null>;
  persistenceRef: RefObject<PersistenceController | null>;
  findingsRef: RefObject<Finding[]>;
  canonicalsRef: RefObject<Map<string, string>>;
  passesRef: RefObject<Pass[]>;
  voiceListRef: RefObject<string[]>;
  transportRef: RefObject<Transport | null>;
  /** The canonical string last saved or read, for the Reader/Audit freshness rule. */
  savedCanonicalRef: RefObject<string | null>;
  setDocumentRecord: (document: DocumentRecord) => void;
  /** Surfaces a save failure, or clears it with `null`; never a silent failure. */
  onError: (message: string | null) => void;
  /** Applies a resolved Finding set to the queue and Highlights. */
  applyResolution: (resolution: FindingResolution) => void;
  refreshFindings: (document?: DocumentRecord | null) => Promise<void>;
  refreshRevisions: () => Promise<void>;
  /** The global stores, read here so the mount and restore paths cannot drift. */
  settings: GlobalSettingsHandle;
  connections: ConnectionsHandle;
  passes: PassSetHandle;
  runs: RunsHandle;
}

/**
 * The Document of record: opening the database, the persistence controller, the
 * Library, the Revision list, the milestone action, metadata writes, Markdown
 * import/export and the durability actions. It is deliberately separate from
 * layout so the Document has one explicit state boundary, and the refs are
 * reserved for callbacks that must read the latest value synchronously (a
 * `pagehide` save must not wait for a re-render).
 */
export interface DocumentLifecycleHandle {
  status: "loading" | "ready" | "error";
  openError: string;
  storageNotice: string | null;
  dismissStorageNotice: () => void;
  /** Story 20: every Document held in this browser, newest edited first. */
  library: LibraryEntry[];
  /** Re-reads the Library, flushing pending edits so the list shows stored state. */
  refreshLibrary: () => Promise<void>;
  /** Story 20: open another Document from the Library. */
  openDocument: (documentId: string) => Promise<void>;
  /** Creates an empty Document and opens it. */
  createDocument: () => Promise<void>;
  /** Story 20: rename a Document. */
  renameDocument: (documentId: string, title: string) => Promise<void>;
  /** Story 23: set a Document's status. */
  setDocumentStatus: (documentId: string, status: DocumentStatus) => Promise<void>;
  /** Story 22: replace a Document's tags. */
  setDocumentTags: (documentId: string, tags: string[]) => Promise<void>;
  importFromMarkdown: (markdown: string) => Promise<void>;
  exportToMarkdown: () => string;
  handleChange: (tree: DocTree) => void;
  flagMilestone: (note: string) => Promise<void>;
  /**
   * Story 111: the whole Library as one backup file's text. `deliver` hands the
   * text to the shell; the reminder is stamped only after it returns.
   */
  backupLibrary: (includeKeys: boolean, deliver: (json: string) => void) => Promise<boolean>;
  /** Story 111: replaces the whole Library from a backup file's text. */
  restoreLibrary: (json: string) => Promise<boolean>;
  /** Story 114: one Document as a bundle file's text, or null on failure. */
  exportBundle: (documentId: string) => Promise<string | null>;
  /** Story 114: imports a Document bundle as a new Document and opens it. */
  importBundle: (json: string) => Promise<string | null>;
  /** Story 113: when the Writer last backed up, or null when never. */
  lastBackedUp: number | null;
  /** A backup or restore failure, surfaced verbatim rather than swallowed. */
  backupError: string | null;
  clearBackupError: () => void;
}

export function useDocumentLifecycle(
  options: DocumentLifecycleOptions,
): DocumentLifecycleHandle {
  const {
    databaseRef,
    documentRef,
    persistenceRef,
    findingsRef,
    canonicalsRef,
    passesRef,
    voiceListRef,
    transportRef,
    savedCanonicalRef,
    setDocumentRecord,
    onError,
    applyResolution,
    refreshFindings,
    refreshRevisions,
    settings,
    connections,
    passes,
    runs,
  } = options;

  const [status, setStatus] = useState<DocumentLifecycleHandle["status"]>("loading");
  const [openError, setOpenError] = useState("");
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const dismissStorageNotice = useCallback(() => setStorageNotice(null), []);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [lastBackedUp, setLastBackedUp] = useState<number | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  /**
   * The pending typing-pause timer. When it fires the shell catches up with
   * the Writer's text: the Document re-renders and Findings re-resolve.
   */
  const pauseTimerRef = useRef<number | null>(null);

  /**
   * Reads the Library list without touching persistence. Writes that change a
   * Document's metadata or add one call this; the flushing variant below is for
   * opening the Library from the Editor, where a keystroke may still be pending.
   */
  const readLibrary = useCallback(async () => {
    const database = databaseRef.current;
    if (database === null) return;
    setLibrary(await listLibrary(database));
  }, [databaseRef]);

  /**
   * Reads the Library list, flushing pending edits first: the list shows stored
   * state — word count and last-edited come from the record, and a keystroke
   * still on the debounce has not reached it.
   */
  const refreshLibrary = useCallback(async () => {
    await persistenceRef.current?.flush();
    await readLibrary();
  }, [persistenceRef, readLibrary]);

  /**
   * Loads one Document into the Editor: its stored record and prose plus its own
   * Findings, Revisions, raw responses and Reader accounts. Both the mount path
   * and every Library open call it, so the two cannot drift. The previous
   * Document's analysis is cleared synchronously so the Editor never draws its
   * Highlights over the prose that just replaced it.
   */
  const enterDocument = useCallback(
    async (database: ObelusDatabase, opened: DocumentRecord) => {
      documentRef.current = opened;
      savedCanonicalRef.current = opened.canonical;
      canonicalsRef.current = new Map();
      setDocumentRecord(opened);
      applyResolution({ findings: [], highlights: [], changed: [] });
      await runs.loadAnalysis(database, opened);
      await runRulePasses(database, opened, {
        passes: passesRef.current,
        voiceList: voiceListRef.current,
      });
      await refreshFindings(opened);
      await refreshRevisions();
    },
    [
      documentRef,
      savedCanonicalRef,
      canonicalsRef,
      setDocumentRecord,
      applyResolution,
      runs.loadAnalysis,
      passesRef,
      voiceListRef,
      refreshFindings,
      refreshRevisions,
    ],
  );

  /**
   * Loads the global stores every part of the shell reads: the Pass set, the
   * Connections and Slots, the global settings and the last-backed-up reminder.
   * Shared by the mount path and the restore path, so the two cannot drift when
   * a global store is added.
   */
  const loadGlobalState = useCallback(
    async (database: ObelusDatabase) => {
      await passes.load(database);
      await connections.load(database);
      await settings.load(database);
      await runs.loadPriceTable(database);
      setLastBackedUp(await loadLastBackedUp(database));
    },
    [passes.load, connections.load, settings.load, runs.loadPriceTable],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const database = await openObelusDatabase();
        const opened = await loadOrCreateDocument(database);
        if (cancelled) {
          database.close();
          return;
        }

        databaseRef.current = database;

        await loadGlobalState(database);
        // The one seam, shared with the Connections panel: every model Run and
        // every test/list request waits behind the same per-Connection gate, so
        // the visible queue tells the truth and the cap is actually shared.
        transportRef.current = appTransport;
        await enterDocument(database, opened);
        setLibrary(await listLibrary(database));

        persistenceRef.current = createPersistence({
          save: async () => {
            const current = documentRef.current;
            if (current === null) return;
            const outcome = await saveDocument(database, current);
            if (outcome === "trimmed") setStorageNotice(STORAGE_TRIMMED_NOTICE);
            // Story 115: the browser may evict IndexedDB under storage pressure.
            // Ask it to persist the Library on the first save; the request is
            // idempotent, non-blocking and never fails the save that triggers it.
            void requestPersistentStorage();
            onError(null);
            await runRulePasses(database, current, {
              passes: passesRef.current,
              voiceList: voiceListRef.current,
            });
            await refreshFindings(current);
            await refreshRevisions();
            // The prose changed, so any Reader account describes text that is
            // gone. Clearing is the honest move; a Reader Run refreshes them.
            if (savedCanonicalRef.current !== current.canonical) {
              savedCanonicalRef.current = current.canonical;
              // The Reader and Audit accounts describe text that is gone; an
              // Audit Run (#27) refreshes them.
              await runs.clearAnalysis(database, current.id);
            }
          },
          takeRevision: async () => {
            const current = documentRef.current;
            if (current === null) return;
            const revision = await takeRevision(database, current);
            if (revision !== null) await refreshRevisions();
          },
          onError: (error) => {
            onError(describeError(error));
          },
        });

        setStatus("ready");
      } catch (error) {
        if (!cancelled) {
          setOpenError(describeError(error));
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      persistenceRef.current?.dispose();
      persistenceRef.current = null;
      databaseRef.current?.close();
      databaseRef.current = null;
      transportRef.current = null;
    };
  }, [
    databaseRef,
    persistenceRef,
    transportRef,
    documentRef,
    savedCanonicalRef,
    passesRef,
    voiceListRef,
    loadGlobalState,
    enterDocument,
    refreshRevisions,
    refreshFindings,
    runs.clearAnalysis,
    onError,
  ]);

  useEffect(() => {
    if (status !== "ready") return;

    const flush = () => {
      void persistenceRef.current?.flush();
    };
    const onVisibilityChange = () => {
      if (globalThis.document.visibilityState === "hidden") flush();
    };

    window.addEventListener("pagehide", flush);
    globalThis.document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      globalThis.document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [status, persistenceRef]);

  // A pending typing pause must not fire into an unmounted hook.
  useEffect(
    () => () => {
      if (pauseTimerRef.current !== null) window.clearTimeout(pauseTimerRef.current);
    },
    [],
  );

  const handleChange = useCallback(
    (tree: DocTree) => {
      const current = documentRef.current;
      if (current === null) return;
      // A keystroke records the text in the Document of record and restarts the
      // pause; saves, Runs and every other write read `documentRef`, so none of
      // them can see stale prose. Everything that re-renders or re-checks — the
      // shell, the Rail with its Finding rows, the estimates, Finding
      // re-resolution, and the save with its rule Passes — waits until the
      // Writer has stopped typing for `TYPING_PAUSE_MS`. Meanwhile the Editor's
      // Highlights follow the text through ProseMirror's own mapping, so they
      // still track the caret.
      documentRef.current = withTree(current, tree);
      if (pauseTimerRef.current !== null) window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = window.setTimeout(() => {
        pauseTimerRef.current = null;
        const latest = documentRef.current;
        if (latest === null) return;
        setDocumentRecord(latest);
        applyResolution(
          reResolveFindings(findingsRef.current, latest.canonical, (id) =>
            canonicalsRef.current.get(id),
          ),
        );
      }, TYPING_PAUSE_MS);
      persistenceRef.current?.markDirty();
    },
    [documentRef, setDocumentRecord, applyResolution, findingsRef, canonicalsRef, persistenceRef],
  );

  const flagMilestone = useCallback(
    async (note: string) => {
      const database = databaseRef.current;
      if (database === null) return;

      await persistenceRef.current?.flush();
      const current = documentRef.current;
      if (current === null) return;

      const trimmed = note.trim();
      const revision = await takeRevision(database, current, {
        flagged: true,
        note: trimmed === "" ? null : trimmed,
      });
      if (revision !== null) await refreshRevisions();
    },
    [databaseRef, persistenceRef, documentRef, refreshRevisions],
  );

  const importFromMarkdown = useCallback(
    async (markdown: string) => {
      const database = databaseRef.current;
      if (database === null) return;

      // Save what is on screen, then take a Revision of it: replacing the
      // prose wholesale must not destroy the Writer's previous text.
      await persistenceRef.current?.flush();
      const current = documentRef.current;
      if (current === null) return;
      await takeRevision(database, current);

      // `importDocument` replaces the prose and clears the old Findings and
      // Reader accounts in one transaction, so neither outlives the text it
      // pointed at.
      const updated = await importDocument(database, current, markdown);
      documentRef.current = updated;
      savedCanonicalRef.current = updated.canonical;
      setDocumentRecord(updated);
      runs.resetAnalysis();

      await runRulePasses(database, updated, {
        passes: passesRef.current,
        voiceList: voiceListRef.current,
      });
      await refreshFindings(updated);
      await refreshRevisions();
    },
    [
      databaseRef,
      persistenceRef,
      documentRef,
      savedCanonicalRef,
      setDocumentRecord,
      runs.resetAnalysis,
      passesRef,
      voiceListRef,
      refreshFindings,
      refreshRevisions,
    ],
  );

  const exportToMarkdown = useCallback(() => {
    const current = documentRef.current;
    return current === null ? "" : exportDocument(current);
  }, [documentRef]);

  /**
   * Story 20: opens another Document from the Library. The Document being left
   * is flushed and a Revision is taken for it first — its prose and its pending
   * Revision must not fire after the switch against the Document that replaced
   * it — then the new Document's own analysis replaces the old view.
   */
  const openDocument = useCallback(
    async (documentId: string) => {
      const database = databaseRef.current;
      if (database === null) return;
      if (documentRef.current?.id === documentId) return;

      await persistenceRef.current?.flush();
      await persistenceRef.current?.takeRevision();

      const opened = await database.documents.get(documentId);
      if (opened === undefined) return;

      await enterDocument(database, opened);
      // The run readouts belonged to the Document just left; a Run that is still
      // in flight will not repopulate them for the new Document (guarded below).
      runs.resetReadouts();
      await readLibrary();
    },
    [databaseRef, documentRef, persistenceRef, enterDocument, runs.resetReadouts, readLibrary],
  );

  /**
   * Story 111: reloads the whole in-memory view from the database after an
   * import replaces every store — the Passes the Writer edited, the
   * Connections, the global settings, and the Document the Library opens into.
   * The import itself is transactional; this only re-reads what it wrote.
   */
  const reloadLibrary = useCallback(
    async (database: ObelusDatabase) => {
      await loadGlobalState(database);
      // The run readouts belonged to the Document the restore replaced.
      runs.resetReadouts();
      const opened = await loadOrCreateDocument(database);
      await enterDocument(database, opened);
      await readLibrary();
    },
    [loadGlobalState, runs.resetReadouts, enterDocument, readLibrary],
  );

  const { backupLibrary, restoreLibrary, exportBundle, importBundle } = useDurability({
    databaseRef,
    persistenceRef,
    documentRef,
    openDocument,
    reloadLibrary,
    onBackedUp: setLastBackedUp,
    onError: setBackupError,
  });

  const clearBackupError = useCallback(() => setBackupError(null), []);

  /**
   * Writes a title, status or tag change and reflects it in the Library. The
   * active Document is patched in memory and persisted whole, because it may
   * hold unsaved prose: re-reading the stored record would put stale prose back,
   * and a concurrent debounced save would otherwise restore the old metadata. A
   * Document open only in the Library is patched straight in storage.
   */
  const applyDocumentMetadata = useCallback(
    async (documentId: string, patch: DocumentMetadataPatch) => {
      const database = databaseRef.current;
      if (database === null) return;
      try {
        if (documentRef.current?.id === documentId) {
          const updated = applyMetadataPatch(documentRef.current, patch);
          documentRef.current = updated;
          setDocumentRecord(updated);
          await persistDocument(database, updated);
        } else {
          const updated = await updateDocumentMetadata(database, documentId, patch);
          if (updated === null) return;
        }
        await readLibrary();
      } catch (error) {
        onError(describeError(error));
      }
    },
    [databaseRef, documentRef, setDocumentRecord, readLibrary, onError],
  );

  /** Story 20: give a Document a name of the Writer's choosing. */
  const renameDocument = useCallback(
    (documentId: string, title: string) => applyDocumentMetadata(documentId, { title }),
    [applyDocumentMetadata],
  );

  /** Story 23: move a Document between draft, revising and done. */
  const setDocumentStatus = useCallback(
    (documentId: string, status: DocumentStatus) => applyDocumentMetadata(documentId, { status }),
    [applyDocumentMetadata],
  );

  /** Story 22: replace a Document's tags wholesale. */
  const setDocumentTags = useCallback(
    (documentId: string, tags: string[]) => applyDocumentMetadata(documentId, { tags }),
    [applyDocumentMetadata],
  );

  /** Creates a new empty Document and opens it, ready to write. */
  const createDocument = useCallback(async () => {
    const database = databaseRef.current;
    if (database === null) return;
    await persistenceRef.current?.flush();
    const created = await createLibraryDocument(database);
    // `openDocument` reads the Library list once the new Document is entered.
    await openDocument(created.id);
  }, [databaseRef, persistenceRef, openDocument]);

  return {
    status,
    openError,
    storageNotice,
    dismissStorageNotice,
    library,
    refreshLibrary,
    openDocument,
    createDocument,
    renameDocument,
    setDocumentStatus,
    setDocumentTags,
    importFromMarkdown,
    exportToMarkdown,
    handleChange,
    flagMilestone,
    backupLibrary,
    restoreLibrary,
    exportBundle,
    importBundle,
    lastBackedUp,
    backupError,
    clearBackupError,
  };
}
