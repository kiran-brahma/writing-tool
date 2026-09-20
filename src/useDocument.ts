import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reResolveFindings, type FindingResolution } from "./core/anchor";
import type { RunReport, RunResult } from "./core/critique";
import type { DocTree } from "./core/docTree";
import { type DeclineReason, type Finding, type Interval } from "./core/finding";
import {
  judge as judgeCore,
  sameModelWarning as sameModelWarningFor,
  type JudgeResult,
} from "./core/judge";
import { structuralPasses, type Pass, type PassScope, type RuleConfig } from "./core/pass";
import { targetForPass } from "./core/passContext";
import { STARTER_PASSES } from "./core/starterPasses";
import { describeError } from "./errors";
import { createPersistence, type PersistenceController } from "./editor/persistence";
import {
  assignSlot as assignSlotRecord,
  defaultJudgeConnection,
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
import {
  declineFinding,
  markFindingAddressed,
  resolveDocumentFindings,
} from "./storage/findings";
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
import { listRunResponses, runModelPass as runModelPassRecord } from "./storage/modelRuns";
import { loadScreeningFrame, saveScreeningFrame } from "./storage/settings";
import { createCustomConnection, type Connection } from "./wire/connection";
import { createFetchTransport, type Transport } from "./wire/transport";

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
  /** The top-level block the Writer's cursor is in, the paragraph-scope Target. */
  targetBlockIndex: number;
  setTargetBlockIndex: (index: number) => void;
  /** The Pass currently running, or null. */
  runningPassId: string | null;
  /** True while the structural set is working through its document-scope Passes. */
  structuralRunning: boolean;
  /** When the running Pass started, for the elapsed timer. */
  runStartedAt: number | null;
  /** A model Run's failure, surfaced verbatim rather than swallowed. */
  runError: string | null;
  /** The most recent Run's reported Containment count and drift, per Pass. */
  lastRunReport: RunReport | null;
  /** Story 36: run one model Pass on demand against the current Target. */
  runModelPass: (passId: string) => Promise<RunResult | null>;
  /** Story 37: run every enabled document-scope Pass in one action. */
  runStructuralSet: () => Promise<void>;
  /** Stories 76, 77: the Critic's Screening frame, a settable global toggle. */
  screeningFrame: boolean;
  setScreeningFrame: (enabled: boolean) => Promise<void>;
  /** Story 73: every model Run's raw response, keyed by Pass id. */
  rawResponses: Record<string, string>;
  /** The Judge's answer for the comparison the Writer ran, or null. */
  judgeResult: JudgeResult | null;
  /** A Judge run's failure, surfaced verbatim rather than swallowed. */
  judgeError: string | null;
  /** True while the swapped double call is in flight. */
  judgeRunning: boolean;
  /** Story 78: compare two extracted passages and receive a Verdict. */
  runJudge: (before: string, after: string) => Promise<JudgeResult | null>;
  /** The Connection in the critic Slot, or null. */
  criticConnection: Connection | null;
  /** The Connection in the judge Slot, or null. */
  judgeConnection: Connection | null;
  /** True when no judge Connection is assigned and the default is in use. */
  judgeIsDefault: boolean;
  /** Stories 15, 90: a soft warning when the Critic and the Judge share a model. */
  sameModelWarning: string | null;
  handleChange: (tree: DocTree) => void;
  flagMilestone: (note: string) => Promise<void>;
  /** Writes a status, returning whether it was stored. Failures surface in `saveError`. */
  markAddressed: (findingId: string) => Promise<boolean>;
  /** Stories 64 and 72: decline a Finding, recording why — `advice` or `violation`. */
  decline: (findingId: string, reason?: DeclineReason) => Promise<boolean>;
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
  /** Canonical strings of the provenance Revisions the stored Findings name. */
  const canonicalsRef = useRef<Map<string, string>>(new Map());
  const passesRef = useRef<Pass[]>(STARTER_PASSES);
  const transportRef = useRef<Transport | null>(null);

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
  const [targetBlockIndex, setTargetBlockIndex] = useState(0);
  const [runningPassId, setRunningPassId] = useState<string | null>(null);
  const [structuralRunning, setStructuralRunning] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRunReport, setLastRunReport] = useState<DocumentHandle["lastRunReport"]>(null);
  const [screeningFrame, setScreeningFrameState] = useState(true);
  const [rawResponses, setRawResponses] = useState<Record<string, string>>({});
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [judgeRunning, setJudgeRunning] = useState(false);

  /**
   * The Findings and the intervals the Editor should draw. Resolution happened
   * in Core against the canonical string the Run saw; the Editor only projects
   * and draws the intervals. A Finding that has left the queue — addressed or
   * declined — draws no Highlight, so the prose shows what still needs work
   * rather than a growing residue.
   */
  const applyResolution = useCallback((resolution: FindingResolution) => {
    findingsRef.current = resolution.findings;
    setFindings(resolution.findings);
    setHighlights(resolution.intervals);
  }, []);

  /**
   * Re-resolves the Document's stored Findings against the given canonical
   * string — diff-projecting each from its provenance Revision — persists any
   * `anchor.state` change and applies the result. This is the storage-touching
   * path, used on open, on save, after a rule or model Run, and after a status
   * write. `handleChange` re-resolves in memory directly so a Highlight follows
   * the text as the Writer types.
   */
  const refreshFindings = useCallback(
    async (document: DocumentRecord | null = documentRef.current) => {
      const database = databaseRef.current;
      if (database === null || document === null) return;
      const resolution = await resolveDocumentFindings(database, document);
      canonicalsRef.current = resolution.canonicals;
      // A keystroke during the await may have advanced the Document. Apply
      // against the latest text rather than clobbering a newer Highlight with
      // intervals computed for the text that was persisted.
      const latest = documentRef.current ?? document;
      applyResolution(
        latest.canonical === document.canonical
          ? resolution
          : reResolveFindings(resolution.findings, latest.canonical, (id) =>
              resolution.canonicals.get(id),
            ),
      );
    },
    [applyResolution],
  );

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
    await runRulePasses(database, current, { passes: passesRef.current });
    await refreshFindings(current);
    await refreshRevisions();
  }, [refreshFindings, refreshRevisions]);

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
        setScreeningFrameState(await loadScreeningFrame(database));
        setRawResponses(await listRunResponses(database, opened.id));
        // The one seam. The app builds it once; every model Run leaves through it.
        transportRef.current = createFetchTransport();

        persistenceRef.current = createPersistence({
          save: async () => {
            const current = documentRef.current;
            if (current === null) return;
            await persistDocument(database, current);
            setSaveError(null);
            await runRulePasses(database, current, { passes: passesRef.current });
            await refreshFindings(current);
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

        await runRulePasses(database, opened, { passes: loadedPasses });
        await refreshFindings(opened);
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
      transportRef.current = null;
    };
  }, [refreshRevisions, refreshFindings]);

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

  const handleChange = useCallback(
    (tree: DocTree) => {
      const current = documentRef.current;
      if (current === null) return;
      const updated = withTree(current, tree);
      documentRef.current = updated;
      setDocumentRecord(updated);
      // Re-resolve immediately, not only on the save debounce, so the Highlight
      // follows the text as the Writer types. Persistence of `anchor.state`
      // rides the save.
      applyResolution(
        reResolveFindings(findingsRef.current, updated.canonical, (id) =>
          canonicalsRef.current.get(id),
        ),
      );
      persistenceRef.current?.markDirty();
    },
    [applyResolution],
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
        // The status write changed which Findings are open, so re-resolve from
        // storage: a Finding that left the queue drops its Highlight, and an
        // Orphaned one stays put rather than reappearing attached.
        await refreshFindings();
        return true;
      } catch (error) {
        setSaveError(describeError(error));
        return false;
      }
    },
    [refreshFindings],
  );

  const markAddressed = useCallback(
    (findingId: string) => applyStatus(markFindingAddressed, findingId),
    [applyStatus],
  );

  const decline = useCallback(
    (findingId: string, reason: DeclineReason = "advice") =>
      applyStatus((database, id) => declineFinding(database, id, reason), findingId),
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

      await runRulePasses(database, updated, { passes: passesRef.current });
      await refreshFindings(updated);
      await refreshRevisions();
    },
    [refreshFindings, refreshRevisions],
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
        // A rule Pass's Findings are re-derived on every save, so its toggle
        // re-runs the rule engine. A model Pass runs on demand, so its toggle
        // only changes whether Run is live; the queue is left alone.
        if (updated.kind === "rule") await rerunRules();
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

  /** The Connection in the critic Slot, or null when none is assigned. */
  const criticConnection = useMemo(() => {
    const id = slots.critic;
    if (id === null) return null;
    return connections.find((connection) => connection.id === id) ?? null;
  }, [connections, slots]);

  /**
   * The judge Slot's Connection, or the story-90 default: a different
   * Connection from the Critic, so the Judge is independent by default.
   */
  const judgeConnection = useMemo(() => {
    const id = slots.judge;
    if (id !== null) return connections.find((connection) => connection.id === id) ?? null;
    return defaultJudgeConnection(connections, criticConnection);
  }, [connections, slots, criticConnection]);

  /** True when the Judge Connection above is the default rather than an assignment. */
  const judgeIsDefault = slots.judge === null && judgeConnection !== null;

  /**
   * Stories 15 and 90: the Judge defaults to a different model, and a
   * same-model pairing raises this soft warning. It is never a block; the
   * Writer may run the comparison anyway.
   */
  const sameModelWarning = useMemo(
    () => sameModelWarningFor(criticConnection, judgeConnection),
    [criticConnection, judgeConnection],
  );

  const runInFlightRef = useRef(false);
  /** Guards the structural set against a second click before its state renders. */
  const structuralInFlightRef = useRef(false);

  /**
   * Story 36: one model Pass on demand against the Target its scope permits —
   * the cursor's Paragraph for a local Pass, the cursor's Section for a section
   * Pass, the whole Document for a structural Pass. The Run goes out through the
   * one seam and its Findings are persisted alongside the rule Findings. A
   * failure is surfaced as `runError`, never swallowed.
   */
  const runModelPass = useCallback(
    async (passId: string): Promise<RunResult | null> => {
      const database = databaseRef.current;
      const current = documentRef.current;
      const transport = transportRef.current;
      if (database === null || current === null || transport === null) return null;
      if (runInFlightRef.current) return null;

      const pass = passesRef.current.find((entry) => entry.id === passId);
      if (pass === undefined || pass.kind !== "model" || !pass.enabled) return null;
      if (criticConnection === null) {
        setRunError("Assign a Connection to the critic Slot before running a model Pass.");
        return null;
      }
      if (criticConnection.model.trim() === "") {
        setRunError(`Set a model on the ${criticConnection.name} Connection first.`);
        return null;
      }

      const target = targetForPass(pass, current.tree, targetBlockIndex, current.title);
      if (target === null) {
        setRunError(noTargetMessage(pass.scope));
        return null;
      }

      runInFlightRef.current = true;
      setRunError(null);
      setRunningPassId(passId);
      setRunStartedAt(Date.now());
      try {
        const result = await runModelPassRecord(database, current, {
          pass,
          connection: criticConnection,
          transport,
          target,
          screeningFrame,
        });
        await refreshFindings(current);
        setRawResponses(await listRunResponses(database, current.id));
        setLastRunReport({
          passId,
          droppedAnchors: result.droppedAnchors,
          violations: result.violations,
        });
        return result;
      } catch (error) {
        // The Provider's own words, surfaced verbatim; never a silent failure.
        setRunError(describeError(error));
        return null;
      } finally {
        runInFlightRef.current = false;
        setRunningPassId(null);
        setRunStartedAt(null);
      }
    },
    [criticConnection, refreshFindings, screeningFrame, targetBlockIndex],
  );

  /**
   * Story 37: the structural set in one action. It runs every enabled
   * document-scope model Pass, one after another, so the Writer does not have
   * to trigger them by hand. A failure stops the set — `runModelPass` has
   * already surfaced it — rather than spending more requests on a Connection
   * that just refused one.
   */
  const runStructuralSet = useCallback(async (): Promise<void> => {
    if (structuralInFlightRef.current) return;
    const structural = structuralPasses(passesRef.current);
    if (structural.length === 0) {
      setRunError("Enable a structural Pass before running the structural set.");
      return;
    }

    structuralInFlightRef.current = true;
    setStructuralRunning(true);
    try {
      for (const pass of structural) {
        const result = await runModelPass(pass.id);
        if (result === null) return;
      }
    } finally {
      structuralInFlightRef.current = false;
      setStructuralRunning(false);
    }
  }, [runModelPass]);

  /**
   * Story 78: the Judge end to end. The Writer has already seen both extracted
   * passages; this sends them, twice with the labels swapped, and stores the
   * Verdict. A failure is surfaced as `judgeError`, never swallowed.
   */
  const runJudge = useCallback(
    async (before: string, after: string): Promise<JudgeResult | null> => {
      const transport = transportRef.current;
      if (transport === null) return null;
      if (judgeConnection === null) {
        setJudgeError("Assign a Connection to the Judge Slot before running the Judge.");
        return null;
      }
      if (judgeConnection.model.trim() === "") {
        setJudgeError(`Set a model on the ${judgeConnection.name} Connection first.`);
        return null;
      }
      if (before.trim() === "" || after.trim() === "") {
        setJudgeError("Both versions must contain some text before the Judge can compare them.");
        return null;
      }

      setJudgeRunning(true);
      setJudgeError(null);
      setJudgeResult(null);
      try {
        const result = await judgeCore(before, after, judgeConnection, { transport });
        setJudgeResult(result);
        return result;
      } catch (error) {
        // The Provider's own words, surfaced verbatim; never a silent failure.
        setJudgeError(describeError(error));
        return null;
      } finally {
        setJudgeRunning(false);
      }
    },
    [judgeConnection],
  );

  /** Stories 76, 77: the Screening frame, a settable global toggle. */
  const setScreeningFrame = useCallback(async (enabled: boolean) => {
    const database = databaseRef.current;
    if (database === null) return;
    try {
      setScreeningFrameState(await saveScreeningFrame(database, enabled));
    } catch (error) {
      setSaveError(describeError(error));
    }
  }, []);

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
    targetBlockIndex,
    setTargetBlockIndex,
    runningPassId,
    structuralRunning,
    runStartedAt,
    runError,
    lastRunReport,
    runModelPass,
    runStructuralSet,
    screeningFrame,
    setScreeningFrame,
    rawResponses,
    judgeResult,
    judgeError,
    judgeRunning,
    runJudge,
    criticConnection,
    judgeConnection,
    judgeIsDefault,
    sameModelWarning,
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

/** Why no Target could be built for a Pass of this scope. */
function noTargetMessage(scope: PassScope): string {
  switch (scope) {
    case "paragraph":
      return "Add a paragraph before running a local Pass.";
    case "section":
      return "Put the cursor inside a Section before running a Section Pass.";
    case "document":
      return "Add some text before running a structural Pass.";
  }
}

/** Replace one Connection in the list, or append it if it is new. */
function replaceConnection(current: Connection[], connection: Connection): Connection[] {
  const exists = current.some((entry) => entry.id === connection.id);
  return exists
    ? current.map((entry) => (entry.id === connection.id ? connection : entry))
    : [...current, connection];
}
