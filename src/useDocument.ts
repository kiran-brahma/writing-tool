import { useCallback, useEffect, useRef, useState } from "react";
import { resolveAnchor } from "./core/anchor";
import type { DocTree } from "./core/docTree";
import type { Finding, Interval } from "./core/finding";
import { STARTER_PASSES } from "./core/starterPasses";
import { createPersistence, type PersistenceController } from "./editor/persistence";
import { loadOrCreateDocument, persistDocument, withTree } from "./storage/documents";
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
  /** Canonical intervals of attached Findings, for the Editor to draw. */
  highlights: Interval[];
  handleChange: (tree: DocTree) => void;
  flagMilestone: (note: string) => Promise<void>;
}

/**
 * Owns the Document of record: opening the database, the persistence
 * controller, the Revision list and the milestone action. It is deliberately
 * separate from layout so the Document has one explicit state boundary and the
 * ref is reserved for callbacks that must read the latest value synchronously
 * (a `pagehide` save must not wait for a re-render).
 */
export function useDocument(): DocumentHandle {
  const databaseRef = useRef<ObelusDatabase | null>(null);
  const documentRef = useRef<DocumentRecord | null>(null);
  const persistenceRef = useRef<PersistenceController | null>(null);

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
   * saw; the Editor only projects and draws it.
   */
  const applyFindings = useCallback((run: Finding[], canonical: string) => {
    setFindings(run);
    setHighlights(
      run
        .map((finding) => resolveAnchor(finding.anchor, canonical))
        .filter((interval): interval is Interval => interval !== null),
    );
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
  };
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
