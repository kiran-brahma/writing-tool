import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { blockIndexForInterval, type HighlightInterval } from "./core/anchor";
import type { Interval } from "./core/finding";
import { selectionAnchor as selectionAnchorFor } from "./core/judgeSelection";
import { sectionAt, sections } from "./core/sections";
import { DocumentEditor } from "./editor/DocumentEditor";
import { isTypingTarget } from "./editor/typingTarget";
import { WorkingOrderRail } from "./editor/WorkingOrderRail";
import { HowThisWorksView } from "./help/HowThisWorksView";
import {
  FIRST_RUN_NOTE,
  HELP_SECTION_IDS,
  SCRATCHPAD_EMPTY_STATE,
  SHORTCUTS_KEY,
  type HelpSectionId,
} from "./help/helpContent";
import { LibraryView } from "./library/LibraryView";
import { PrivacyView } from "./privacy/PrivacyView";
import { SCRATCHPAD_DOCUMENT_ID } from "./storage/documents";
import { describeError } from "./errors";
import { useDocument } from "./useDocument";
import { AiSettingsView } from "./settings/AiSettingsView";
import { WorkbenchView } from "./workbench/WorkbenchView";
import { DocumentMenu } from "./DocumentMenu";
import {
  DESTINATIONS,
  isCurrentDestination,
  type DestinationId,
} from "./navigation";

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
    firstRunNoteDismissed,
    dismissFirstRunNote,
  } = handle;
  const [milestoneNote, setMilestoneNote] = useState("");
  const [milestonesOnly, setMilestonesOnly] = useState(false);
  /** Story 20 & 190: persistent destinations; the Editor is the default. */
  const [view, setView] = useState<DestinationId>("editor");
  /** Story 178: the section How this works should open at, or null for the top. */
  const [helpSection, setHelpSection] = useState<HelpSectionId | null>(null);
  const [currentFindingId, setCurrentFindingId] = useState<string | null>(null);
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  // The Editor is uncontrolled, so an import remounts it rather than trying to
  // push a new document into an editor that already has one.
  const [editorGeneration, setEditorGeneration] = useState(0);
  /** The Writer's current text selection, as a canonical interval. */
  const [selectionInterval, setSelectionInterval] = useState<Interval | null>(null);
  /** A heading the Writer asked to jump to; the nonce lets a repeat click move again. */
  const [jumpRequest, setJumpRequest] = useState<{
    blockIndex: number;
    nonce: number;
    focus?: boolean;
  } | null>(null);

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

  /** Every open Finding's interval, with the Current Finding's flagged for the Editor. */
  const editorHighlights = useMemo<HighlightInterval[]>(
    () =>
      highlights.map((highlight) => ({
        interval: highlight.interval,
        current: highlight.findingId === currentFindingId,
      })),
    [highlights, currentFindingId],
  );

  /**
   * Selects the Current Finding and moves the Editor to the prose it concerns.
   * The jump request's nonce changes on every selection, so re-selecting the
   * Finding already current moves the Editor again. An Orphaned Finding has no
   * interval and so no block to move to; selecting it changes the row and leaves
   * the prose where it is, which is never misleading.
   */
  const selectFinding = useCallback(
    (findingId: string | null) => {
      setCurrentFindingId(findingId);
      if (findingId === null || document === null) return;
      const interval =
        highlights.find((highlight) => highlight.findingId === findingId)?.interval ?? null;
      const blockIndex = blockIndexForInterval(document.tree, interval);
      if (blockIndex === null) return;
      setJumpRequest((current) => ({
        blockIndex,
        nonce: (current?.nonce ?? 0) + 1,
        // Working the queue must not move the keyboard into the prose, or the
        // next `j`/`k` would be typed into the Document instead of stepping.
        focus: false,
      }));
    },
    [document, highlights],
  );

  /**
   * Opens the Library, flushing pending edits first so its rows show stored word
   * counts and open-Finding counts rather than the state before the last save.
   */
  const goToLibrary = useCallback(() => {
    setView("library");
    void refreshLibrary();
  }, [refreshLibrary]);

  /**
   * How this works: the method, reachable from any destination, and
   * the destination the first-run note and a panel's gloss link to. Story 178's
   * `?` opens it straight at the shortcut list.
   */
  const openHelpSection = useCallback((sectionId: HelpSectionId | null) => {
    setHelpSection(sectionId);
    setView("help");
  }, []);
  const openHelp = useCallback(() => openHelpSection(null), [openHelpSection]);
  const openShortcuts = useCallback(
    () => openHelpSection(HELP_SECTION_IDS.shortcuts),
    [openHelpSection],
  );

  /**
   * Story 190: navigates directly to any of the six persistent destinations.
   * Moving to the Library flushes pending edits; moving to Help clears any
   * pinned section unless a gloss explicitly supplied one.
   */
  const navigateTo = useCallback(
    (destination: DestinationId) => {
      if (destination === "library") {
        goToLibrary();
      } else if (destination === "help") {
        openHelp();
      } else {
        setView(destination);
      }
    },
    [goToLibrary, openHelp],
  );



  // Story 178: `?` opens the shortcuts from anywhere, as long as the Writer is
  // not typing, where the question mark belongs to the text. The Editor's own
  // queue keys live in the rail; this is the one the whole shell binds.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== SHORTCUTS_KEY) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      openShortcuts();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openShortcuts]);

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
      setView("editor");
    } catch (error) {
      setImportError(describeError(error));
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900">
      <header className="flex items-center justify-between gap-3 sm:gap-4 border-b border-stone-200 px-3 sm:px-6 py-2.5 whitespace-nowrap overflow-x-auto min-w-0 bg-stone-50 text-stone-900">
        <div className="shrink-0">
          <h1 className="text-base font-semibold tracking-tight text-stone-900">Obelus</h1>
          <p className="hidden sm:block text-xs text-stone-500">It marks; it never holds the pen.</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <DocumentMenu
            wordCount={document?.wordCount ?? 0}
            onExport={onExport}
            onImport={onImport}
            canExport={document !== null}
          />
          <div className="h-4 w-px bg-stone-300" aria-hidden="true" />
          <nav aria-label="Main navigation" className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            {DESTINATIONS.map(({ id, label }) => {
              const isCurrent = isCurrentDestination(id, view);
              return (
                <button
                  key={id}
                  id={`nav-dest-${id}`}
                  type="button"
                  aria-current={isCurrent ? "page" : undefined}
                  onClick={() => navigateTo(id)}
                  className={[
                    "rounded px-2 sm:px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600",
                    isCurrent
                      ? "bg-stone-900 font-semibold text-stone-50 shadow-xs"
                      : "text-stone-600 hover:bg-stone-200/70 hover:text-stone-900",
                  ].join(" ")}
                >
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {saveError !== null && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900">
          Could not save your document: {saveError}
        </div>
      )}

      {importError !== null && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900">
          Could not import that markdown: {importError}
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
          onOpenHelp={openHelpSection}
        />
      )}

      {view === "privacy" && <PrivacyView />}

      {view === "help" && <HowThisWorksView initialSectionId={helpSection} />}

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
          onOpenHelp={openHelpSection}
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
          onOpenHelp={openHelpSection}
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
                {!firstRunNoteDismissed && (
                  <EditorNote
                    heading={FIRST_RUN_NOTE.heading}
                    body={FIRST_RUN_NOTE.body}
                    actionLabel={FIRST_RUN_NOTE.helpLabel}
                    onAction={openHelp}
                    dismissLabel={FIRST_RUN_NOTE.dismissLabel}
                    onDismiss={() => void dismissFirstRunNote()}
                  />
                )}
                {document.id === SCRATCHPAD_DOCUMENT_ID && document.canonical.trim() === "" && (
                  <EditorNote
                    heading={SCRATCHPAD_EMPTY_STATE.heading}
                    body={SCRATCHPAD_EMPTY_STATE.body}
                    actionLabel={SCRATCHPAD_EMPTY_STATE.libraryLabel}
                    onAction={goToLibrary}
                  />
                )}
                <DocumentEditor
                  key={`${document.id}:${editorGeneration}`}
                  initialContent={document.tree}
                  onChange={handleChange}
                  highlights={editorHighlights}
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
            onSelectFinding={selectFinding}
            showRawResponse={showRawResponse}
            onToggleRawResponse={setShowRawResponse}
            selection={selection}
            section={section}
            milestoneNote={milestoneNote}
            onMilestoneNoteChange={setMilestoneNote}
            onFlagMilestone={() => void onFlagMilestone()}
            milestonesOnly={milestonesOnly}
            onMilestonesOnlyChange={setMilestonesOnly}
            onOpenHelp={openHelpSection}
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

/**
 * A note in the Editor body. Story 168's first-run note and story 170's empty
 * Scratchpad are one shape: a heading, a short body, one action, and optionally
 * a dismissal. It is not a modal; it sits in the writing surface, and it carries
 * no model text.
 */
function EditorNote({
  heading,
  body,
  actionLabel,
  onAction,
  dismissLabel,
  onDismiss,
}: {
  heading: string;
  body: readonly string[];
  actionLabel: string;
  onAction: () => void;
  dismissLabel?: string;
  onDismiss?: () => void;
}) {
  return (
    <aside className="border-b border-stone-200 bg-stone-50 px-8 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">{heading}</h2>
          {body.map((paragraph) => (
            <p key={paragraph} className="mt-1 text-sm leading-relaxed text-stone-600">
              {paragraph}
            </p>
          ))}
          <button
            type="button"
            onClick={onAction}
            className="mt-2 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
          >
            {actionLabel}
          </button>
        </div>
        {onDismiss !== undefined && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
          >
            {dismissLabel}
          </button>
        )}
      </div>
    </aside>
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
