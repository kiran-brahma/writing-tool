import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { chunkTarget } from "../core/chunking";
import {
  addRunCost,
  estimateRunCost,
  estimateStructuralCost,
  hasPriceFor,
  type CostEstimate,
  type PriceTable,
  type StructuralCostEstimate,
} from "../core/cost";
import type { RunReport, RunResult } from "../core/critique";
import type { Violation } from "../core/finding";
import {
  judge as judgeCore,
  type JudgeResult,
} from "../core/judge";
import {
  isAuditPass,
  isFindingsPass,
  isReaderPass,
  scopeVocab,
  structuralPasses,
  type Pass,
  type PassScope,
} from "../core/pass";
import { documentContext, targetForPass } from "../core/passContext";
import { promptCharacters } from "../core/prompt";
import {
  assistPassPrompt,
  type PromptAssistantRequest,
  type PromptAssistantResult,
} from "../core/promptAssistant";
import { sections } from "../core/sections";
import { describeError } from "../errors";
import type { PersistenceController } from "../editor/persistence";
import {
  clearAuditAccounts,
  listAuditAccounts,
  runAuditPass as runAuditPassRecord,
} from "../storage/auditAccounts";
import { listRunResponses, runModelPass as runModelPassRecord } from "../storage/modelRuns";
import type {
  AuditAccountRecord,
  DocumentRecord,
  ObelusDatabase,
  ReaderAccountRecord,
} from "../storage/obelusDatabase";
import { loadPriceTable as loadPriceTableRecord, savePriceTable as persistPriceTable } from "../storage/pricing";
import {
  clearReaderAccounts,
  listReaderAccounts,
  runReaderPass as runReaderPassRecord,
} from "../storage/readerAccounts";
import { isCancelledError, type Transport } from "../wire/transport";
import type { Connection } from "../wire/connection";

/** Story 131: the most recent Audit Run's chunk count and drift, for the surface. */
export interface AuditRunReport {
  passId: string;
  chunks: number;
  violations: Violation[];
}

export interface RunsOptions {
  databaseRef: RefObject<ObelusDatabase | null>;
  documentRef: RefObject<DocumentRecord | null>;
  persistenceRef: RefObject<PersistenceController | null>;
  transportRef: RefObject<Transport | null>;
  /** The canonical string last saved or read, for the Reader/Audit freshness rule. */
  savedCanonicalRef: RefObject<string | null>;
  passesRef: RefObject<Pass[]>;
  voiceListRef: RefObject<string[]>;
  /** The current Document, for the estimates and the chunk plan. */
  documentRecord: DocumentRecord | null;
  /** The top-level block the cursor is in, the paragraph-scope Target. */
  targetBlockIndex: number;
  /** The loaded Pass set, for the estimates. */
  passes: Pass[];
  screeningFrame: boolean;
  characterLimit: number;
  criticConnection: Connection | null;
  judgeConnection: Connection | null;
  /** Re-resolve the Document's Findings from storage after a Run. */
  refreshFindings: (document?: DocumentRecord | null) => Promise<void>;
  /** Surfaces a write failure; never a silent failure. */
  onError: (message: string) => void;
}

/**
 * The five kinds of Run — a model Findings Pass, the structural set, the Reader
 * pass, the Audit pass and the Judge — plus the prompt assistant and the cost
 * estimates. This owns the in-flight flags, the per-Run errors and results, and
 * the Reader and Audit accounts, which are document-scoped results loaded and
 * cleared by the document lifecycle through the `loadAnalysis`, `clearAnalysis`
 * and `resetAnalysis` entry points.
 */
export interface RunsHandle {
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
  /** Story 51: the editable per-model price table behind the estimate. */
  priceTable: PriceTable;
  /** Story 51: the pre-run estimate for each Findings pass, keyed by Pass id. */
  runEstimates: Record<string, CostEstimate>;
  /** Story 51: stores the Writer's edited price table. */
  savePriceTable: (table: PriceTable) => Promise<void>;
  /** Story 52: what this session's model Runs have cost, including cache hits at zero. */
  sessionCost: number;
  /** Story 54: aborts the in-flight Run. An aborted Run stores nothing. */
  cancelRun: () => void;
  /** Story 36: run one model Pass on demand against the current Target. */
  runModelPass: (passId: string) => Promise<RunResult | null>;
  /** Story 37: run every enabled document-scope Pass in one action. */
  runStructuralSet: () => Promise<void>;
  /** Story 50: how many chunks a document-scope Run of the current Document would make. */
  documentChunks: number;
  /** Story 189: the summed cost estimate for the structural set before it is run. */
  structuralEstimate: StructuralCostEstimate;
  /** Story 73: every model Run's raw response, keyed by Pass id. */
  rawResponses: Record<string, string>;
  /** Stories 91–93: the Reader accounts stored for the Document, in Section order. */
  readerAccounts: ReaderAccountRecord[];
  /** True while the Reader pass is reading the Document's Sections. */
  readerRunning: boolean;
  /** When the running Reader pass started, for the elapsed timer. */
  readerStartedAt: number | null;
  /** A Reader run's failure, surfaced verbatim rather than swallowed. */
  readerError: string | null;
  /** Stories 91–93: run the Reader pass over every Section, one call each. */
  runReaderPass: (passId: string) => Promise<void>;
  /** Stories 118–136: the Audit accounts stored for the Document. */
  auditAccounts: AuditAccountRecord[];
  /** True while the Audit pass is reading the Document. */
  auditRunning: boolean;
  /** When the running Audit pass started, for the elapsed timer. */
  auditStartedAt: number | null;
  /** An Audit run's failure, surfaced verbatim rather than swallowed. */
  auditError: string | null;
  /** Story 131: the most recent Audit Run's chunk count and drift, keyed by Pass. */
  auditReport: AuditRunReport | null;
  /** Stories 118–136: run an Audit pass over the whole Document. */
  runAuditPass: (passId: string) => Promise<void>;
  /** The Judge's answer for the comparison the Writer ran, or null. */
  judgeResult: JudgeResult | null;
  /** A Judge run's failure, surfaced verbatim rather than swallowed. */
  judgeError: string | null;
  /** True while the swapped double call is in flight. */
  judgeRunning: boolean;
  /** Story 78: compare two extracted passages and receive a Verdict. */
  runJudge: (before: string, after: string) => Promise<JudgeResult | null>;
  /** Stories 104 and 105: true while the prompt-authoring assistant is in flight. */
  assistantRunning: boolean;
  /** A prompt-assistant failure, surfaced verbatim rather than swallowed. */
  assistantError: string | null;
  /** Story 104: asks the assistant for a Pass prompt draft. */
  runPromptAssistant: (input: PromptAssistantRequest) => Promise<PromptAssistantResult | null>;
  /** Loads the current Document's stored analysis into the view. */
  loadAnalysis: (database: ObelusDatabase, document: DocumentRecord) => Promise<void>;
  /** Clears the stored analysis because the prose changed. */
  clearAnalysis: (database: ObelusDatabase, documentId: string) => Promise<void>;
  /** Clears the analysis in memory, for a Document import that already cleared it. */
  resetAnalysis: () => void;
  /** Clears the Run readouts when the Writer switches Document. */
  resetReadouts: () => void;
  /** Story 51: reads the stored price table. */
  loadPriceTable: (database: ObelusDatabase) => Promise<void>;
}

export function useRuns(options: RunsOptions): RunsHandle {
  const {
    databaseRef,
    documentRef,
    persistenceRef,
    transportRef,
    savedCanonicalRef,
    passesRef,
    voiceListRef,
    documentRecord,
    targetBlockIndex,
    passes,
    screeningFrame,
    characterLimit,
    criticConnection,
    judgeConnection,
    refreshFindings,
    onError,
  } = options;

  const [runningPassId, setRunningPassId] = useState<string | null>(null);
  const [structuralRunning, setStructuralRunning] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRunReport, setLastRunReport] = useState<RunReport | null>(null);
  const [priceTable, setPriceTableState] = useState<PriceTable>({});
  const [sessionCost, setSessionCost] = useState(0);
  const [rawResponses, setRawResponses] = useState<Record<string, string>>({});
  const [readerAccounts, setReaderAccounts] = useState<ReaderAccountRecord[]>([]);
  const [readerRunning, setReaderRunning] = useState(false);
  const [readerStartedAt, setReaderStartedAt] = useState<number | null>(null);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [auditAccounts, setAuditAccounts] = useState<AuditAccountRecord[]>([]);
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditStartedAt, setAuditStartedAt] = useState<number | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditReport, setAuditReport] = useState<AuditRunReport | null>(null);
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [judgeRunning, setJudgeRunning] = useState(false);
  const [assistantRunning, setAssistantRunning] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);

  /** Guards the prompt assistant against a second click before its state renders. */
  const assistantInFlightRef = useRef(false);
  const runInFlightRef = useRef(false);
  /** Story 54: the controller for the in-flight Run, so Cancel can abort it. */
  const abortRef = useRef<AbortController | null>(null);
  /** Guards the structural set against a second click before its state renders. */
  const structuralInFlightRef = useRef(false);
  /** Guards the Reader pass against a second click before its state renders. */
  const readerInFlightRef = useRef(false);
  /** Guards the Audit pass against a second click before its state renders. */
  const auditInFlightRef = useRef(false);

  /**
   * Story 50: the chunk plan for a document-scope Run of the current Document.
   * Computed from the same Target and limit the Run will use, so the panel's
   * warning and the Run's actual chunking cannot disagree.
   */
  const documentChunks = useMemo(() => {
    if (documentRecord === null) return 1;
    // A Document under the limit is never split, so the common case does not
    // pay for building the Target just to count one chunk.
    if (documentRecord.canonical.length <= characterLimit) return 1;
    const target = documentContext(documentRecord.tree, documentRecord.title);
    return target === null ? 1 : chunkTarget(target, characterLimit).length;
  }, [documentRecord, characterLimit]);

  /**
   * Story 51: the prompt size of every enabled Findings Pass, measured against
   * the same Target the Run will use. Both estimates below are derived from this
   * one walk rather than each re-deriving it.
   */
  const passCharacters = useMemo(() => {
    const characters: Record<string, number> = {};
    if (documentRecord === null) return characters;
    for (const pass of passes) {
      if (pass.kind !== "model" || !isFindingsPass(pass)) continue;
      const target = targetForPass(
        pass,
        documentRecord.tree,
        targetBlockIndex,
        documentRecord.title,
      );
      characters[pass.id] =
        target === null
          ? documentRecord.canonical.length
          : promptCharacters(pass.prompt ?? "", target);
    }
    return characters;
  }, [documentRecord, passes, targetBlockIndex]);

  /**
   * Story 51: the pre-run cost estimate for each Findings pass, from the same
   * Target the Run will use. It is shown, never enforced: an unknown model
   * prices at zero and the estimate is still displayed.
   */
  const runEstimates = useMemo(() => {
    const estimates: Record<string, CostEstimate> = {};
    const model = criticConnection?.model ?? "";
    for (const pass of passes) {
      const characters = passCharacters[pass.id];
      if (characters === undefined) continue;
      const chunks = pass.scope === "document" ? documentChunks : 1;
      const base = estimateRunCost(characters, model, priceTable);
      estimates[pass.id] = {
        characters: base.characters * chunks,
        tokens: base.tokens * chunks,
        costUsd: base.costUsd * chunks,
        costKnown: base.costKnown,
      };
    }
    return estimates;
  }, [passes, passCharacters, criticConnection, priceTable, documentChunks]);

  /**
   * Story 189: the summed cost estimate for the structural set before it is
   * run. Sums over exactly the enabled document-scope Passes it will execute,
   * multiplied by the chunk count it will actually use.
   */
  const structuralEstimate = useMemo(() => {
    if (documentRecord === null) {
      return {
        characters: 0,
        tokens: 0,
        costUsd: 0,
        costKnown: hasPriceFor(criticConnection?.model ?? "", priceTable),
        passCount: 0,
        chunks: 1,
      };
    }
    return estimateStructuralCost(
      passes,
      passCharacters,
      criticConnection?.model ?? "",
      priceTable,
      documentChunks,
    );
  }, [documentRecord, passes, passCharacters, criticConnection, priceTable, documentChunks]);

  /** Story 51: stores the Writer's edited price table. */
  const savePriceTable = useCallback(
    async (table: PriceTable) => {
      const database = databaseRef.current;
      if (database === null) return;
      try {
        setPriceTableState(await persistPriceTable(database, table));
      } catch (error) {
        onError(describeError(error));
      }
    },
    [databaseRef, onError],
  );

  /** Story 51: reads the stored price table. */
  const loadPriceTable = useCallback(async (database: ObelusDatabase) => {
    setPriceTableState(await loadPriceTableRecord(database));
  }, []);

  /** Story 54: aborts the in-flight Run; the Run itself stores nothing. */
  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /**
   * Stories 104 and 105: the prompt-authoring assistant. It sends the Writer's
   * request and current Pass prompt through the one seam; no Document, Target
   * or prose is available to hand it, which is what makes the assistance legal
   * under the tool's own rules.
   */
  const runPromptAssistant = useCallback(
    async (input: PromptAssistantRequest): Promise<PromptAssistantResult | null> => {
      const transport = transportRef.current;
      if (transport === null) {
        setAssistantError("Obelus is still opening. Try again in a moment.");
        return null;
      }
      if (assistantInFlightRef.current) return null;
      if (!hasCritic(criticConnection)) {
        setAssistantError(criticGuardMessage(criticConnection, "the prompt assistant"));
        return null;
      }
      assistantInFlightRef.current = true;
      setAssistantRunning(true);
      setAssistantError(null);
      try {
        return await assistPassPrompt(input, criticConnection, { transport });
      } catch (error) {
        // The assistant's own words, surfaced verbatim; never a silent failure.
        setAssistantError(describeError(error));
        return null;
      } finally {
        assistantInFlightRef.current = false;
        setAssistantRunning(false);
      }
    },
    [criticConnection, transportRef],
  );

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
      if (!hasCritic(criticConnection)) {
        setRunError(criticGuardMessage(criticConnection, "a model Pass"));
        return null;
      }

      const target = targetForPass(pass, current.tree, targetBlockIndex, current.title);
      if (target === null) {
        setRunError(noTargetMessage(pass.scope));
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
          screeningFrame,
          characterLimit,
          voiceList: voiceListRef.current,
          signal: controller.signal,
        });
        // Story 52: the session total uses the Provider's usage when there is
        // one and the estimate otherwise; a cache hit adds nothing. The
        // fallback prices the characters the Run actually sent — its Target
        // plus context for a local Pass — not the whole Document.
        setSessionCost((total) =>
          addRunCost(total, result, promptCharacters(pass.prompt ?? "", target), criticConnection.model, priceTable),
        );
        // The Writer may have opened another Document mid-run. The Run belongs
        // to the Document it started against (and its Findings are stored); the
        // new Document's view must not show them.
        if (documentRef.current?.id === current.id) {
          await refreshFindings(current);
          setRawResponses(await listRunResponses(database, current.id));
          setReaderAccounts(await listReaderAccounts(database, current.id));
          setLastRunReport({
            passId,
            droppedAnchors: result.droppedAnchors,
            violations: result.violations,
            chunks: result.chunks,
            fromCache: result.fromCache,
          });
        }
        return result;
      } catch (error) {
        // A cancelled Run reports as cancelled; any other failure is the
        // Provider's own words, surfaced verbatim. Neither is swallowed.
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
      voiceListRef,
      criticConnection,
      targetBlockIndex,
      screeningFrame,
      characterLimit,
      refreshFindings,
      priceTable,
    ],
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
  }, [runModelPass, passesRef]);

  /**
   * Stories 91–93: the Reader pass end to end. Unlike a Findings pass, which
   * reads one Target, the Reader reads every Section of the Document, one model
   * call each (DESIGN §6), and stores a Reader account per Section. The accounts
   * are their own output shape and never enter the Findings queue. A failure is
   * surfaced as `readerError`, never swallowed, and stores nothing.
   */
  const runReaderPass = useCallback(
    async (passId: string): Promise<void> => {
      const database = databaseRef.current;
      const current = documentRef.current;
      const transport = transportRef.current;
      if (database === null || current === null || transport === null) return;
      if (readerInFlightRef.current) return;

      const pass = passesRef.current.find((entry) => entry.id === passId);
      if (
        pass === undefined ||
        pass.kind !== "model" ||
        !isReaderPass(pass) ||
        !pass.enabled
      ) {
        return;
      }
      if (!hasCritic(criticConnection)) {
        setReaderError(criticGuardMessage(criticConnection, "the Reader pass"));
        return;
      }
      if (sections(current.tree).length === 0) {
        setReaderError("Add a heading Section before running the Reader pass.");
        return;
      }

      readerInFlightRef.current = true;
      setReaderError(null);
      setReaderRunning(true);
      setReaderStartedAt(Date.now());
      try {
        // Save first, so the accounts describe the prose that is stored and any
        // accounts for the previous text are cleared before this Run writes.
        await persistenceRef.current?.flush();
        // Re-read after the await: a keystroke during the flush would otherwise
        // have this Run read a Document the save already superseded.
        const latest = documentRef.current;
        if (latest === null) return;
        const accounts = await runReaderPassRecord(database, latest, {
          pass,
          connection: criticConnection,
          transport,
          screeningFrame,
        });
        // As with a model Run: if the Writer opened another Document mid-run,
        // the accounts belong to the Document that was read, not the new view.
        if (documentRef.current?.id === latest.id) {
          setReaderAccounts(accounts);
          savedCanonicalRef.current = latest.canonical;
        }
      } catch (error) {
        // The Provider's own words, surfaced verbatim; never a silent failure.
        setReaderError(describeError(error));
      } finally {
        readerInFlightRef.current = false;
        setReaderRunning(false);
        setReaderStartedAt(null);
      }
    },
    [
      databaseRef,
      documentRef,
      transportRef,
      persistenceRef,
      savedCanonicalRef,
      passesRef,
      criticConnection,
      screeningFrame,
    ],
  );

  /**
   * Stories 118–136: the Audit pass end to end. A document-scope Run reads the
   * whole Document once (chunking and synthesizing when it is long) and stores
   * one Audit account. The account is its own output shape and never enters the
   * Findings queue. A failure is surfaced as `auditError`, never swallowed, and
   * stores nothing.
   */
  const runAuditPass = useCallback(
    async (passId: string): Promise<void> => {
      const database = databaseRef.current;
      const current = documentRef.current;
      const transport = transportRef.current;
      if (database === null || current === null || transport === null) return;
      if (auditInFlightRef.current) return;

      const pass = passesRef.current.find((entry) => entry.id === passId);
      if (
        pass === undefined ||
        pass.kind !== "model" ||
        !isAuditPass(pass) ||
        !pass.enabled
      ) {
        return;
      }
      if (!hasCritic(criticConnection)) {
        setAuditError(criticGuardMessage(criticConnection, "the Audit pass"));
        return;
      }

      auditInFlightRef.current = true;
      setAuditError(null);
      setAuditRunning(true);
      setAuditStartedAt(Date.now());
      try {
        // Save first, so the account describes the prose that is stored and any
        // accounts for the previous text are cleared before this Run writes.
        await persistenceRef.current?.flush();
        // Re-read after the await: a keystroke during the flush would otherwise
        // have this Run read a Document the save already superseded.
        const latest = documentRef.current;
        if (latest === null) return;
        const outcome = await runAuditPassRecord(database, latest, {
          pass,
          connection: criticConnection,
          transport,
          characterLimit,
        });
        // As with a model Run: if the Writer opened another Document mid-run,
        // the account belongs to the Document that was read, not the new view.
        if (documentRef.current?.id === latest.id) {
          setAuditAccounts(await listAuditAccounts(database, latest.id));
          setAuditReport({ passId, chunks: outcome.chunks, violations: outcome.violations });
          savedCanonicalRef.current = latest.canonical;
        }
      } catch (error) {
        // The Provider's own words, surfaced verbatim; never a silent failure.
        setAuditError(describeError(error));
      } finally {
        auditInFlightRef.current = false;
        setAuditRunning(false);
        setAuditStartedAt(null);
      }
    },
    [
      databaseRef,
      documentRef,
      transportRef,
      persistenceRef,
      savedCanonicalRef,
      passesRef,
      criticConnection,
      characterLimit,
    ],
  );

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
        setJudgeError("Set a model on the Judge Slot in AI Settings first.");
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
    [judgeConnection, transportRef],
  );

  /** Loads the current Document's stored analysis into the view. */
  const loadAnalysis = useCallback(
    async (database: ObelusDatabase, document: DocumentRecord) => {
      setRawResponses(await listRunResponses(database, document.id));
      setReaderAccounts(await listReaderAccounts(database, document.id));
      setAuditAccounts(await listAuditAccounts(database, document.id));
      setAuditReport(null);
    },
    [],
  );

  /** Clears the stored analysis because the prose changed. */
  const clearAnalysis = useCallback(
    async (database: ObelusDatabase, documentId: string) => {
      await clearReaderAccounts(database, documentId);
      setReaderAccounts([]);
      await clearAuditAccounts(database, documentId);
      setAuditAccounts([]);
      setAuditReport(null);
    },
    [],
  );

  /** Clears the analysis in memory, for a Document import that already cleared it. */
  const resetAnalysis = useCallback(() => {
    setReaderAccounts([]);
    setAuditAccounts([]);
    setAuditReport(null);
  }, []);

  /** Clears the Run readouts when the Writer switches Document. */
  const resetReadouts = useCallback(() => {
    setRunError(null);
    setLastRunReport(null);
    setReaderError(null);
    setAuditError(null);
    setJudgeResult(null);
    setJudgeError(null);
  }, []);

  return {
    runningPassId,
    structuralRunning,
    runStartedAt,
    runError,
    lastRunReport,
    priceTable,
    runEstimates,
    savePriceTable,
    sessionCost,
    cancelRun,
    runModelPass,
    runStructuralSet,
    documentChunks,
    structuralEstimate,
    rawResponses,
    readerAccounts,
    readerRunning,
    readerStartedAt,
    readerError,
    runReaderPass,
    auditAccounts,
    auditRunning,
    auditStartedAt,
    auditError,
    auditReport,
    runAuditPass,
    judgeResult,
    judgeError,
    judgeRunning,
    runJudge,
    assistantRunning,
    assistantError,
    runPromptAssistant,
    loadAnalysis,
    clearAnalysis,
    resetAnalysis,
    resetReadouts,
    loadPriceTable,
  };
}

/** Why no Target could be built for a Pass of this scope. */
function noTargetMessage(scope: PassScope): string {
  return scopeVocab(scope).emptyMessage;
}

/**
 * The critic Slot guard every model Run shares: a Connection must be assigned
 * and carry a model before a request leaves. The predicate narrows the
 * Connection; `criticGuardMessage` names the Run in the message.
 */
function hasCritic(connection: Connection | null): connection is Connection {
  return connection !== null && connection.model.trim() !== "";
}

function criticGuardMessage(connection: Connection | null, what: string): string {
  if (connection === null) {
    return `Assign a Connection to the critic Slot before running ${what}.`;
  }
  return `Set a model on the Critic Slot in AI Settings first.`;
}
