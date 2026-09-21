import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reResolveFindings, type FindingResolution } from "./core/anchor";
import { chunkTarget, DEFAULT_CHARACTER_LIMIT } from "./core/chunking";
import type { RunReport, RunResult } from "./core/critique";
import { addRunCost, estimateRunCost, type CostEstimate, type PriceTable } from "./core/cost";
import type { DocTree } from "./core/docTree";
import { type DeclineReason, type Finding, type Interval, type Violation } from "./core/finding";
import type { DocumentStatus, LibraryEntry } from "./core/library";
import {
  judge as judgeCore,
  sameModelWarning as sameModelWarningFor,
  type JudgeResult,
} from "./core/judge";
import { isAuditPass, isFindingsPass, isReaderPass, structuralPasses, type Pass, type PassScope, type RuleConfig } from "./core/pass";
import { passProblem, parsePassSet, serializePassSet } from "./core/passSet";
import { documentContext, targetForPass } from "./core/passContext";
import { promptCharacters } from "./core/prompt";
import {
  assistPassPrompt,
  type PromptAssistantRequest,
  type PromptAssistantResult,
} from "./core/promptAssistant";
import { sections } from "./core/sections";
import { blankModelPass, STARTER_PASSES } from "./core/starterPasses";
import { describeError } from "./errors";
import { createPersistence, type PersistenceController } from "./editor/persistence";
import {
  assignSlot as assignSlotRecord,
  defaultJudgeConnection,
  loadOrCreateConnections,
  loadSlots,
  removeConnection as removeConnectionRecord,
  saveConnection as saveConnectionRecord,
  slotConnection,
  type Slot,
  type SlotAssignment,
  type SlotBinding,
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
  type AuditAccountRecord,
  type DocumentRecord,
  type ObelusDatabase,
  type ReaderAccountRecord,
  type RevisionRecord,
} from "./storage/obelusDatabase";
import {
  loadOrCreatePasses,
  replacePasses as replacePassesRecord,
  restoreStarterPasses,
  savePass as savePassRecord,
  setPassEnabled as setStoredPassEnabled,
  updateRuleConfig,
} from "./storage/passes";
import { listRevisions, takeRevision } from "./storage/revisions";
import {
  applyMetadataPatch,
  createLibraryDocument,
  listLibrary,
  updateDocumentMetadata,
  type DocumentMetadataPatch,
} from "./storage/library";
import { runRulePasses } from "./storage/ruleRuns";
import { listRunResponses, runModelPass as runModelPassRecord } from "./storage/modelRuns";
import { loadPriceTable, savePriceTable as persistPriceTable } from "./storage/pricing";
import { requestPersistentStorage } from "./storage/persist";
import { listReaderAccounts, clearReaderAccounts, runReaderPass as runReaderPassRecord } from "./storage/readerAccounts";
import {
  clearAuditAccounts,
  listAuditAccounts,
  runAuditPass as runAuditPassRecord,
} from "./storage/auditAccounts";
import { loadScreeningFrame, saveScreeningFrame, loadCharacterLimit, saveCharacterLimit, loadVoiceList, saveVoiceList } from "./storage/settings";
import { loadLastBackedUp } from "./storage/durability";
import { useDurability } from "./durability/useDurability";
import { createCustomConnection, type Connection } from "./wire/connection";
import { transport as appTransport } from "./wire/productionTransport";
import { isCancelledError, type Transport } from "./wire/transport";

/** Story 131: the most recent Audit Run's chunk count and drift, for the surface. */
export interface AuditRunReport {
  passId: string;
  chunks: number;
  violations: Violation[];
}

export interface DocumentHandle {
  status: "loading" | "ready" | "error";
  openError: string;
  saveError: string | null;
  document: DocumentRecord | null;
  revisions: RevisionRecord[];
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
  /** Stories 76, 77: the Critic's Screening frame, a settable global toggle. */
  screeningFrame: boolean;
  setScreeningFrame: (enabled: boolean) => Promise<void>;
  /**
   * Story 50: the character limit above which a document-scope Run is chunked
   * Section by Section. Configurable, with the Core default as its seed.
   */
  characterLimit: number;
  setCharacterLimit: (limit: number) => Promise<void>;
  /**
   * Stories 149–152: the Voice list, the words and phrases the Writer has
   * declared theirs. Rule passes drop a match inside an entry; a Findings model
   * pass is told about the list; a surviving model match is annotated rather
   * than hidden.
   */
  voiceList: string[];
  setVoiceList: (entries: string[]) => Promise<void>;
  /**
   * Story 50: how many chunks a document-scope Run of the current Document
   * would make at the current limit. `1` when it fits in a single call, so the
   * warning never promises a split the Document cannot support.
   */
  documentChunks: number;
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
  /** Story 98: store a model Pass the Writer wrote or edited. */
  savePass: (pass: Pass) => Promise<boolean>;
  /**
   * Story 98: a blank model Pass for the Workbench to edit. It is not stored
   * until the Writer saves it, so cancelling a new Pass leaves nothing behind.
   */
  newPassDraft: () => Pass;
  /** Story 102: the whole Pass set as JSON text, ready to download. */
  exportPassSet: () => string;
  /** Story 102: replace the Pass set from JSON text. */
  importPassSet: (json: string) => Promise<boolean>;
  /** Story 103: restore the Starter pack over the Writer's current set. */
  restoreStarterPack: () => Promise<void>;
  /** A Pass set save, import or restore failure, surfaced verbatim. */
  passSetError: string | null;
  clearPassSetError: () => void;
  /** Stories 104 and 105: true while the prompt-authoring assistant is in flight. */
  assistantRunning: boolean;
  /** A prompt-assistant failure, surfaced verbatim rather than swallowed. */
  assistantError: string | null;
  /**
   * Story 104: asks the assistant for a Pass prompt draft. It receives the
   * Writer's request and current prompt and nothing else, so no prose can reach
   * it (story 105).
   */
  runPromptAssistant: (input: PromptAssistantRequest) => Promise<PromptAssistantResult | null>;
  /** Story 2–7: the Writer's Connections, with prefills seeded. */
  connections: Connection[];
  /** Story 14: which Connection is the Critic and which the Judge. */
  slots: SlotAssignment;
  saveConnection: (connection: Connection) => Promise<void>;
  addCustomConnection: () => Promise<void>;
  removeConnection: (connectionId: string) => Promise<void>;
  assignSlot: (slot: Slot, binding: SlotBinding | null) => Promise<void>;
  importFromMarkdown: (markdown: string) => Promise<void>;
  exportToMarkdown: () => string;
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
  /** Story 149: the Writer's Voice list, read by every rule and model Run. */
  const voiceListRef = useRef<string[]>([]);
  const transportRef = useRef<Transport | null>(null);
  /**
   * The canonical string last saved or last read. Reader accounts describe a
   * specific text, so a save whose canonical differs clears them rather than
   * showing them against prose they never read.
   */
  const savedCanonicalRef = useRef<string | null>(null);
  /** Guards the prompt assistant against a second click before its state renders. */
  const assistantInFlightRef = useRef(false);

  const [status, setStatus] = useState<DocumentHandle["status"]>("loading");
  const [openError, setOpenError] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [documentRecord, setDocumentRecord] = useState<DocumentRecord | null>(null);
  const [revisions, setRevisions] = useState<RevisionRecord[]>([]);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
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
  const [priceTable, setPriceTableState] = useState<PriceTable>({});
  const [sessionCost, setSessionCost] = useState(0);
  const [screeningFrame, setScreeningFrameState] = useState(true);
  const [characterLimit, setCharacterLimitState] = useState(DEFAULT_CHARACTER_LIMIT);
  /** Stories 149–152: the words and phrases the Writer has declared theirs. */
  const [voiceList, setVoiceListState] = useState<string[]>([]);
  const [lastBackedUp, setLastBackedUp] = useState<number | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  /** Story 102: a Pass set save, import or restore failure. */
  const [passSetError, setPassSetError] = useState<string | null>(null);
  /** Stories 104 and 105: the prompt-authoring assistant's state. */
  const [assistantRunning, setAssistantRunning] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);

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

  /** Replaces one Pass in the loaded set, or appends it when it is new. */
  const applyPass = useCallback((updated: Pass) => {
    const exists = passesRef.current.some((pass) => pass.id === updated.id);
    const next = exists
      ? passesRef.current.map((pass) => (pass.id === updated.id ? updated : pass))
      : [...passesRef.current, updated];
    passesRef.current = next;
    setPasses(next);
  }, []);

  /**
   * Loads the global stores every part of the shell reads: the Pass set, the
   * Connections and Slots, the Screening frame, the character limit and the
   * last-backed-up reminder. Shared by the mount path and the restore path, so
   * the two cannot drift when a global store is added.
   */
  const loadGlobalState = useCallback(async (database: ObelusDatabase) => {
    const loadedPasses = await loadOrCreatePasses(database);
    passesRef.current = loadedPasses;
    setPasses(loadedPasses);
    setConnections(await loadOrCreateConnections(database));
    setSlots(await loadSlots(database));
    setScreeningFrameState(await loadScreeningFrame(database));
    setCharacterLimitState(await loadCharacterLimit(database));
    const loadedVoiceList = await loadVoiceList(database);
    voiceListRef.current = loadedVoiceList;
    setVoiceListState(loadedVoiceList);
    setPriceTableState(await loadPriceTable(database));
    setLastBackedUp(await loadLastBackedUp(database));
  }, []);

  const refreshRevisions = useCallback(async () => {
    const database = databaseRef.current;
    const current = documentRef.current;
    if (database === null || current === null) return;
    setRevisions(await listRevisions(database, current.id));
  }, []);

  /**
   * Reads the Library list without touching persistence. Writes that change a
   * Document's metadata or add one call this; the flushing variant below is for
   * opening the Library from the Editor, where a keystroke may still be pending.
   */
  const readLibrary = useCallback(async () => {
    const database = databaseRef.current;
    if (database === null) return;
    setLibrary(await listLibrary(database));
  }, []);

  /**
   * Reads the Library list, flushing pending edits first: the list shows stored
   * state — word count and last-edited come from the record, and a keystroke
   * still on the debounce has not reached it.
   */
  const refreshLibrary = useCallback(async () => {
    await persistenceRef.current?.flush();
    await readLibrary();
  }, [readLibrary]);

  /** Re-runs the enabled rule Passes against the current Document. */
  const rerunRules = useCallback(async () => {
    const database = databaseRef.current;
    const current = documentRef.current;
    if (database === null || current === null) return;
    await runRulePasses(database, current, {
      passes: passesRef.current,
      voiceList: voiceListRef.current,
    });
    await refreshFindings(current);
    await refreshRevisions();
  }, [refreshFindings, refreshRevisions]);

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
      applyResolution({ findings: [], intervals: [], changed: [] });
      setRawResponses(await listRunResponses(database, opened.id));
      setReaderAccounts(await listReaderAccounts(database, opened.id));
      setAuditAccounts(await listAuditAccounts(database, opened.id));
      setAuditReport(null);
      await runRulePasses(database, opened, {
        passes: passesRef.current,
        voiceList: voiceListRef.current,
      });
      await refreshFindings(opened);
      await refreshRevisions();
    },
    [applyResolution, refreshFindings, refreshRevisions],
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
            await persistDocument(database, current);
            // Story 115: the browser may evict IndexedDB under storage pressure.
            // Ask it to persist the Library on the first save; the request is
            // idempotent, non-blocking and never fails the save that triggers it.
            void requestPersistentStorage();
            setSaveError(null);
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
              await clearReaderAccounts(database, current.id);
              setReaderAccounts([]);
              // An Audit account describes the whole piece too, so it goes with
              // the Reader accounts rather than judging text that is gone; an
              // Audit Run (#27) refreshes it.
              await clearAuditAccounts(database, current.id);
              setAuditAccounts([]);
              setAuditReport(null);
            }
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
  }, [enterDocument, loadGlobalState, refreshRevisions, refreshFindings]);

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
      setReaderAccounts([]);
      setAuditAccounts([]);
      setAuditReport(null);

      await runRulePasses(database, updated, {
        passes: passesRef.current,
        voiceList: voiceListRef.current,
      });
      await refreshFindings(updated);
      await refreshRevisions();
    },
    [refreshFindings, refreshRevisions],
  );

  const exportToMarkdown = useCallback(() => {
    const current = documentRef.current;
    return current === null ? "" : exportDocument(current);
  }, []);

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
      setRunError(null);
      setLastRunReport(null);
      setReaderError(null);
      setAuditError(null);
      setJudgeResult(null);
      setJudgeError(null);
      await readLibrary();
    },
    [enterDocument, readLibrary],
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
      setRunError(null);
      setLastRunReport(null);
      setReaderError(null);
      setAuditError(null);
      setJudgeResult(null);
      setJudgeError(null);
      const opened = await loadOrCreateDocument(database);
      await enterDocument(database, opened);
      await readLibrary();
    },
    [loadGlobalState, enterDocument, readLibrary],
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
        setSaveError(describeError(error));
      }
    },
    [readLibrary],
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
  }, [openDocument]);

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

  /**
   * Story 98: stores a model Pass the Writer wrote or edited. The same
   * `passProblem` the importer uses validates it, so a prompt with an unknown
   * placeholder (story 100) or an out-of-set scope or output shape (story 101)
   * is refused and the error is shown rather than saved.
   */
  const savePass = useCallback(
    async (pass: Pass): Promise<boolean> => {
      const database = databaseRef.current;
      if (database === null) return false;
      const problem = passProblem(pass);
      if (problem !== null) {
        setPassSetError(problem);
        return false;
      }
      try {
        await savePassRecord(database, pass);
        applyPass(pass);
        setPassSetError(null);
        // A rule Pass is re-derived on every save; a model Pass runs on demand,
        // so its edit only changes what the next Run sends.
        if (pass.kind === "rule") await rerunRules();
        return true;
      } catch (error) {
        setPassSetError(describeError(error));
        return false;
      }
    },
    [applyPass, rerunRules],
  );

  /** Story 98: a blank model Pass for the Workbench to edit, not yet stored. */
  const newPassDraft = useCallback((): Pass => blankModelPass(crypto.randomUUID()), []);

  /** Story 102: the Pass set as a file's text. */
  const exportPassSet = useCallback((): string => serializePassSet(passesRef.current), []);

  /**
   * Story 102: replaces the Pass set from a file. The import is the set the
   * Writer chose, so it lands whole; `loadOrCreatePasses` then seeds any
   * Starter Pass the file omitted, which is the same reconciliation a reload
   * performs, so the session and the next open agree.
   */
  const importPassSet = useCallback(
    async (json: string): Promise<boolean> => {
      const database = databaseRef.current;
      if (database === null) return false;
      let imported: Pass[];
      try {
        imported = parsePassSet(json);
      } catch (error) {
        setPassSetError(describeError(error));
        return false;
      }
      try {
        await replacePassesRecord(database, imported);
        const reconciled = await loadOrCreatePasses(database);
        passesRef.current = reconciled;
        setPasses(reconciled);
        setPassSetError(null);
        await rerunRules();
        return true;
      } catch (error) {
        setPassSetError(describeError(error));
        return false;
      }
    },
    [rerunRules],
  );

  /** Story 103: restores the Starter pack, custom Passes and all. */
  const restoreStarterPack = useCallback(async (): Promise<void> => {
    const database = databaseRef.current;
    if (database === null) return;
    try {
      await restoreStarterPasses(database);
      const restored = await loadOrCreatePasses(database);
      passesRef.current = restored;
      setPasses(restored);
      setPassSetError(null);
      await rerunRules();
    } catch (error) {
      setPassSetError(describeError(error));
    }
  }, [rerunRules]);

  const clearPassSetError = useCallback(() => setPassSetError(null), []);

  /** The Connection the critic Slot resolves to, with its model, or null. */
  const criticConnection = useMemo(
    () => slotConnection(connections, slots.critic),
    [connections, slots],
  );

  /**
   * The judge Slot's Connection, with its model override, or the story-90
   * default: a different Connection from the Critic, so the Judge is
   * independent by default. A Slot may share the Critic's Connection while
   * naming a different model.
   */
  const judgeConnection = useMemo(() => {
    if (slots.judge !== null) return slotConnection(connections, slots.judge);
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

  /**
   * Story 51: the pre-run cost estimate for each Findings pass, from the same
   * Target the Run will use. It is shown, never enforced: an unknown model
   * prices at zero and the estimate is still displayed.
   */
  const runEstimates = useMemo(() => {
    const estimates: Record<string, CostEstimate> = {};
    if (documentRecord === null) return estimates;
    const model = criticConnection?.model ?? "";
    for (const pass of passes) {
      if (pass.kind !== "model" || !isFindingsPass(pass)) continue;
      const target = targetForPass(
        pass,
        documentRecord.tree,
        targetBlockIndex,
        documentRecord.title,
      );
      const characters = target === null ? documentRecord.canonical.length : promptCharacters(pass.prompt ?? "", target);
      estimates[pass.id] = estimateRunCost(characters, model, priceTable);
    }
    return estimates;
  }, [documentRecord, passes, targetBlockIndex, criticConnection, priceTable]);

  /** Story 51: stores the Writer's edited price table. */
  const savePriceTable = useCallback(async (table: PriceTable) => {
    const database = databaseRef.current;
    if (database === null) return;
    try {
      setPriceTableState(await persistPriceTable(database, table));
    } catch (error) {
      setSaveError(describeError(error));
    }
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
    [criticConnection],
  );

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
    [criticConnection, refreshFindings, screeningFrame, characterLimit, targetBlockIndex, priceTable],
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
    [criticConnection, screeningFrame],
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
    [criticConnection, characterLimit],
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

  /** Story 50: the character limit above which a document Run is chunked. */
  const setCharacterLimit = useCallback(async (limit: number) => {
    const database = databaseRef.current;
    if (database === null) return;
    try {
      setCharacterLimitState(await saveCharacterLimit(database, limit));
    } catch (error) {
      setSaveError(describeError(error));
    }
  }, []);

  /** Stories 149–152: the Writer's Voice list, settable and persisted. */
  const setVoiceList = useCallback(async (entries: string[]) => {
    const database = databaseRef.current;
    if (database === null) return;
    try {
      const saved = await saveVoiceList(database, entries);
      voiceListRef.current = saved;
      setVoiceListState(saved);
      // Rule passes run on save, so a change to the Voice list must re-run them
      // for the declared words to leave (or rejoin) the queue immediately.
      await rerunRules();
    } catch (error) {
      setSaveError(describeError(error));
    }
  }, [rerunRules]);

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

  const assignSlot = useCallback(async (slot: Slot, binding: SlotBinding | null) => {
    const database = databaseRef.current;
    if (database === null) return;
    try {
      setSlots(await assignSlotRecord(database, slot, binding));
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
    library,
    refreshLibrary,
    openDocument,
    createDocument,
    renameDocument,
    setDocumentStatus,
    setDocumentTags,
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
    priceTable,
    runEstimates,
    savePriceTable,
    sessionCost,
    cancelRun,
    runModelPass,
    runStructuralSet,
    screeningFrame,
    setScreeningFrame,
    characterLimit,
    setCharacterLimit,
    voiceList,
    setVoiceList,
    documentChunks,
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
    savePass,
    newPassDraft,
    exportPassSet,
    importPassSet,
    restoreStarterPack,
    passSetError,
    clearPassSetError,
    assistantRunning,
    assistantError,
    runPromptAssistant,
    connections,
    slots,
    saveConnection,
    addCustomConnection,
    removeConnection,
    assignSlot,
    importFromMarkdown,
    exportToMarkdown,
    backupLibrary,
    restoreLibrary,
    exportBundle,
    importBundle,
    lastBackedUp,
    backupError,
    clearBackupError,
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

/** Replace one Connection in the list, or append it if it is new. */
function replaceConnection(current: Connection[], connection: Connection): Connection[] {
  const exists = current.some((entry) => entry.id === connection.id);
  return exists
    ? current.map((entry) => (entry.id === connection.id ? connection : entry))
    : [...current, connection];
}
