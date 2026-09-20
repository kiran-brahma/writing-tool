import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { DocumentEditor } from "./editor/DocumentEditor";
import { openFindings, selectionAfterLeavingQueue, stepSelection } from "./editor/findingQueue";
import { FindingsSidebar } from "./editor/FindingsSidebar";
import { MetricsPanel } from "./editor/MetricsPanel";
import { ModelPassesPanel } from "./editor/ModelPassesPanel";
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
    findings,
    passes,
    highlights,
    setTargetBlockIndex,
    runningPassId,
    runStartedAt,
    runError,
    lastRun,
    runModelPass,
    screeningFrame,
    setScreeningFrame,
    rawResponses,
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
  } = useDocument();
  const [milestoneNote, setMilestoneNote] = useState("");
  const [milestonesOnly, setMilestonesOnly] = useState(false);
  const [currentFindingId, setCurrentFindingId] = useState<string | null>(null);
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  // The Editor is uncontrolled, so an import remounts it rather than trying to
  // push a new document into an editor that already has one.
  const [editorGeneration, setEditorGeneration] = useState(0);

  const openQueue = useMemo(() => openFindings(findings, passes), [findings, passes]);
  const currentFinding = openQueue.find((finding) => finding.id === currentFindingId) ?? null;

  // The queue's keys are only live when the Writer is not typing. `j`, `k`, `a`
  // and `x` are ordinary letters: while the Editor or a field has focus they
  // must reach the prose, so the Writer clicks a Finding (or tabs to one) to
  // put focus in the queue.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        setCurrentFindingId(stepSelection(openQueue, currentFindingId, event.key === "j" ? 1 : -1));
        return;
      }

      if (currentFinding === null) return;

      if (event.key === "a") {
        event.preventDefault();
        const before = openQueue;
        void markAddressed(currentFinding.id).then((written) => {
          if (written) setCurrentFindingId(selectionAfterLeavingQueue(before, currentFinding.id));
        });
        return;
      }

      if (event.key === "x") {
        event.preventDefault();
        const before = openQueue;
        void decline(currentFinding.id).then((written) => {
          if (written) setCurrentFindingId(selectionAfterLeavingQueue(before, currentFinding.id));
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openQueue, currentFindingId, currentFinding, markAddressed, decline]);

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
    downloadText(`${slug(document?.title ?? "document")}.md`, exportToMarkdown());
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

      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 flex-1 flex-col bg-white">
          {document !== null && (
            <DocumentEditor
              key={`${document.id}:${editorGeneration}`}
              initialContent={document.tree}
              onChange={handleChange}
              highlights={highlights}
              onTargetChange={setTargetBlockIndex}
            />
          )}
        </main>

        <aside className="flex w-96 flex-col overflow-y-auto border-l border-stone-200 bg-stone-100/60">
          <MetricsPanel canonical={document?.canonical ?? ""} />

          <section className="border-b border-stone-300 bg-stone-100/60">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2">
              <h2 className="text-sm font-semibold">Findings</h2>
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
            </div>
            <FindingsSidebar
              findings={findings}
              passes={passes}
              currentFindingId={currentFindingId}
              onSelect={setCurrentFindingId}
              showRawResponse={showRawResponse}
              rawResponses={rawResponses}
            />
          </section>

          <RulePassesPanel
            passes={passes}
            onToggle={(passId, enabled) => void togglePass(passId, enabled)}
            onSaveConfig={(passId, ruleConfig) => void saveRuleConfig(passId, ruleConfig)}
          />

          <ModelPassesPanel
            passes={passes}
            runningPassId={runningPassId}
            runningSince={runStartedAt}
            lastRun={lastRun}
            runError={runError}
            criticName={connections.find((connection) => connection.id === slots.critic)?.name ?? null}
            screeningFrame={screeningFrame}
            onRun={(passId) => void runModelPass(passId)}
            onToggleScreening={(enabled) => void setScreeningFrame(enabled)}
          />

          <ConnectionsPanel
            connections={connections}
            slots={slots}
            onSave={(connection) => void saveConnection(connection)}
            onAddCustom={() => void addCustomConnection()}
            onRemove={(connectionId) => void removeConnection(connectionId)}
            onAssignSlot={(slot, connectionId) => void assignSlot(slot, connectionId)}
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
    </div>
  );
}

/** A key event the queue owns must not steal from a field or the Editor. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

/** Saves a string as a download. Local only: no request leaves the browser. */
function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
