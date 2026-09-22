import { useCallback, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import type { Interval } from "./core/finding";
import { selectionAnchor as selectionAnchorFor } from "./core/judgeSelection";
import { sectionAt, sections } from "./core/sections";
import { DocumentEditor } from "./editor/DocumentEditor";
import { WorkingOrderRail } from "./editor/WorkingOrderRail";
import { LibraryView } from "./library/LibraryView";
import { PrivacyView } from "./privacy/PrivacyView";
import { describeError } from "./errors";
import { useDocument } from "./useDocument";
import { AiSettingsView } from "./settings/AiSettingsView";
import { WorkbenchView } from "./workbench/WorkbenchView";

/**
 * The Obelus shell. It opens the one Document of record and puts the Writer
 * straight into it: no account, no sign-in. Connections are configured in the
 * sidebar; nothing is sent anywhere until the Writer tests a Connection or runs
 * a pass through one.
 */
const HEADER_BUTTON_CLASS =
  "rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100";

export default function App() {
  const handle = useDocument();
  const {
    status,
    openError,
    saveError,
    document,
    library,
    refreshLibrary,
    openDocument,
    createDocument,
    renameDocument,
    setDocumentStatus,
    setDocumentTags,
    passes,
    highlights,
    targetBlockIndex,
    setTargetBlockIndex,
    priceTable,
    savePriceTable,
    screeningFrame,
    setScreeningFrame,
    characterLimit,
    setCharacterLimit,
    voiceList,
    setVoiceList,
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
    handleChange,
    flagMilestone,
    togglePass,
    saveRuleConfig,
    criticConnection,
    judgeConnection,
    judgeIsDefault,
  } = handle;
  const [milestoneNote, setMilestoneNote] = useState("");
  const [milestonesOnly, setMilestonesOnly] = useState(false);
  /** Story 20: the Library is a view of its own; the Editor is the default. */
  const [view, setView] = useState<"editor" | "library" | "privacy" | "workbench" | "settings">(
    "editor",
  );
  /** Which view the Privacy page returns to when the Writer leaves it. */
  const [privacyReturn, setPrivacyReturn] = useState<"editor" | "library">("editor");
  /** Which view the Pass workbench returns to when the Writer leaves it. */
  const [workbenchReturn, setWorkbenchReturn] = useState<"editor" | "library">("editor");
  /** Which view AI Settings returns to when the Writer leaves it. */
  const [settingsReturn, setSettingsReturn] = useState<"editor" | "library">("editor");
  const [currentFindingId, setCurrentFindingId] = useState<string | null>(null);
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  // The Editor is uncontrolled, so an import remounts it rather than trying to
  // push a new document into an editor that already has one.
  const [editorGeneration, setEditorGeneration] = useState(0);
  /** The Writer's current text selection, as a canonical interval. */
  const [selectionInterval, setSelectionInterval] = useState<Interval | null>(null);
  /** A heading the Writer asked to jump to; the nonce lets a repeat click move again. */
  const [jumpRequest, setJumpRequest] = useState<{ blockIndex: number; nonce: number } | null>(
    null,
  );

  /** Story 25: the outline, derived from the Document's headings. */
  const outlineSections = useMemo(
    () => (document === null ? [] : sections(document.tree)),
    [document],
  );
  /** The Section the cursor is in, so the outline can mark the Writer's place. */
  const activeSection = useMemo(
    () => (document === null ? null : sectionAt(document.tree, targetBlockIndex)),
    [document, targetBlockIndex],
  );
  const jumpToSection = useCallback((blockIndex: number) => {
    setJumpRequest((current) => ({ blockIndex, nonce: (current?.nonce ?? 0) + 1 }));
  }, []);

  /**
   * Opens the Library, flushing pending edits first so its rows show stored word
   * counts and open-Finding counts rather than the state before the last save.
   */
  const goToLibrary = useCallback(() => {
    setView("library");
    void refreshLibrary();
  }, [refreshLibrary]);

  /** Story 106: the Privacy page is reachable from the Editor and the Library. */
  const openPrivacy = useCallback(() => {
    setPrivacyReturn(view === "library" ? "library" : "editor");
    setView("privacy");
  }, [view]);

  /** Story 98: the Pass workbench, reachable from the Editor and the Library. */
  const openWorkbench = useCallback(() => {
    setWorkbenchReturn(view === "library" ? "library" : "editor");
    setView("workbench");
  }, [view]);

  /**
   * AI Settings: Connections, Slots and the run settings, in one view reachable
   * from the Editor and the Library.
   */
  const openSettings = useCallback(() => {
    setSettingsReturn(view === "library" ? "library" : "editor");
    setView("settings");
  }, [view]);

  /** Clears the Editor's view state that belongs to the Document being left. */
  const leaveEditor = useCallback(() => {
    setCurrentFindingId(null);
    setSelectionInterval(null);
    setJumpRequest(null);
    setTargetBlockIndex(0);
    setEditorGeneration((generation) => generation + 1);
  }, []);

  const openFromLibrary = useCallback(
    (documentId: string) => {
      // Opening the Document already in the Editor is a no-op in the hook, so do
      // not wipe the Writer's selection and remount the Editor for it.
      if (documentId !== document?.id) leaveEditor();
      setView("editor");
      void openDocument(documentId);
    },
    [document?.id, leaveEditor, openDocument],
  );

  const startNewDocument = useCallback(() => {
    leaveEditor();
    setView("editor");
    void createDocument();
  }, [createDocument, leaveEditor]);

  /** The selected span, or null when the selection is collapsed. */
  const selection = useMemo(() => {
    if (document === null || selectionInterval === null) return null;
    return selectionAnchorFor(document.canonical, selectionInterval);
  }, [document, selectionInterval]);

  /** The Section the cursor is in, ready to be projected across Revisions. */
  const section = useMemo(() => {
    if (document === null || activeSection === null) return null;
    return selectionAnchorFor(document.canonical, activeSection.interval);
  }, [document, activeSection]);

  /** Story 102: downloads the whole Pass set as one JSON file. */
  const onExportPassSet = useCallback(() => {
    downloadText(
      `obelus-pass-set-${fileStamp()}.json`,
      exportPassSet(),
      "application/json;charset=utf-8",
    );
  }, [exportPassSet]);

  /** Story 111: download a whole-Library backup, then the reminder updates. */
  const onBackupLibrary = useCallback(
    (includeKeys: boolean) => {
      void backupLibrary(includeKeys, (json) => {
        downloadText(
          `obelus-library-${fileStamp()}.json`,
          json,
          "application/json;charset=utf-8",
        );
      });
    },
    [backupLibrary],
  );

  /**
   * Story 111: replace the Library from a backup. The Editor is remounted even
   * when the imported Library reuses the active Document's id, so it cannot
   * keep showing prose the restore replaced.
   */
  const onRestoreLibrary = useCallback(
    async (json: string) => {
      const restored = await restoreLibrary(json);
      if (restored) leaveEditor();
      return restored;
    },
    [restoreLibrary, leaveEditor],
  );

  /** Story 114: download one Document's bundle. */
  const onExportBundle = useCallback(
    async (documentId: string) => {
      const json = await exportBundle(documentId);
      if (json === null) return;
      const entry = library.find((candidate) => candidate.id === documentId);
      downloadText(
        `${slug(entry?.title ?? "document")}-bundle.json`,
        json,
        "application/json;charset=utf-8",
      );
    },
    [exportBundle, library],
  );

  /** Story 114: import a bundle as a new Document and open it. */
  const onImportBundle = useCallback(
    async (json: string) => {
      const id = await importBundle(json);
      if (id === null) return;
      leaveEditor();
      setView("editor");
    },
    [importBundle, leaveEditor],
  );

  if (status === "loading") {
    return (
      <CenteredMessage>
        <p className="text-stone-500">Opening your Library…</p>
      </CenteredMessage>
    );
  }

  if (status === "error") {
    return (
      <CenteredMessage>
        <h1 className="text-lg font-semibold text-stone-900">Obelus could not open your Library</h1>
        <p className="mt-2 max-w-md text-sm text-stone-600">{openError}</p>
      </CenteredMessage>
    );
  }

  const onFlagMilestone = async () => {
    await flagMilestone(milestoneNote);
    setMilestoneNote("");
  };

  const onExport = () => {
    downloadText(
      `${slug(document?.title ?? "document")}.md`,
      exportToMarkdown(),
      "text/markdown;charset=utf-8",
    );
  };

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    // Reset so importing the same file twice still fires a change event.
    input.value = "";
    if (file === undefined) return;

    try {
      await importFromMarkdown(await file.text());
      setCurrentFindingId(null);
      setSelectionInterval(null);
      setEditorGeneration((generation) => generation + 1);
      setImportError(null);
    } catch (error) {
      setImportError(describeError(error));
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900">
      <header className="flex items-center justify-between gap-4 border-b border-stone-200 px-6 py-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Obelus</h1>
          <p className="text-xs text-stone-500">It marks; it never holds the pen.</p>
        </div>
        <div className="flex items-center gap-3">
          {view === "privacy" ? (
            <button
              type="button"
              onClick={() => setView(privacyReturn)}
              className={HEADER_BUTTON_CLASS}
            >
              Back to {privacyReturn === "library" ? "the Library" : "the Editor"}
            </button>
          ) : view === "settings" ? (
            <button
              type="button"
              onClick={() => setView(settingsReturn)}
              className={HEADER_BUTTON_CLASS}
            >
              Back to {settingsReturn === "library" ? "the Library" : "the Editor"}
            </button>
          ) : (
            <>
              {view === "library" && (
                <button
                  type="button"
                  onClick={() => setView("editor")}
                  className={HEADER_BUTTON_CLASS}
                >
                  Back to the Editor
                </button>
              )}
              {view === "workbench" && (
                <button
                  type="button"
                  onClick={() => setView(workbenchReturn)}
                  className={HEADER_BUTTON_CLASS}
                >
                  Back to the {workbenchReturn === "library" ? "Library" : "Editor"}
                </button>
              )}
              {view === "editor" && (
                <>
                  <p className="text-xs text-stone-500">{document?.wordCount ?? 0} words</p>
                  <label className={`cursor-pointer ${HEADER_BUTTON_CLASS}`}>
                    Import Markdown
                    <input
                      type="file"
                      accept=".md,.markdown,text/markdown"
                      className="sr-only"
                      onChange={(event) => void onImport(event)}
                    />
                  </label>
                  <button type="button" onClick={onExport} className={HEADER_BUTTON_CLASS}>
                    Export Markdown
                  </button>
                  <button type="button" onClick={goToLibrary} className={HEADER_BUTTON_CLASS}>
                    Library
                  </button>
                </>
              )}
              {view !== "workbench" && (
                <button type="button" onClick={openWorkbench} className={HEADER_BUTTON_CLASS}>
                  Pass workbench
                </button>
              )}
              <button type="button" onClick={openSettings} className={HEADER_BUTTON_CLASS}>
                AI Settings
              </button>
              <button type="button" onClick={openPrivacy} className={HEADER_BUTTON_CLASS}>
                Privacy
              </button>
            </>
          )}
        </div>
      </header>

      {saveError !== null && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900">
          Could not save your Document: {saveError}
        </div>
      )}

      {importError !== null && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900">
          Could not import that Markdown: {importError}
        </div>
      )}

      {view === "library" && (
        <LibraryView
          entries={library}
          activeDocumentId={document?.id ?? null}
          onOpen={openFromLibrary}
          onCreate={startNewDocument}
          onStatus={(id, status) => void setDocumentStatus(id, status)}
          onTags={(id, tags) => void setDocumentTags(id, tags)}
          lastBackedUp={lastBackedUp}
          backupError={backupError}
          onBackup={(includeKeys) => void onBackupLibrary(includeKeys)}
          onRestore={onRestoreLibrary}
          onExportBundle={(documentId) => void onExportBundle(documentId)}
          onImportBundle={(json) => void onImportBundle(json)}
          onDismissBackupError={clearBackupError}
        />
      )}

      {view === "privacy" && <PrivacyView />}

      {view === "settings" && (
        <AiSettingsView
          connections={connections}
          slots={slots}
          judgeIsDefault={judgeIsDefault}
          judgeDefaultName={judgeIsDefault ? (judgeConnection?.name ?? null) : null}
          screeningFrame={screeningFrame}
          characterLimit={characterLimit}
          voiceList={voiceList}
          priceTable={priceTable}
          onSaveConnection={(connection) => void saveConnection(connection)}
          onAddCustom={() => void addCustomConnection()}
          onRemoveConnection={(connectionId) => void removeConnection(connectionId)}
          onAssignSlot={(slot, binding) => void assignSlot(slot, binding)}
          onToggleScreening={(enabled) => void setScreeningFrame(enabled)}
          onSetCharacterLimit={(limit) => void setCharacterLimit(limit)}
          onSaveVoiceList={(entries) => void setVoiceList(entries)}
          onSavePriceTable={(table) => void savePriceTable(table)}
        />
      )}

      {view === "workbench" && (
        <WorkbenchView
          passes={passes}
          passSetError={passSetError}
          onClearPassSetError={clearPassSetError}
          onSavePass={savePass}
          onNewPass={newPassDraft}
          onExport={onExportPassSet}
          onImport={importPassSet}
          onRestore={restoreStarterPack}
          onToggle={(passId, enabled) => void togglePass(passId, enabled)}
          onSaveRuleConfig={(passId, ruleConfig) => void saveRuleConfig(passId, ruleConfig)}
          assistantRunning={assistantRunning}
          assistantError={assistantError}
          onAssist={runPromptAssistant}
          criticName={criticConnection?.name ?? null}
        />
      )}

      {view === "editor" && (
        <div className="flex min-h-0 flex-1">
          <main className="flex min-h-0 flex-1 flex-col bg-white">
            {document !== null && (
              <>
                <DocumentTitleField
                  key={document.id}
                  title={document.title}
                  onCommit={(title) => void renameDocument(document.id, title)}
                />
                <DocumentEditor
                  key={`${document.id}:${editorGeneration}`}
                  initialContent={document.tree}
                  onChange={handleChange}
                  highlights={highlights}
                  onTargetChange={setTargetBlockIndex}
                  onSelectionChange={setSelectionInterval}
                  jumpRequest={jumpRequest}
                />
              </>
            )}
          </main>

          <WorkingOrderRail
            handle={handle}
            outlineSections={outlineSections}
            activeHeadingBlockIndex={activeSection?.headingBlockIndex ?? null}
            onJumpToSection={jumpToSection}
            currentFindingId={currentFindingId}
            onSelectFinding={setCurrentFindingId}
            showRawResponse={showRawResponse}
            onToggleRawResponse={setShowRawResponse}
            selection={selection}
            section={section}
            milestoneNote={milestoneNote}
            onMilestoneNoteChange={setMilestoneNote}
            onFlagMilestone={() => void onFlagMilestone()}
            milestonesOnly={milestonesOnly}
            onMilestonesOnlyChange={setMilestonesOnly}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The Document's title, editable in place. It is the Writer's name for the
 * Document, never a model's (story 74): the field commits on blur or Enter and
 * holds no generated text.
 */
function DocumentTitleField({
  title,
  onCommit,
}: {
  title: string;
  onCommit: (title: string) => void;
}) {
  const [draft, setDraft] = useState(title);

  const commit = () => {
    const next = draft.trim() === "" ? "Untitled" : draft.trim();
    if (next !== title) onCommit(next);
    if (next !== draft) setDraft(next);
  };

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      aria-label="Document title"
      placeholder="Untitled"
      className="border-b border-stone-200 bg-white px-8 py-3 text-xl font-semibold tracking-tight text-stone-900 focus:outline-none"
    />
  );
}

/** Saves a string as a download. Local only: no request leaves the browser. */
function downloadText(filename: string, text: string, mime = "text/plain;charset=utf-8"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** A date stamp for a download filename, e.g. `2026-09-19`. */
function fileStamp(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function slug(title: string): string {
  const cleaned = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned === "" ? "document" : cleaned;
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 text-center">
      {children}
    </div>
  );
}
