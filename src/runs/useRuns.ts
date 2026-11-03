import { useCallback, useRef, useState, type RefObject } from "react";
import { DEFAULT_CHARACTER_LIMIT } from "../core/chunking";
import type { RunResult } from "../core/critique";
import { judge as judgeCore, type JudgeResult } from "../core/judge";
import type { Pass } from "../core/pass";
import { targetForPass } from "../core/passContext";
import { describeError } from "../errors";
import type { DocumentRecord, ObelusDatabase } from "../storage/obelusDatabase";
import { runModelPass as runModelPassRecord } from "../storage/modelRuns";
import type { Connection } from "../wire/connection";
import { isCancelledError, type Transport } from "../wire/transport";

export interface RunsOptions {
  databaseRef: RefObject<ObelusDatabase | null>;
  documentRef: RefObject<DocumentRecord | null>;
  transportRef: RefObject<Transport | null>;
  passesRef: RefObject<Pass[]>;
  targetBlockIndex: number;
  criticConnection: Connection | null;
  judgeConnection: Connection | null;
  refreshFindings: (document?: DocumentRecord | null) => Promise<void>;
}

/**
 * The two Run kinds that remain: one model Pass on demand, and the Judge. The
 * Audit, Reader, structural set, cost estimates, raw-response view and
 * prompt-authoring assistant are gone.
 */
export interface RunsHandle {
  runningPassId: string | null;
  runStartedAt: number | null;
  runError: string | null;
  cancelRun: () => void;
  runModelPass: (passId: string) => Promise<RunResult | null>;
  judgeResult: JudgeResult | null;
  judgeError: string | null;
  judgeRunning: boolean;
  runJudge: (before: string, after: string) => Promise<JudgeResult | null>;
  /** Clears the Run readouts when the Writer switches Document. */
  resetReadouts: () => void;
  /**
   * The document lifecycle still calls these three so an old library's
   * analysis rows are left alone. They intentionally do nothing: the tables
   * remain in the schema, but nothing reads or writes them.
   */
  loadAnalysis: (database: ObelusDatabase, document: DocumentRecord) => Promise<void>;
  clearAnalysis: (database: ObelusDatabase, documentId: string) => Promise<void>;
  resetAnalysis: () => void;
  loadPriceTable: (database: ObelusDatabase) => Promise<void>;
}

export function useRuns(options: RunsOptions): RunsHandle {
  const {
    databaseRef,
    documentRef,
    transportRef,
    passesRef,
    targetBlockIndex,
    criticConnection,
    judgeConnection,
    refreshFindings,
  } = options;

  const [runningPassId, setRunningPassId] = useState<string | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [judgeRunning, setJudgeRunning] = useState(false);

  const runInFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runModelPass = useCallback(
    async (passId: string): Promise<RunResult | null> => {
      const database = databaseRef.current;
      const current = documentRef.current;
      const transport = transportRef.current;
      if (database === null || current === null || transport === null) return null;
      if (runInFlightRef.current) return null;

      const pass = passesRef.current.find((entry) => entry.id === passId);
      if (pass === undefined || pass.kind !== "model" || !pass.enabled) return null;
      if (!hasCritic(criticConnection)) {
        setRunError(criticGuardMessage(criticConnection, "a model Pass"));
        return null;
      }

      const target = targetForPass(pass, current.tree, targetBlockIndex, current.title);
      if (target === null) {
        setRunError(noTargetMessage());
        return null;
      }

      runInFlightRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      setRunError(null);
      setRunningPassId(passId);
      setRunStartedAt(Date.now());
      try {
        const result = await runModelPassRecord(database, current, {
          pass,
          connection: criticConnection,
          transport,
          target,
          screeningFrame: true,
          characterLimit: DEFAULT_CHARACTER_LIMIT,
          signal: controller.signal,
        });
        if (documentRef.current?.id === current.id) {
          await refreshFindings(current);
        }
        return result;
      } catch (error) {
        setRunError(isCancelledError(error) ? "Run cancelled." : describeError(error));
        return null;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        runInFlightRef.current = false;
        setRunningPassId(null);
        setRunStartedAt(null);
      }
    },
    [
      databaseRef,
      documentRef,
      transportRef,
      passesRef,
      criticConnection,
      targetBlockIndex,
      refreshFindings,
    ],
  );

  const runJudge = useCallback(
    async (before: string, after: string): Promise<JudgeResult | null> => {
      const transport = transportRef.current;
      if (transport === null) return null;
      if (judgeConnection === null) {
        setJudgeError("Assign a Connection to the Judge Slot before running the Judge.");
        return null;
      }
      if (judgeConnection.model.trim() === "") {
        setJudgeError("Set a model on the Judge Slot in Settings first.");
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
        setJudgeError(describeError(error));
        return null;
      } finally {
        setJudgeRunning(false);
      }
    },
    [judgeConnection, transportRef],
  );

  const resetReadouts = useCallback(() => {
    setRunError(null);
    setJudgeResult(null);
    setJudgeError(null);
  }, []);

  const loadAnalysis = useCallback(async () => {}, []);
  const clearAnalysis = useCallback(async () => {}, []);
  const resetAnalysis = useCallback(() => {}, []);
  const loadPriceTable = useCallback(async () => {}, []);

  return {
    runningPassId,
    runStartedAt,
    runError,
    cancelRun,
    runModelPass,
    judgeResult,
    judgeError,
    judgeRunning,
    runJudge,
    resetReadouts,
    loadAnalysis,
    clearAnalysis,
    resetAnalysis,
    loadPriceTable,
  };
}

function noTargetMessage(): string {
  return "Put the cursor in a paragraph before running Review.";
}

function hasCritic(connection: Connection | null): connection is Connection {
  return connection !== null && connection.model.trim() !== "";
}

function criticGuardMessage(connection: Connection | null, what: string): string {
  if (connection === null) {
    return `Assign a Connection to the critic Slot before running ${what}.`;
  }
  return `Set a model on the Critic Slot in Settings first.`;
}
