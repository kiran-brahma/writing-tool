import { useCallback, useRef, useState } from "react";
import type { FindingInterval } from "./core/anchor";
import type { ColorSchemeSetting } from "./core/colorScheme";
import type { RunResult } from "./core/critique";
import type { DocTree } from "./core/docTree";
import { type DeclineReason, type Finding } from "./core/finding";
import type { LibraryEntry } from "./core/library";
import { type JudgeResult } from "./core/judge";
import { type Pass, type RuleConfig } from "./core/pass";
import { STARTER_PASSES } from "./core/starterPasses";
import type { PersistenceController } from "./editor/persistence";
import {
  type Slot,
  type SlotAssignment,
  type SlotBinding,
} from "./storage/connections";
import {
  type DocumentRecord,
  type ObelusDatabase,
  type RevisionRecord,
} from "./storage/obelusDatabase";
import { useFindings } from "./findings/useFindings";
import { useDocumentLifecycle } from "./document/useDocumentLifecycle";
import { useConnections } from "./settings/useConnections";
import { useGlobalSettings } from "./settings/useGlobalSettings";
import { usePassSet } from "./passes/usePassSet";
import { useRuns } from "./runs/useRuns";
import type { Connection } from "./wire/connection";
import { type Transport } from "./wire/transport";

export interface DocumentHandle {
  status: "loading" | "ready" | "error";
  openError: string;
  saveError: string | null;
  /** Set when a save had to drop Revisions or cached Runs to fit the quota. */
  storageNotice: string | null;
  dismissStorageNotice: () => void;
  document: DocumentRecord | null;
  revisions: RevisionRecord[];
  library: LibraryEntry[];
  refreshLibrary: () => Promise<void>;
  openDocument: (documentId: string) => Promise<void>;
  createDocument: () => Promise<void>;
  renameDocument: (documentId: string, title: string) => Promise<void>;
  findings: Finding[];
  passes: Pass[];
  highlights: FindingInterval[];
  targetBlockIndex: number;
  setTargetBlockIndex: (index: number) => void;
  runningPassId: string | null;
  runStartedAt: number | null;
  runError: string | null;
  cancelRun: () => void;
  runModelPass: (passId: string) => Promise<RunResult | null>;
  reviewParagraph: () => Promise<void>;
  railCollapsed: boolean;
  setRailCollapsed: (collapsed: boolean) => Promise<void>;
  firstRunNoteDismissed: boolean;
  dismissFirstRunNote: () => Promise<void>;
  colorScheme: ColorSchemeSetting;
  setColorScheme: (setting: ColorSchemeSetting) => Promise<void>;
  judgeResult: JudgeResult | null;
  judgeError: string | null;
  judgeRunning: boolean;
  runJudge: (before: string, after: string) => Promise<JudgeResult | null>;
  criticConnection: Connection | null;
  judgeConnection: Connection | null;
  judgeIsDefault: boolean;
  sameModelWarning: string | null;
  handleChange: (tree: DocTree) => void;
  flagMilestone: (note: string) => Promise<void>;
  markAddressed: (findingId: string) => Promise<boolean>;
  decline: (findingId: string, reason?: DeclineReason) => Promise<boolean>;
  reopen: (findingId: string) => Promise<boolean>;
  saveRuleConfig: (passId: string, ruleConfig: RuleConfig) => Promise<void>;
  restoreStarterPack: () => Promise<void>;
  passSetError: string | null;
  clearPassSetError: () => void;
  connections: Connection[];
  slots: SlotAssignment;
  saveConnection: (connection: Connection) => Promise<void>;
  addCustomConnection: () => Promise<void>;
  removeConnection: (connectionId: string) => Promise<void>;
  assignSlot: (slot: Slot, binding: SlotBinding | null) => Promise<void>;
  importFromMarkdown: (markdown: string) => Promise<void>;
  exportToMarkdown: () => string;
  backupLibrary: (includeKeys: boolean, deliver: (json: string) => void) => Promise<boolean>;
  restoreLibrary: (json: string) => Promise<boolean>;
  importBundle: (json: string) => Promise<string | null>;
  lastBackedUp: number | null;
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
   * The eight global settings — the Screening frame, the chunk character
   * limit, the Voice list, the rail's Band and collapsed state, the first-run
   * note, the colour scheme, and the raw-response toggle. A Voice list change re-runs the rule Passes, so the hook is built
   * here, after `rerunRules`.
   */
  const globalSettings = useGlobalSettings({
    databaseRef,
    onError: setSaveError,
  });
  const {
    railCollapsed,
    setRailCollapsed,
    firstRunNoteDismissed,
    dismissFirstRunNote,
    colorScheme,
    setColorScheme,
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
    saveRuleConfig,
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
    transportRef,
    passesRef,
    targetBlockIndex,
    criticConnection,
    judgeConnection,
    refreshFindings,
  });
  const {
    runningPassId,
    runStartedAt,
    runError,
    cancelRun,
    runModelPass,
    judgeResult,
    judgeError,
    judgeRunning,
    runJudge,
  } = runsHandle;

  /** One Review: the three enabled model passes on the paragraph at the cursor. */
  const reviewParagraph = useCallback(async (): Promise<void> => {
    const modelPasses = passesRef.current.filter(
      (pass) => pass.kind === "model" && pass.enabled && pass.scope === "paragraph",
    );
    for (const pass of modelPasses) {
      const result = await runModelPass(pass.id);
      if (result === null) return;
    }
  }, [runModelPass]);

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
    importFromMarkdown,
    exportToMarkdown,
    handleChange,
    flagMilestone,
    backupLibrary,
    restoreLibrary,
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
    findings,
    passes,
    highlights,
    targetBlockIndex,
    setTargetBlockIndex,
    runningPassId,
    runStartedAt,
    runError,
    cancelRun,
    runModelPass,
    reviewParagraph,
    railCollapsed,
    setRailCollapsed,
    firstRunNoteDismissed,
    dismissFirstRunNote,
    colorScheme,
    setColorScheme,
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
    reopen,
    saveRuleConfig,
    restoreStarterPack,
    passSetError,
    clearPassSetError,
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
    importBundle,
    lastBackedUp,
    backupError,
    clearBackupError,
  };
}
