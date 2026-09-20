import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import type { Interval } from "./core/finding";
import { selectionAnchor as selectionAnchorFor } from "./core/judgeSelection";
import { isReaderPass } from "./core/pass";
import { sectionAt, sections } from "./core/sections";
import { DocumentEditor } from "./editor/DocumentEditor";
import { openFindings, selectionAfterLeavingQueue, stepSelection } from "./editor/findingQueue";
import { FindingsSidebar } from "./editor/FindingsSidebar";
import { JudgePanel } from "./editor/JudgePanel";
import { LibraryView } from "./library/LibraryView";
import { PrivacyView } from "./privacy/PrivacyView";
import { MetricsPanel } from "./editor/MetricsPanel";
import { ModelPassesPanel } from "./editor/ModelPassesPanel";
import { OutlinePanel } from "./editor/OutlinePanel";
import { ReaderPanel } from "./editor/ReaderPanel";
import { RulePassesPanel } from "./editor/RulePassesPanel";
import { describeError } from "./errors";
import { useDocument } from "./useDocument";
import { ConnectionsPanel } from "./wire/ConnectionsPanel";

/**
 * The Obelus shell. It opens the one Document of record and puts the Writer
 * straight into it: no account, no sign-in. Connections are configured in the
 * sidebar; nothing is sent anywhere until the Writer tests a Connection or runs
 * a pass through one.
 */
export default function App() {
  const {
    status,
    openError,
    saveError,
    document,
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
    runModelPass,
    runStructuralSet,
    screeningFrame,
    setScreeningFrame,
    characterLimit,
    setCharacterLimit,
    documentChunks,
    rawResponses,
    readerAccounts,
    readerRunning,
    readerStartedAt,
    readerError,
    runReaderPass,
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
    backupLibrary,
    restoreLibrary,
    exportBundle,
    importBundle,
    lastBackedUp,
    backupError,
    clearBackupError,
  } = useDocument();
  const [milestoneNote, setMilestoneNote] = useState("");
  const [milestonesOnly, setMilestonesOnly] = useState(false);
  /** Story 20: the Library is a view of its own; the Editor is the default. */
  const [view, setView] = useState<"editor" | "library" | "privacy">("editor");
  /** Which view the Privacy page returns to when the Writer leaves it. */
  const [privacyReturn, setPrivacyReturn] = useState<"editor" | "library">("editor");
  const [currentFindingId, setCurrentFindingId] = useState<string | null>(null);
  const [showRawResponse, setShowRawResponse] = useState(false);
  /** Stories 91–93: the sidebar's two tabs keep Reader output apart from the queue. */
  const [sidebarTab, setSidebarTab] = useState<"findings" | "reader">("findings");
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

  const openQueue = useMemo(() => openFindings(findings, passes), [findings, passes]);
  const currentFinding = openQueue.find((finding) => finding.id === currentFindingId) ?? null;

  /** The Passes whose output shape is a Reader account; the Reader tab owns them. */
  const readerPasses = useMemo(
    () => passes.filter((pass) => pass.kind === "model" && isReaderPass(pass)),
    [passes],
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

  /**
   * Runs a queue write and, when it stored, moves the selection to the Finding
   * that slid into the vacated slot, so the Writer keeps their place. The queue
   * from before the write is captured here rather than at each call site.
   */
  const leaveQueue = useCallback(
    (findingId: string, write: () => Promise<boolean>) => {
      const before = openQueue;
      return write().then((written) => {
        if (written) setCurrentFindingId(selectionAfterLeavingQueue(before, findingId));
      });
    },
    [openQueue],
  );

  // The queue's keys are only live when the Writer is not typing. `j`, `k`, `a`
  // and `x` are ordinary letters: while the Editor or a field has focus they
  // must reach the prose, so the Writer clicks a Finding (or tabs to one) to
  // put focus in the queue.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      // The queue's keys belong to the Findings tab. On the Reader tab the
      // queue is not on screen, so a stray `a`/`x`/`v` must not mutate it
      // invisibly.
      if (sidebarTab !== "findings") return;

      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        setCurrentFindingId(stepSelection(openQueue, currentFindingId, event.key === "j" ? 1 : -1));
        return;
      }

      if (currentFinding === null) return;

      if (event.key === "a") {
        event.preventDefault();
        void leaveQueue(currentFinding.id, () => markAddressed(currentFinding.id));
        return;
      }

      if (event.key === "x") {
        event.preventDefault();
        void leaveQueue(currentFinding.id, () => decline(currentFinding.id));
        return;
      }

      if (event.key === "v" && (currentFinding.violations?.length ?? 0) > 0) {
        event.preventDefault();
        void leaveQueue(currentFinding.id, () => decline(currentFinding.id, "violation"));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openQueue, currentFindingId, currentFinding, leaveQueue, markAddressed, decline, sidebarTab]);

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

  const visibleRevisions = milestonesOnly
    ? revisions.filter((revision) => revision.flagged)
    : revisions;

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
              className="rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
            >
              Back to {privacyReturn === "library" ? "the Library" : "the Editor"}
            </button>
          ) : (
            <>
              {view === "library" ? (
                <button
                  type="button"
                  onClick={() => setView("editor")}
                  className="rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
                >
                  Back to the Editor
                </button>
              ) : (
                <>
                  <p className="text-xs text-stone-500">{document?.wordCount ?? 0} words</p>
                  <label className="cursor-pointer rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100">
                    Import Markdown
                    <input
                      type="file"
                      accept=".md,.markdown,text/markdown"
                      className="sr-only"
                      onChange={(event) => void onImport(event)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={onExport}
                    className="rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
                  >
                    Export Markdown
                  </button>
                  <button
                    type="button"
                    onClick={goToLibrary}
                    className="rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
                  >
                    Library
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={openPrivacy}
                className="rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
              >
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

        <aside className="flex w-96 flex-col overflow-y-auto border-l border-stone-200 bg-stone-100/60">
          <OutlinePanel
            sections={outlineSections}
            activeHeadingBlockIndex={activeSection?.headingBlockIndex ?? null}
            onJump={jumpToSection}
          />

          <MetricsPanel canonical={document?.canonical ?? ""} />

          <section className="border-b border-stone-300 bg-stone-100/60">
            <div className="flex items-center justify-between border-b border-stone-200 pr-4">
              <div className="flex" role="tablist" aria-label="Analysis views">
                <SidebarTab
                  label="Findings"
                  active={sidebarTab === "findings"}
                  onClick={() => setSidebarTab("findings")}
                />
                <SidebarTab
                  label="Reader accounts"
                  active={sidebarTab === "reader"}
                  onClick={() => setSidebarTab("reader")}
                />
              </div>
              {sidebarTab === "findings" ? (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-stone-600">
                    <input
                      type="checkbox"
                      checked={showRawResponse}
                      onChange={(event) => setShowRawResponse(event.target.checked)}
                    />
                    Raw response
                  </label>
                  <span className="text-xs text-stone-500">{openQueue.length} open</span>
                </div>
              ) : (
                <span className="text-xs text-stone-500">
                  {readerAccounts.length} account{readerAccounts.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {sidebarTab === "findings" ? (
              <FindingsSidebar
                findings={findings}
                passes={passes}
                currentFindingId={currentFindingId}
                onSelect={setCurrentFindingId}
                showRawResponse={showRawResponse}
                rawResponses={rawResponses}
                onDecline={(findingId, reason) =>
                  void leaveQueue(findingId, () => decline(findingId, reason))
                }
              />
            ) : (
              <ReaderPanel
                passes={readerPasses}
                accounts={readerAccounts}
                running={readerRunning}
                runningSince={readerStartedAt}
                error={readerError}
                criticName={criticConnection?.name ?? null}
                onRun={(passId) => void runReaderPass(passId)}
                onToggle={(passId, enabled) => void togglePass(passId, enabled)}
              />
            )}
          </section>

          <RulePassesPanel
            passes={passes}
            onToggle={(passId, enabled) => void togglePass(passId, enabled)}
            onSaveConfig={(passId, ruleConfig) => void saveRuleConfig(passId, ruleConfig)}
          />

          <ModelPassesPanel
            passes={passes}
            runningPassId={runningPassId}
            structuralRunning={structuralRunning}
            runningSince={runStartedAt}
            lastRunReport={lastRunReport}
            runError={runError}
            criticName={criticConnection?.name ?? null}
            screeningFrame={screeningFrame}
            documentLength={document?.canonical.length ?? 0}
            characterLimit={characterLimit}
            chunkCount={documentChunks}
            onRun={(passId) => void runModelPass(passId)}
            onRunStructural={() => void runStructuralSet()}
            onToggle={(passId, enabled) => void togglePass(passId, enabled)}
            onToggleScreening={(enabled) => void setScreeningFrame(enabled)}
            onSetCharacterLimit={(limit) => void setCharacterLimit(limit)}
          />

          <ConnectionsPanel
            connections={connections}
            slots={slots}
            onSave={(connection) => void saveConnection(connection)}
            onAddCustom={() => void addCustomConnection()}
            onRemove={(connectionId) => void removeConnection(connectionId)}
            onAssignSlot={(slot, connectionId) => void assignSlot(slot, connectionId)}
          />

          <JudgePanel
            revisions={revisions}
            currentCanonical={document?.canonical ?? ""}
            selection={selection}
            section={section}
            judge={judgeConnection}
            judgeIsDefault={judgeIsDefault}
            sameModelWarning={sameModelWarning}
            running={judgeRunning}
            error={judgeError}
            result={judgeResult}
            onJudge={(before, after) => void runJudge(before, after)}
          />

          <section className="border-t border-stone-300">
            <div className="space-y-3 border-b border-stone-200 p-4">
              <h2 className="text-sm font-semibold">Milestones</h2>
              <textarea
                value={milestoneNote}
                onChange={(event) => setMilestoneNote(event.target.value)}
                placeholder="Note for this milestone (optional)"
                rows={2}
                className="w-full resize-none rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void onFlagMilestone()}
                className="w-full rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-stone-50 hover:bg-stone-700"
              >
                Flag this Revision
              </button>
            </div>

            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2">
              <h2 className="text-sm font-semibold">Revisions</h2>
              <label className="flex items-center gap-1.5 text-xs text-stone-600">
                <input
                  type="checkbox"
                  checked={milestonesOnly}
                  onChange={(event) => setMilestonesOnly(event.target.checked)}
                />
                Milestones only
              </label>
            </div>

            <ol className="overflow-y-auto">
              {visibleRevisions.length === 0 && (
                <li className="px-4 py-4 text-sm text-stone-500">
                  {milestonesOnly
                    ? "No milestones yet. Flag one to make it findable later."
                    : "Revisions appear as you write."}
                </li>
              )}
              {visibleRevisions.map((revision) => (
                <li key={revision.id} className="border-b border-stone-200/70 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-stone-700">
                      {new Date(revision.createdAt).toLocaleString()}
                    </span>
                    {revision.flagged && (
                      <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-medium text-amber-900">
                        Milestone
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">{revision.wordCount} words</p>
                  {revision.note !== null && revision.note !== "" && (
                    <p className="mt-1 text-stone-700">{revision.note}</p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </aside>
        </div>
      )}
    </div>
  );
}

/**
 * The Document's title, editable in place. It is the Writer's name for the
 * piece, never a model's (story 74): the field commits on blur or Enter and
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

/** A sidebar tab: Findings stays the default, Reader its own view. */
function SidebarTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? "border-b-2 border-stone-900 px-4 py-2 text-sm font-semibold text-stone-900"
          : "border-b-2 border-transparent px-4 py-2 text-sm font-medium text-stone-500 hover:text-stone-700"
      }
    >
      {label}
    </button>
  );
}

/** A key event the queue owns must not steal from a field or the Editor. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
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
