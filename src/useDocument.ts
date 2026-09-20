import { useCallback, useEffect, useRef, useState } from "react";
import { resolveAnchor } from "./core/anchor";
import type { DocTree } from "./core/docTree";
import { isOpenFinding, type Finding, type Interval } from "./core/finding";
import type { Pass, RuleConfig } from "./core/pass";
import { STARTER_PASSES } from "./core/starterPasses";
import { describeError } from "./errors";
import { createPersistence, type PersistenceController } from "./editor/persistence";
import {
  assignSlot as assignSlotRecord,
  loadOrCreateConnections,
  loadSlots,
  removeConnection as removeConnectionRecord,
  saveConnection as saveConnectionRecord,
  type Slot,
  type SlotAssignment,
} from "./storage/connections";
import {
  exportDocument,
  importDocument,
  loadOrCreateDocument,
  persistDocument,
  withTree,
} from "./storage/documents";
import { declineFinding, markFindingAddressed } from "./storage/findings";
import {
  openObelusDatabase,
  type DocumentRecord,
  type ObelusDatabase,
  type RevisionRecord,
} from "./storage/obelusDatabase";
import {
  loadOrCreatePasses,
  setPassEnabled as setStoredPassEnabled,
  updateRuleConfig,
} from "./storage/passes";
import { listRevisions, takeRevision } from "./storage/revisions";
import { runRulePasses } from "./storage/ruleRuns";
import { createCustomConnection, type Connection } from "./wire/connection";

export interface DocumentHandle {
  status: "loading" | "ready" | "error";
  openError: string;
  saveError: string | null;
  document: DocumentRecord | null;
  revisions: RevisionRecord[];
  findings: Finding[];
  /** The Pass set: the Starter pack as edited by the Writer. */
  passes: Pass[];
  /** Canonical intervals of open Findings, for the Editor to draw. */
  highlights: Interval[];
  handleChange: (tree: DocTree) => void;
  flagMilestone: (note: string) => Promise<void>;
  /** Writes a status, returning whether it was stored. Failures surface in `saveError`. */
  markAddressed: (findingId: string) => Promise<boolean>;
  decline: (findingId: string) => Promise<boolean>;
  /** Story 35: turn one rule Pass on or off, then re-run the rules. */
  togglePass: (passId: string, enabled: boolean) => Promise<void>;
  /** Story 34: replace a rule Pass's word lists and patterns, then re-run. */
  saveRuleConfig: (passId: string, ruleConfig: RuleConfig) => Promise<void>;
  /** Story 2–7: the Writer's Connections, with prefills seeded. */
  connections: Connection[];
  /** Story 14: which Connection is the Critic and which the Judge. */
  slots: SlotAssignment;
  saveConnection: (connection: Connection) => Promise<void>;
  addCustomConnection: () => Promise<void>;
  removeConnection: (connectionId: string) => Promise<void>;
  assignSlot: (slot: Slot, connectionId: string | null) => Promise<void>;
  importFromMarkdown: (markdown: string) => Promise<void>;
  exportToMarkdown: () => string;
}

/**
 * Owns the Document of record: opening the database, the persistence
 * controller, the Revision list, the milestone action, the Finding queue's
 * status writes and Markdown import/export. It is deliberately separate from
 * layout so the Document has one explicit state boundary and the ref is
 * reserved for callbacks that must read the latest value synchronously (a
 * `pagehide` save must not wait for a re-render).
 */
export function useDocument(): DocumentHandle {
  const databaseRef = useRef<ObelusDatabase | null>(null);
  const documentRef = useRef<DocumentRecord | null>(null);
  const persistenceRef = useRef<PersistenceController | null>(null);
  const findingsRef = useRef<Finding[]>([]);
  const canonicalRef = useRef("");
  const passesRef = useRef<Pass[]>(STARTER_PASSES);

  const [status, setStatus] = useState<DocumentHandle["status"]>("loading");
  const [openError, setOpenError] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [documentRecord, setDocumentRecord] = useState<DocumentRecord | null>(null);
  const [revisions, setRevisions] = useState<RevisionRecord[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [passes, setPasses] = useState<Pass[]>(STARTER_PASSES);
  const [highlights, setHighlights] = useState<Interval[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [slots, setSlots] = useState<SlotAssignment>({ critic: null, judge: null });

  /**
   * The Findings and the intervals the Editor should draw. The interval is
   * resolved here, in Core-adjacent code, against the canonical string the Run
   * saw; the Editor only projects and draws it. A Finding that has left the
   * queue — addressed or declined — draws no Highlight, so the prose shows what
   * still needs work rather than a growing residue.
   */
  const applyFindings = useCallback((run: Finding[], canonical: string) => {
    findingsRef.current = run;
    canonicalRef.current = canonical;
    setFindings(run);
    setHighlights(intervalsForOpen(run, canonical));
  }, []);

  /** Replaces one Pass in the loaded set after a persisted edit. */
  const applyPass = useCallback((updated: Pass) => {
    const next = passesRef.current.map((pass) => (pass.id === updated.id ? updated : pass));
    passesRef.current = next;
    setPasses(next);
  }, []);

  const refreshRevisions = useCallback(async () => {
    const database = databaseRef.current;
    const current = documentRef.current;
    if (database === null || current === null) return;
    setRevisions(await listRevisions(database, current.id));
  }, []);

  /** Re-runs the enabled rule Passes against the current Document. */
  const rerunRules = useCallback(async () => {
    const database = databaseRef.current;
    const current = documentRef.current;
    if (database === null || current === null) return;
    const run = await runRulePasses(database, current, { passes: passesRef.current });
    applyFindings(run, current.canonical);
    await refreshRevisions();
  }, [applyFindings, refreshRevisions]);

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
        documentRef.current = opened;
        setDocumentRecord(opened);

        const loadedPasses = await loadOrCreatePasses(database);
        passesRef.current = loadedPasses;
        setPasses(loadedPasses);

        setConnections(await loadOrCreateConnections(database));
        setSlots(await loadSlots(database));

        persistenceRef.current = createPersistence({
          save: async () => {
            const current = documentRef.current;
            if (current === null) return;
            await persistDocument(database, current);
            setSaveError(null);
            const run = await runRulePasses(database, current, { passes: passesRef.current });
            applyFindings(run, current.canonical);
            await refreshRevisions();
          },
          takeRevision: async () => {
            const current = documentRef.current;
            if (current === null) return;
            const revision = await takeRevision(database, current);
            if (revision !== null) await refreshRevisions();
          },
          onError: (error) => {
            setSaveError(describeError(error));
          },
        });

        const run = await runRulePasses(database, opened, { passes: loadedPasses });
        applyFindings(run, opened.canonical);
        await refreshRevisions();
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
    };
  }, [refreshRevisions, applyFindings]);

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
  }, [status]);

  const handleChange = useCallback((tree: DocTree) => {
    const current = documentRef.current;
    if (current === null) return;
    const updated = withTree(current, tree);
    documentRef.current = updated;
    setDocumentRecord(updated);
    persistenceRef.current?.markDirty();
  }, []);

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
    [refreshRevisions],
  );

  /**
   * Writes a status through storage, then reflects it in the queue and
   * Highlights. A failure is surfaced like any other save failure rather than
   * swallowed, and `false` tells the caller not to advance the selection.
   */
  const applyStatus = useCallback(
    async (
      write: (database: ObelusDatabase, findingId: string) => Promise<Finding | null>,
      findingId: string,
    ): Promise<boolean> => {
      const database = databaseRef.current;
      if (database === null) return false;

      try {
        const updated = await write(database, findingId);
        if (updated === null) return false;
        applyFindings(
          findingsRef.current.map((finding) => (finding.id === findingId ? updated : finding)),
          canonicalRef.current,
        );
        return true;
      } catch (error) {
        setSaveError(describeError(error));
        return false;
      }
    },
    [applyFindings],
  );

  const markAddressed = useCallback(
    (findingId: string) => applyStatus(markFindingAddressed, findingId),
    [applyStatus],
  );

  const decline = useCallback(
    (findingId: string) =>
      applyStatus((database, id) => declineFinding(database, id, "advice"), findingId),
    [applyStatus],
  );

  const importFromMarkdown = useCallback(
    async (markdown: string) => {
      const database = databaseRef.current;
      if (database === null) return;

      // Save what is on screen, then snapshot it as a Revision: replacing the
      // prose wholesale must not destroy the Writer's previous text.
      await persistenceRef.current?.flush();
      const current = documentRef.current;
      if (current === null) return;
      await takeRevision(database, current);

      // `importDocument` replaces the prose and clears the old Findings in one
      // transaction, so the queue never outlives the text it pointed at.
      const updated = await importDocument(database, current, markdown);
      documentRef.current = updated;
      setDocumentRecord(updated);

      const run = await runRulePasses(database, updated, { passes: passesRef.current });
      applyFindings(run, updated.canonical);
      await refreshRevisions();
    },
    [applyFindings, refreshRevisions],
  );

  const exportToMarkdown = useCallback(() => {
    const current = documentRef.current;
    return current === null ? "" : exportDocument(current);
  }, []);

  const togglePass = useCallback(
    async (passId: string, enabled: boolean) => {
      const database = databaseRef.current;
      if (database === null) return;
      try {
        const updated = await setStoredPassEnabled(database, passId, enabled);
        if (updated === null) return;
        applyPass(updated);
        await rerunRules();
      } catch (error) {
        setSaveError(describeError(error));
      }
    },
    [applyPass, rerunRules],
  );

  const saveRuleConfig = useCallback(
    async (passId: string, ruleConfig: RuleConfig) => {
      const database = databaseRef.current;
      if (database === null) return;
      try {
        const updated = await updateRuleConfig(database, passId, ruleConfig);
        if (updated === null) return;
        applyPass(updated);
        await rerunRules();
      } catch (error) {
        setSaveError(describeError(error));
      }
    },
    [applyPass, rerunRules],
  );

  const saveConnection = useCallback(async (connection: Connection) => {
    const database = databaseRef.current;
    if (database === null) return;
    try {
      await saveConnectionRecord(database, connection);
      setConnections((current) => replaceConnection(current, connection));
    } catch (error) {
      setSaveError(describeError(error));
    }
  }, []);

  const addCustomConnection = useCallback(async () => {
    const database = databaseRef.current;
    if (database === null) return;
    const connection = createCustomConnection(crypto.randomUUID());
    try {
      await saveConnectionRecord(database, connection);
      setConnections((current) => [...current, connection]);
    } catch (error) {
      setSaveError(describeError(error));
    }
  }, []);

  const removeConnection = useCallback(async (connectionId: string) => {
    const database = databaseRef.current;
    if (database === null) return;
    try {
      const removed = await removeConnectionRecord(database, connectionId);
      if (!removed) return;
      setConnections((current) => current.filter((connection) => connection.id !== connectionId));
      setSlots(await loadSlots(database));
    } catch (error) {
      setSaveError(describeError(error));
    }
  }, []);

  const assignSlot = useCallback(async (slot: Slot, connectionId: string | null) => {
    const database = databaseRef.current;
    if (database === null) return;
    try {
      setSlots(await assignSlotRecord(database, slot, connectionId));
    } catch (error) {
      setSaveError(describeError(error));
    }
  }, []);

  return {
    status,
    openError,
    saveError,
    document: documentRecord,
    revisions,
    findings,
    passes,
    highlights,
    handleChange,
    flagMilestone,
    markAddressed,
    decline,
    togglePass,
    saveRuleConfig,
    connections,
    slots,
    saveConnection,
    addCustomConnection,
    removeConnection,
    assignSlot,
    importFromMarkdown,
    exportToMarkdown,
  };
}

/** Replace one Connection in the list, or append it if it is new. */
function replaceConnection(current: Connection[], connection: Connection): Connection[] {
  const exists = current.some((entry) => entry.id === connection.id);
  return exists
    ? current.map((entry) => (entry.id === connection.id ? connection : entry))
    : [...current, connection];
}

/** The canonical intervals of the Findings still open, for the Editor to draw. */
function intervalsForOpen(findings: Finding[], canonical: string): Interval[] {
  return findings
    .filter(isOpenFinding)
    .map((finding) => resolveAnchor(finding.anchor, canonical))
    .filter((interval): interval is Interval => interval !== null);
}
