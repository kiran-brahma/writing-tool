import { useCallback, useEffect, useRef, useState } from "react";
import { resolveAnchor } from "./core/anchor";
import type { DocTree } from "./core/docTree";
import { isOpenFinding, type Finding, type Interval } from "./core/finding";
import { STARTER_PASSES } from "./core/starterPasses";
import { describeError } from "./errors";
import { createPersistence, type PersistenceController } from "./editor/persistence";
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
import { listRevisions, takeRevision } from "./storage/revisions";
import { runRulePasses } from "./storage/ruleRuns";

export interface DocumentHandle {
  status: "loading" | "ready" | "error";
  openError: string;
  saveError: string | null;
  document: DocumentRecord | null;
  revisions: RevisionRecord[];
  findings: Finding[];
  /** Canonical intervals of open Findings, for the Editor to draw. */
  highlights: Interval[];
  handleChange: (tree: DocTree) => void;
  flagMilestone: (note: string) => Promise<void>;
  /** Writes a status, returning whether it was stored. Failures surface in `saveError`. */
  markAddressed: (findingId: string) => Promise<boolean>;
  decline: (findingId: string) => Promise<boolean>;
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

  const [status, setStatus] = useState<DocumentHandle["status"]>("loading");
  const [openError, setOpenError] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [documentRecord, setDocumentRecord] = useState<DocumentRecord | null>(null);
  const [revisions, setRevisions] = useState<RevisionRecord[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [highlights, setHighlights] = useState<Interval[]>([]);

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

  const refreshRevisions = useCallback(async () => {
    const database = databaseRef.current;
    const current = documentRef.current;
    if (database === null || current === null) return;
    setRevisions(await listRevisions(database, current.id));
  }, []);

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

        persistenceRef.current = createPersistence({
          save: async () => {
            const current = documentRef.current;
            if (current === null) return;
            await persistDocument(database, current);
            setSaveError(null);
            const run = await runRulePasses(database, current, { passes: STARTER_PASSES });
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

        const run = await runRulePasses(database, opened, { passes: STARTER_PASSES });
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

      const run = await runRulePasses(database, updated, { passes: STARTER_PASSES });
      applyFindings(run, updated.canonical);
      await refreshRevisions();
    },
    [applyFindings, refreshRevisions],
  );

  const exportToMarkdown = useCallback(() => {
    const current = documentRef.current;
    return current === null ? "" : exportDocument(current);
  }, []);

  return {
    status,
    openError,
    saveError,
    document: documentRecord,
    revisions,
    findings,
    highlights,
    handleChange,
    flagMilestone,
    markAddressed,
    decline,
    importFromMarkdown,
    exportToMarkdown,
  };
}

/** The canonical intervals of the Findings still open, for the Editor to draw. */
function intervalsForOpen(findings: Finding[], canonical: string): Interval[] {
  return findings
    .filter(isOpenFinding)
    .map((finding) => resolveAnchor(finding.anchor, canonical))
    .filter((interval): interval is Interval => interval !== null);
}
