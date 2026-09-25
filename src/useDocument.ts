import { useRef, useState } from "react";
import type { FindingInterval } from "./core/anchor";
import type { RunReport, RunResult } from "./core/critique";
import type { DocTree } from "./core/docTree";
import {
  type CostEstimate,
  type PriceTable,
  type StructuralCostEstimate,
} from "./core/cost";
import { type DeclineReason, type Finding } from "./core/finding";
import type { DocumentStatus, LibraryEntry } from "./core/library";
import { type JudgeResult } from "./core/judge";
import { type Pass, type RuleConfig, type WorkingOrderBand } from "./core/pass";
import {
  type PromptAssistantRequest,
  type PromptAssistantResult,
} from "./core/promptAssistant";
import { STARTER_PASSES } from "./core/starterPasses";
import type { PersistenceController } from "./editor/persistence";
import {
  type Slot,
  type SlotAssignment,
  type SlotBinding,
} from "./storage/connections";
import {
  type AuditAccountRecord,
  type DocumentRecord,
  type ObelusDatabase,
  type ReaderAccountRecord,
  type RevisionRecord,
} from "./storage/obelusDatabase";
import { useFindings } from "./findings/useFindings";
import { useDocumentLifecycle } from "./document/useDocumentLifecycle";
import { useConnections } from "./settings/useConnections";
import { useGlobalSettings } from "./settings/useGlobalSettings";
import { usePassSet } from "./passes/usePassSet";
import { useRuns, type AuditRunReport } from "./runs/useRuns";
import type { Connection } from "./wire/connection";
import { type Transport } from "./wire/transport";

export type { AuditRunReport };

export interface DocumentHandle {
  status: "loading" | "ready" | "error";
  openError: string;
  saveError: string | null;
  /**
   * Set when a save had to drop Revisions or cached Runs to fit the quota, so
   * the Writer knows their history shrank and can back the Library up. Null
   * when the last save needed no trimming.
   */
  storageNotice: string | null;
  dismissStorageNotice: () => void;
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
  /** Canonical intervals of open Findings, each tied to its Finding, for the Editor to draw. */
  highlights: FindingInterval[];
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
   * ADR 0010: the Band the rail opens on. Structure until the Writer moves, and
   * the last Band they were in thereafter. A default, never a gate.
   */
  railBand: WorkingOrderBand;
  setRailBand: (band: WorkingOrderBand) => Promise<void>;
  /** ADR 0010, story 166: whether the rail is collapsed entirely. */
  railCollapsed: boolean;
  setRailCollapsed: (collapsed: boolean) => Promise<void>;
  /**
   * Story 169: whether the Writer has dismissed the first-run note in the
   * Editor body. It is remembered in the settings store, so a reload does not
   * bring the note back, and a Backup carries the dismissal.
   */
  firstRunNoteDismissed: boolean;
  /** Story 169: dismisses the first-run note, storing the choice. */
  dismissFirstRunNote: () => Promise<void>;
  /**
   * Story 50: how many chunks a document-scope Run of the current Document
   * would make at the current limit. `1` when it fits in a single call, so the
   * warning never promises a split the Document cannot support.
   */
  documentChunks: number;
  /**
   * Story 189: the summed cost estimate for the structural set before it is
   * run. Sums over exactly the enabled document-scope Passes it will execute,
   * multiplied by the chunk count it will actually use.
   */
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
  /**
   * Stories 179–182: decline every open Finding in one Pass in one action, each
   * written individually as declined advice. Returns whether anything was
   * stored.
   */
  declineRestOfPass: (passId: string) => Promise<boolean>;
  /** Story 181: return a Finding to the queue, clearing any declineReason. */
  reopen: (findingId: string) => Promise<boolean>;
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

  const [saveError, setSaveError] = useState<string | null>(null);
  const [documentRecord, setDocumentRecord] = useState<DocumentRecord | null>(null);
  const [targetBlockIndex, setTargetBlockIndex] = useState(0);

  /**
   * The Finding queue and the Revision list for the current Document. Built
   * first because the settings, the Pass set and the Runs all re-run or read
   * Findings, and the document lifecycle resolves them on open and on save.
   */
  const findingsHandle = useFindings({
    databaseRef,
    documentRef,
    passesRef,
    voiceListRef,
    onError: setSaveError,
  });
  const {
    findings,
    highlights,
    revisions,
    findingsRef,
    canonicalsRef,
    applyResolution,
    refreshFindings,
    refreshRevisions,
    rerunRules,
    markAddressed,
    decline,
    declineRestOfPass,
    reopen,
  } = findingsHandle;

  /**
   * Stories 2–15 and 90: the Writer's Connections, the Critic and Judge Slots,
   * and the derived default Judge pairing. The whole shell reads the same
   * resolution the Runs do.
   */
  const connectionsHandle = useConnections({ databaseRef, onError: setSaveError });
  const {
    connections,
    slots,
    criticConnection,
    judgeConnection,
    judgeIsDefault,
    sameModelWarning,
    saveConnection,
    addCustomConnection,
    removeConnection,
    assignSlot,
  } = connectionsHandle;

  /**
   * The six global settings — the Screening frame, the chunk character limit,
   * the Voice list, the rail's Band and collapsed state, and the first-run
   * note. A Voice list change re-runs the rule Passes, so the hook is built
   * here, after `rerunRules`.
   */
  const globalSettings = useGlobalSettings({
    databaseRef,
    onError: setSaveError,
    voiceListRef,
    onVoiceListSaved: rerunRules,
  });
  const {
    screeningFrame,
    setScreeningFrame,
    characterLimit,
    setCharacterLimit,
    voiceList,
    setVoiceList,
    railBand,
    setRailBand,
    railCollapsed,
    setRailCollapsed,
    firstRunNoteDismissed,
    dismissFirstRunNote,
  } = globalSettings;

  /**
   * Stories 34, 35, 98 and 102–103: the Pass set, the Starter pack as edited by
   * the Writer. A rule Pass change re-runs the rules on the current Document.
   */
  const passesHandle = usePassSet({
    databaseRef,
    passesRef,
    onError: setSaveError,
    rerunRules,
  });
  const {
    passes,
    passSetError,
    togglePass,
    saveRuleConfig,
    savePass,
    newPassDraft,
    exportPassSet,
    importPassSet,
    restoreStarterPack,
    clearPassSetError,
  } = passesHandle;

  /**
   * The five kinds of Run, the prompt assistant and the cost estimates. It owns
   * the in-flight flags, the per-Run errors and results, and the Reader and
   * Audit accounts, which the document lifecycle loads and clears through the
   * `loadAnalysis` and `clearAnalysis` entry points.
   */
  const runsHandle = useRuns({
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
    onError: setSaveError,
  });
  const {
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
  } = runsHandle;

  /**
   * The Document of record: opening, persisting, the Library, metadata, Markdown
   * import/export and durability. The shell owns the Document record itself so
   * the Runs can estimate against it.
   */
  const lifecycle = useDocumentLifecycle({
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
    onError: setSaveError,
    applyResolution,
    refreshFindings,
    refreshRevisions,
    settings: globalSettings,
    connections: connectionsHandle,
    passes: passesHandle,
    runs: runsHandle,
  });
  const {
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
  } = lifecycle;

  return {
    status,
    openError,
    saveError,
    storageNotice,
    dismissStorageNotice,
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
    railBand,
    setRailBand,
    railCollapsed,
    setRailCollapsed,
    firstRunNoteDismissed,
    dismissFirstRunNote,
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
    criticConnection,
    judgeConnection,
    judgeIsDefault,
    sameModelWarning,
    handleChange,
    flagMilestone,
    markAddressed,
    decline,
    declineRestOfPass,
    reopen,
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
