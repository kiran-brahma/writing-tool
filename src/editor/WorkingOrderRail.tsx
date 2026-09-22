import { useCallback, useEffect, useMemo, useState } from "react";
import { emptyDocTree } from "../core/docTree";
import type { AnchorDraft } from "../core/finding";
import { structuralPasses, workingOrder, type WorkingOrderBand } from "../core/pass";
import type { Section } from "../core/sections";
import type { DocumentHandle } from "../useDocument";
import { BandPanel } from "./BandPanel";
import { openFindings, selectionAfterLeavingQueue, stepSelection } from "./findingQueue";
import { FindingsSidebar } from "./FindingsSidebar";
import { formatUsd } from "./formatUsd";
import { JudgePanel } from "./JudgePanel";
import { MetricsPanel } from "./MetricsPanel";
import { OutlinePanel } from "./OutlinePanel";

/**
 * ADR 0010: the rail's top-level control is the **Band** — Structure, Paragraph,
 * Word — plus **All**. Selecting a Band shows its Passes together with the
 * Findings those Passes produced, so a Run and its result are one view. The
 * Judge is its own destination below the Bands, visually separated, because it
 * is not part of the Working order.
 *
 * The rail is display over Core: `workingOrder` derives the Band partition of
 * both the Passes and the Findings, and this component only decides what to show
 * for the selection. It owns the queue keys, because the queue it steps is the
 * one on screen.
 */

/** The rail's top-level options: the three Bands, plus All. */
type RailSelection = WorkingOrderBand | "all";

const RAIL_SELECTIONS: readonly { value: RailSelection; label: string }[] = [
  { value: "structure", label: "Structure" },
  { value: "paragraph", label: "Paragraph" },
  { value: "word", label: "Word" },
  { value: "all", label: "All" },
];

export interface WorkingOrderRailProps {
  handle: DocumentHandle;
  /** Story 25: the Outline's Sections, derived from the Document's headings. */
  outlineSections: Section[];
  activeHeadingBlockIndex: number | null;
  onJumpToSection: (blockIndex: number) => void;
  currentFindingId: string | null;
  onSelectFinding: (findingId: string | null) => void;
  showRawResponse: boolean;
  onToggleRawResponse: (show: boolean) => void;
  /** The Selected span as an Anchor, or null when the selection is collapsed. */
  selection: AnchorDraft | null;
  /** The Section at the cursor as an Anchor, or null outside any Section. */
  section: AnchorDraft | null;
  milestoneNote: string;
  onMilestoneNoteChange: (note: string) => void;
  onFlagMilestone: () => void;
  milestonesOnly: boolean;
  onMilestonesOnlyChange: (milestonesOnly: boolean) => void;
}

export function WorkingOrderRail({
  handle,
  outlineSections,
  activeHeadingBlockIndex,
  onJumpToSection,
  currentFindingId,
  onSelectFinding,
  showRawResponse,
  onToggleRawResponse,
  selection,
  section,
  milestoneNote,
  onMilestoneNoteChange,
  onFlagMilestone,
  milestonesOnly,
  onMilestonesOnlyChange,
}: WorkingOrderRailProps) {
  const { passes, findings, railBand, railCollapsed, setRailBand, setRailCollapsed } = handle;
  /** **All** is not a Band, so it is a local override rather than stored state. */
  const [allSelected, setAllSelected] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);

  const railSelection: RailSelection = allSelected ? "all" : railBand;

  const order = useMemo(() => workingOrder(passes, findings), [passes, findings]);
  const selectedGroup = useMemo(
    () =>
      railSelection === "all"
        ? null
        : (order.groups.find((group) => group.band === railSelection) ?? null),
    [order, railSelection],
  );
  /** The Findings on screen: one Band's, or the whole queue for **All**. */
  const visibleFindings = useMemo(
    () => (railSelection === "all" ? order.all : (selectedGroup?.findings ?? [])),
    [order, railSelection, selectedGroup],
  );
  // The keys work the queue that is on screen, so `j`/`k` never land on a
  // Finding the Writer cannot see.
  const openQueue = useMemo(() => openFindings(visibleFindings, passes), [visibleFindings, passes]);
  const currentFinding = openQueue.find((finding) => finding.id === currentFindingId) ?? null;

  /** Moves the rail to a Band or **All**. Only a real Band is persisted. */
  const selectRail = useCallback(
    (next: RailSelection) => {
      setAllSelected(next === "all");
      if (next !== "all") void setRailBand(next);
    },
    [setRailBand],
  );

  const { markAddressed, decline } = handle;

  /**
   * Runs a queue write and, when it stored, moves the selection to the Finding
   * that slid into the vacated slot, so the Writer keeps their place.
   */
  const leaveQueue = useCallback(
    (findingId: string, write: () => Promise<boolean>) => {
      const before = openQueue;
      return write().then((written) => {
        if (written) onSelectFinding(selectionAfterLeavingQueue(before, findingId));
      });
    },
    [openQueue, onSelectFinding],
  );

  // The queue's keys are only live when the Writer is not typing and the rail is
  // showing the queue. `j`, `k`, `a` and `x` are ordinary letters: while the
  // Editor or a field has focus they must reach the prose.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (railCollapsed) return;

      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        onSelectFinding(stepSelection(openQueue, currentFindingId, event.key === "j" ? 1 : -1));
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
  }, [
    openQueue,
    currentFindingId,
    currentFinding,
    leaveQueue,
    markAddressed,
    decline,
    railCollapsed,
    onSelectFinding,
  ]);

  const hasStructuralPasses = structuralPasses(passes).length > 0;
  const runBusy = handle.runningPassId !== null || handle.structuralRunning;
  const documentLength = handle.document?.canonical.length ?? 0;
  const pastLimit = hasStructuralPasses && documentLength > handle.characterLimit;
  const visibleRevisions = milestonesOnly
    ? handle.revisions.filter((revision) => revision.flagged)
    : handle.revisions;

  if (railCollapsed) {
    return (
      <button
        type="button"
        onClick={() => void setRailCollapsed(false)}
        title="Show the rail"
        className="flex w-8 shrink-0 items-center justify-center border-l border-stone-200 bg-stone-100/60 text-xs font-medium text-stone-600 hover:bg-stone-200"
      >
        <span className="[writing-mode:vertical-rl]">Show rail</span>
      </button>
    );
  }

  return (
    <aside className="flex w-96 flex-col overflow-y-auto border-l border-stone-200 bg-stone-100/60">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-600">Rail</span>
        <button
          type="button"
          onClick={() => void setRailCollapsed(true)}
          className="text-xs text-stone-600 hover:text-stone-900"
        >
          Hide rail
        </button>
      </div>

      {/* Story 165: Outline and metrics, collapsible, above the Band control. */}
      <section className="border-b border-stone-300">
        <button
          type="button"
          onClick={() => setReferenceOpen((open) => !open)}
          aria-expanded={referenceOpen}
          className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-stone-200/50"
        >
          <span className="text-sm font-semibold">Reference</span>
          <span className="text-xs text-stone-500">
            {referenceOpen ? "Hide outline and metrics" : "Show outline and metrics"}
          </span>
        </button>
        {referenceOpen && (
          <>
            <OutlinePanel
              sections={outlineSections}
              activeHeadingBlockIndex={activeHeadingBlockIndex}
              onJump={onJumpToSection}
            />
            <MetricsPanel
              canonical={handle.document?.canonical ?? ""}
              tree={handle.document?.tree ?? emptyDocTree()}
            />
          </>
        )}
      </section>

      {/* ADR 0010: the Band is the navigation, plus All for the whole queue. */}
      <div
        role="tablist"
        aria-label="Bands of the Working order"
        className="flex border-b border-stone-300 bg-stone-100/60"
      >
        {RAIL_SELECTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`rail-tab-${value}`}
            aria-selected={railSelection === value}
            aria-controls={railSelection === value ? `rail-panel-${value}` : undefined}
            onClick={() => selectRail(value)}
            className={
              railSelection === value
                ? "flex-1 border-b-2 border-stone-900 px-2 py-2 text-sm font-semibold text-stone-900"
                : "flex-1 border-b-2 border-transparent px-2 py-2 text-sm font-medium text-stone-600 hover:text-stone-800"
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-1.5">
        <label className="flex items-center gap-1.5 text-xs text-stone-600">
          <input
            type="checkbox"
            checked={showRawResponse}
            onChange={(event) => onToggleRawResponse(event.target.checked)}
          />
          Raw response
        </label>
        <span className="text-xs text-stone-500">{openQueue.length} open</span>
      </div>

      {/* A model Run's failure is not about one Band, so it is not attributed to
          one; Cancel is reachable wherever the Run was started. */}
      {handle.runError !== null && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {handle.runError}
        </p>
      )}
      {runBusy && (
        <div className="border-b border-stone-200 px-4 py-2">
          <button
            type="button"
            onClick={handle.cancelRun}
            className="w-full rounded border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            Cancel run
          </button>
        </div>
      )}

      <div
        id={`rail-panel-${railSelection}`}
        role="tabpanel"
        aria-labelledby={`rail-tab-${railSelection}`}
        className="border-b border-stone-300"
      >
        {railSelection === "all" ? (
          <FindingsSidebar
            findings={findings}
            passes={passes}
            currentFindingId={currentFindingId}
            onSelect={onSelectFinding}
            showRawResponse={showRawResponse}
            rawResponses={handle.rawResponses}
            onDecline={(findingId, reason) =>
              void leaveQueue(findingId, () => decline(findingId, reason))
            }
          />
        ) : (
          <>
            {railSelection === "structure" && (
              <div className="border-b border-stone-200">
                <div className="flex items-center justify-between px-4 py-1.5 text-xs text-stone-600">
                  <span>This session</span>
                  <span className="tabular-nums">{formatUsd(handle.sessionCost)}</span>
                </div>
                <div className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => void handle.runStructuralSet()}
                    disabled={!hasStructuralPasses || runBusy}
                    title={
                      hasStructuralPasses
                        ? "Run every enabled document-scope Pass"
                        : "Enable a structural Pass first"
                    }
                    className="w-full rounded border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {handle.structuralRunning ? "Running structural set…" : "Run structural set"}
                  </button>
                </div>
                {pastLimit && (
                  <p className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                    This Document is {documentLength.toLocaleString()} characters, past the{" "}
                    {handle.characterLimit.toLocaleString()} character limit for a single call.{" "}
                    {handle.documentChunks > 1
                      ? `Structural Passes will run in ${handle.documentChunks} overlapping chunks — Section by Section where the Document has headings — so the whole Document is still examined.`
                      : "It has no Section or Paragraph boundary to split on, so a structural Pass will be sent as one call."}
                  </p>
                )}
              </div>
            )}
            <BandPanel
              passes={selectedGroup?.passes ?? []}
              findings={selectedGroup?.findings ?? []}
              readerAccounts={handle.readerAccounts}
              auditAccounts={handle.auditAccounts}
              currentFindingId={currentFindingId}
              onSelectFinding={onSelectFinding}
              showRawResponse={showRawResponse}
              rawResponses={handle.rawResponses}
              onDecline={(findingId, reason) =>
                void leaveQueue(findingId, () => decline(findingId, reason))
              }
              runningPassId={handle.runningPassId}
              runningSince={handle.runStartedAt}
              lastRunReport={handle.lastRunReport}
              estimates={handle.runEstimates}
              busy={runBusy}
              onRun={(passId) => void handle.runModelPass(passId)}
              readerRunning={handle.readerRunning}
              readerStartedAt={handle.readerStartedAt}
              readerError={handle.readerError}
              onRunReader={(passId) => void handle.runReaderPass(passId)}
              auditRunning={handle.auditRunning}
              auditStartedAt={handle.auditStartedAt}
              auditError={handle.auditError}
              auditReport={handle.auditReport}
              onRunAudit={(passId) => void handle.runAuditPass(passId)}
              criticName={handle.criticConnection?.name ?? null}
              onToggle={(passId, enabled) => void handle.togglePass(passId, enabled)}
              onSaveRuleConfig={(passId, ruleConfig) =>
                void handle.saveRuleConfig(passId, ruleConfig)
              }
            />
          </>
        )}
      </div>

      {/* Story 163: the Judge is its own destination, below the Bands. */}
      <JudgePanel
        revisions={handle.revisions}
        currentCanonical={handle.document?.canonical ?? ""}
        selection={selection}
        section={section}
        judge={handle.judgeConnection}
        judgeIsDefault={handle.judgeIsDefault}
        sameModelWarning={handle.sameModelWarning}
        running={handle.judgeRunning}
        error={handle.judgeError}
        result={handle.judgeResult}
        onJudge={(before, after) => void handle.runJudge(before, after)}
      />

      {/* Story 165: milestones and Revisions under the Judge, its raw material. */}
      <section className="border-t border-stone-300">
        <div className="space-y-3 border-b border-stone-200 p-4">
          <h2 className="text-sm font-semibold">Milestones</h2>
          <textarea
            value={milestoneNote}
            onChange={(event) => onMilestoneNoteChange(event.target.value)}
            placeholder="Note for this milestone (optional)"
            rows={2}
            className="w-full resize-none rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onFlagMilestone}
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
              onChange={(event) => onMilestonesOnlyChange(event.target.checked)}
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
  );
}

/** A queue key must not steal from a field or the Editor. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}
