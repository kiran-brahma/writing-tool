import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { blockIndexForInterval, type HighlightInterval } from "./core/anchor";
import { isOpenFinding, type DeclineReason, type Interval } from "./core/finding";
import { selectionAnchor as selectionAnchorFor } from "./core/judgeSelection";
import { sectionAt, sections } from "./core/sections";
import { DocumentEditor, type HighlightHit } from "./editor/DocumentEditor";
import { FindingCallout } from "./editor/FindingCallout";
import { FindingsRail } from "./editor/FindingsRail";
import { JudgeDialog } from "./editor/JudgeDialog";
import { MarginOutline } from "./editor/OutlinePanel";
import { StatusLine } from "./editor/StatusLine";
import { calloutFindings } from "./editor/callout";
import { railPresentation, RAIL_ELEMENT_ID } from "./editor/railPresentation";
import { useWideLayout } from "./editor/useWideLayout";
import { FIRST_RUN_NOTE } from "./help/helpContent";
import { LibraryView } from "./library/LibraryView";
import { SettingsView } from "./settings/SettingsView";
import { describeError } from "./errors";
import { useDocument } from "./useDocument";
import { useColorScheme } from "./settings/useColorScheme";
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
    storageNotice,
    dismissStorageNotice,
    document,
    library,
    refreshLibrary,
    openDocument,
    createDocument,
    renameDocument,
    deleteDocument,
    libraryError,
    clearLibraryError,
    passes,
    findings,
    highlights,
    targetBlockIndex,
    setTargetBlockIndex,
    connections,
    slots,
    judgeIsDefault,
    judgeConnection,
    sameModelWarning,
    judgeRunning,
    judgeError,
    judgeResult,
    runJudge,
    revisions,
    markAddressed,
    decline,
    reopen,
    clearFindings,
    flagMilestone,
    handleChange,
    importFromMarkdown,
    exportToMarkdown,
    importBundle,
    backupLibrary,
    restoreLibrary,
    lastBackedUp,
    backupError,
    clearBackupError,
    runError,
    cancelRun,
    firstRunNoteDismissed,
    dismissFirstRunNote,
    colorScheme,
    setColorScheme,
    saveConnection,
    addCustomConnection,
    removeConnection,
    assignSlot,
    saveRuleConfig,
    restoreStarterPack,
    passSetError,
    clearPassSetError,
    railCollapsed,
    setRailCollapsed,
    reviewParagraph,
    runningPassId,
  } = handle;
  useColorScheme(colorScheme);

  const [view, setView] = useState<DestinationId>("editor");
  const [currentFindingId, setCurrentFindingId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [selectionInterval, setSelectionInterval] = useState<Interval | null>(null);
  const [judgeOpen, setJudgeOpen] = useState(false);
  const [jumpRequest, setJumpRequest] = useState<{
    blockIndex: number;
    nonce: number;
    focus?: boolean;
  } | null>(null);

  const wide = useWideLayout();
  const [overlayOpen, setOverlayOpen] = useState(false);
  useEffect(() => {
    if (wide) setOverlayOpen(false);
  }, [wide]);
  const presentation = railPresentation(wide, railCollapsed, overlayOpen);
  const showRail = useCallback(() => {
    if (wide) void setRailCollapsed(false);
    else setOverlayOpen(true);
  }, [wide, setRailCollapsed]);
  const hideRail = useCallback(() => {
    if (wide) void setRailCollapsed(true);
    else setOverlayOpen(false);
  }, [wide, setRailCollapsed]);

  const openFindingCount = useMemo(
    () => findings.filter(isOpenFinding).length,
    [findings],
  );

  const outlineSections = useMemo(
    () => (document === null ? [] : sections(document.tree)),
    [document],
  );
  const activeSection = useMemo(
    () => (document === null ? null : sectionAt(document.tree, targetBlockIndex)),
    [document, targetBlockIndex],
  );
  const jumpToSection = useCallback((blockIndex: number) => {
    setJumpRequest((current) => ({ blockIndex, nonce: (current?.nonce ?? 0) + 1 }));
  }, []);

  const editorHighlights = useMemo<HighlightInterval[]>(
    () =>
      highlights.map((highlight) => ({
        findingId: highlight.findingId,
        interval: highlight.interval,
        current: highlight.findingId === currentFindingId,
      })),
    [highlights, currentFindingId],
  );

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
        focus: false,
      }));
    },
    [document, highlights],
  );

  const [calloutHit, setCalloutHit] = useState<HighlightHit | null>(null);
  const calloutEntries = useMemo(
    () => (calloutHit === null ? [] : calloutFindings(calloutHit.findingIds, findings)),
    [calloutHit, findings],
  );
  const closeCallout = useCallback(() => setCalloutHit(null), []);
  const calloutOpen = calloutHit !== null && calloutEntries.length > 0;
  const openCallout = useCallback((hit: HighlightHit | null) => setCalloutHit(hit), []);

  const leaveQueueFromCallout = useCallback(
    (findingId: string, write: () => Promise<boolean>) => {
      void write().then((written) => {
        if (!written) return;
        setCurrentFindingId((current) => (current === findingId ? null : current));
      });
    },
    [],
  );
  const addressFromCallout = useCallback(
    (findingId: string) => leaveQueueFromCallout(findingId, () => markAddressed(findingId)),
    [leaveQueueFromCallout, markAddressed],
  );
  const declineFromCallout = useCallback(
    (findingId: string, reason: DeclineReason) =>
      leaveQueueFromCallout(findingId, () => decline(findingId, reason)),
    [leaveQueueFromCallout, decline],
  );

  const goToLibrary = useCallback(() => {
    setView("library");
    void refreshLibrary();
  }, [refreshLibrary]);

  const navigateTo = useCallback(
    (destination: DestinationId) => {
      if (destination === "library") goToLibrary();
      else setView(destination);
    },
    [goToLibrary],
  );

  const openHelp = useCallback(() => {
    setView("settings");
    window.setTimeout(() => {
      window.document.getElementById("settings-help")?.scrollIntoView({ behavior: "smooth" });
    }, 0);
  }, []);

  const leaveEditor = useCallback(() => {
    setCurrentFindingId(null);
    setSelectionInterval(null);
    setJumpRequest(null);
    setCalloutHit(null);
    setJudgeOpen(false);
    setTargetBlockIndex(0);
    setEditorGeneration((generation) => generation + 1);
  }, [setTargetBlockIndex]);

  const openFromLibrary = useCallback(
    (documentId: string) => {
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

  const deleteFromLibrary = useCallback(
    async (documentId: string) => {
      const deleted = await deleteDocument(documentId);
      if (deleted && documentId === document?.id) leaveEditor();
      return deleted;
    },
    [deleteDocument, document?.id, leaveEditor],
  );

  const selection = useMemo(() => {
    if (document === null || selectionInterval === null) return null;
    return selectionAnchorFor(document.canonical, selectionInterval);
  }, [document, selectionInterval]);

  const section = useMemo(() => {
    if (document === null || activeSection === null) return null;
    return selectionAnchorFor(document.canonical, activeSection.interval);
  }, [document, activeSection]);

  const onBackupLibrary = useCallback(() => {
    void backupLibrary(false, (json) => {
      downloadText(`obelus-library-${fileStamp()}.json`, json, "application/json;charset=utf-8");
    });
  }, [backupLibrary]);

  const onRestoreLibrary = useCallback(
    async (json: string) => {
      const restored = await restoreLibrary(json);
      if (restored) leaveEditor();
      return restored;
    },
    [restoreLibrary, leaveEditor],
  );

  const onImportBundle = useCallback(
    async (json: string) => {
      const id = await importBundle(json);
      if (id === null) return;
      leaveEditor();
      setView("editor");
    },
    [importBundle, leaveEditor],
  );

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

  if (status === "loading") {
    return (
      <CenteredMessage>
        <p className="text-faint-ink">Opening your Library…</p>
      </CenteredMessage>
    );
  }

  if (status === "error") {
    return (
      <CenteredMessage>
        <h1 className="text-lg font-semibold text-ink">Obelus could not open your Library</h1>
        <p className="mt-2 max-w-md text-sm text-muted-ink">{openError}</p>
      </CenteredMessage>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-ground text-ink">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-rule-soft bg-ground px-3 py-2.5 text-ink sm:gap-x-4 sm:px-6">
        <div className="shrink-0">
          <h1 className="text-base font-semibold tracking-tight text-ink">Obelus</h1>
          <p className="hidden text-xs text-faint-ink sm:block">It marks; it never holds the pen.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-4">
          <DocumentMenu
            onExport={onExport}
            onImport={onImport}
            onFlagVersion={() => void flagMilestone("")}
            onNew={startNewDocument}
            canExport={document !== null}
            canFlag={document !== null}
          />
          {view === "editor" && document !== null && (
            <button
              type="button"
              aria-expanded={presentation !== "hidden"}
              aria-controls={RAIL_ELEMENT_ID}
              title={presentation === "hidden" ? "Open the findings rail" : "Close the findings rail"}
              onClick={presentation === "hidden" ? showRail : hideRail}
              className="flex shrink-0 items-center gap-1.5 rounded border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-quiet-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus transition-colors"
            >
              <span>Findings</span>
              <span aria-hidden="true" className="tabular-nums text-faint-ink">
                {openFindingCount}
              </span>
            </button>
          )}
          <nav aria-label="Main navigation" className="flex items-center gap-1">
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
                    "rounded px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                    isCurrent
                      ? "bg-ink font-semibold text-on-ink focus-visible:ring-offset-2"
                      : "font-medium text-quiet-ink hover:bg-sunk-strong hover:text-ink",
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
        <div className="border-b border-failure-rule bg-failure-surface px-6 py-2 text-sm text-failure">
          Could not save your document: {saveError}
        </div>
      )}

      {runError !== null && (
        <div className="border-b border-failure-rule bg-failure-surface px-6 py-2 text-sm text-failure">
          {runError}
        </div>
      )}

      {storageNotice !== null && (
        <div className="flex items-center justify-between gap-4 border-b border-warning-rule bg-warning-surface px-6 py-2 text-sm text-warning">
          <span>{storageNotice}</span>
          <button
            type="button"
            onClick={dismissStorageNotice}
            className="shrink-0 rounded border border-warning-rule-strong px-2 py-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-focus"
          >
            Dismiss
          </button>
        </div>
      )}

      {importError !== null && (
        <div className="border-b border-failure-rule bg-failure-surface px-6 py-2 text-sm text-failure">
          Could not import that markdown: {importError}
        </div>
      )}

      {view === "library" && (
        <LibraryView
          entries={library}
          activeDocumentId={document?.id ?? null}
          onOpen={openFromLibrary}
          onCreate={startNewDocument}
          lastBackedUp={lastBackedUp}
          backupError={backupError}
          error={libraryError}
          onDelete={deleteFromLibrary}
          onDismissError={clearLibraryError}
          onBackup={onBackupLibrary}
          onRestore={onRestoreLibrary}
          onImportBundle={(json) => void onImportBundle(json)}
          onDismissBackupError={clearBackupError}
        />
      )}

      {view === "settings" && (
        <SettingsView
          connections={connections}
          slots={slots}
          judgeIsDefault={judgeIsDefault}
          judgeDefaultName={judgeConnection?.name ?? null}
          passes={passes}
          colorScheme={colorScheme}
          passSetError={passSetError}
          onClearPassSetError={clearPassSetError}
          onSaveConnection={(connection) => void saveConnection(connection)}
          onAddCustom={() => void addCustomConnection()}
          onRemoveConnection={(connectionId) => void removeConnection(connectionId)}
          onAssignSlot={(slot, binding) => void assignSlot(slot, binding)}
          onSetColorScheme={(setting) => void setColorScheme(setting)}
          onSaveRuleConfig={(passId, ruleConfig) => void saveRuleConfig(passId, ruleConfig)}
          onRestoreDefaults={() => void restoreStarterPack()}
        />
      )}

      {view === "editor" && (
        <div className="flex min-h-0 flex-1">
          <main className="flex min-h-0 flex-1 flex-col bg-paper">
            {document === null ? (
              <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-3 px-6 py-12">
                <h2 className="text-lg font-semibold text-ink">Obelus opened no Document</h2>
                <p className="text-sm text-muted-ink">
                  The Library opened, but no Document was loaded. Open the Library to choose one,
                  or reload Obelus.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={goToLibrary}
                    className="rounded bg-ink px-3 py-1.5 text-sm font-medium text-on-ink hover:bg-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                  >
                    Open the Library
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rounded border border-rule bg-paper px-3 py-1.5 text-sm font-medium text-quiet-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    Reload
                  </button>
                </div>
              </div>
            ) : (
              <>
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
                <DocumentEditor
                  key={`${document.id}:${editorGeneration}`}
                  initialContent={document.tree}
                  onChange={handleChange}
                  highlights={editorHighlights}
                  highlightsResolvedAgainst={document.canonical}
                  onTargetChange={setTargetBlockIndex}
                  onSelectionChange={setSelectionInterval}
                  jumpRequest={jumpRequest}
                  onHighlightClick={openCallout}
                  calloutOpen={calloutOpen}
                  leftMargin={
                    <MarginOutline
                      sections={outlineSections}
                      activeHeadingBlockIndex={activeSection?.headingBlockIndex ?? null}
                      onJump={jumpToSection}
                    />
                  }
                  pageHeading={
                    <DocumentTitleField
                      key={document.id}
                      title={document.title}
                      onCommit={(title) => void renameDocument(document.id, title)}
                    />
                  }
                />
                <StatusLine
                  wordCount={document.wordCount}
                  rail={{
                    openFindingCount,
                    open: presentation !== "hidden",
                    onToggle: presentation === "hidden" ? showRail : hideRail,
                  }}
                  onReview={() => void reviewParagraph()}
                  reviewRunning={runningPassId !== null}
                  canReview={document.canonical.trim() !== ""}
                  onCancel={cancelRun}
                  onCompare={() => setJudgeOpen(true)}
                  canCompare={revisions.length >= 2}
                />
                {calloutOpen && calloutHit !== null && (
                  <FindingCallout
                    findings={calloutEntries}
                    rect={calloutHit.rect}
                    onAddress={addressFromCallout}
                    onDecline={declineFromCallout}
                    onClose={closeCallout}
                  />
                )}
              </>
            )}
          </main>

          <FindingsRail
            findings={findings}
            passes={passes}
            currentFindingId={currentFindingId}
            onSelectFinding={selectFinding}
            onAddress={markAddressed}
            onDecline={decline}
            onReopen={reopen}
            onClearFindings={clearFindings}
            presentation={presentation}
            onHideRail={hideRail}
          />

          {document !== null && (
            <JudgeDialog
              open={judgeOpen}
              onClose={() => setJudgeOpen(false)}
              revisions={revisions}
              currentCanonical={document.canonical}
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
          )}
        </div>
      )}
    </div>
  );
}

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
      className="mb-6 block w-full rounded-sm bg-transparent font-page text-[2rem] leading-tight font-semibold text-ink placeholder:text-ghost-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-4"
    />
  );
}

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
    <aside className="border-b border-rule-soft bg-ground px-8 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">{heading}</h2>
          {body.map((paragraph) => (
            <p key={paragraph} className="mt-1 text-sm leading-relaxed text-muted-ink">
              {paragraph}
            </p>
          ))}
          <button
            type="button"
            onClick={onAction}
            className="mt-2 rounded text-sm font-medium text-link underline underline-offset-2 hover:text-link-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {actionLabel}
          </button>
        </div>
        {onDismiss !== undefined && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-quiet-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {dismissLabel}
          </button>
        )}
      </div>
    </aside>
  );
}

function downloadText(filename: string, text: string, mime = "text/plain;charset=utf-8"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function fileStamp(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function slug(title: string): string {
  const cleaned = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned === "" ? "document" : cleaned;
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ground text-center">
      {children}
    </div>
  );
}
