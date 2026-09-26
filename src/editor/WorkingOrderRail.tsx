import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emptyDocTree } from "../core/docTree";
import { isOpenFinding, type AnchorDraft } from "../core/finding";
import { structuralPasses, workingOrder } from "../core/pass";
import type { Section } from "../core/sections";
import type { DocumentHandle } from "../useDocument";
import {
  HELP_SECTION_IDS,
  PANEL_GLOSSES,
  QUEUE_HINT,
  SHORTCUTS_KEY,
  type HelpSectionId,
} from "../help/helpContent";
import {
  announcementForTransition,
  anyRunInFlight,
  railRunStateFromHandle,
  type RailRunState,
} from "./announcements";
import { BandPanel } from "./BandPanel";
import { openFindings, selectionAfterLeavingPass, selectionAfterLeavingQueue, stepSelection } from "./findingQueue";
import { FindingsSidebar } from "./FindingsSidebar";
import { formatCostEstimate, formatUsd } from "./formatUsd";
import { JudgePanel } from "./JudgePanel";
import { MetricsPanel } from "./MetricsPanel";
import { OutlinePanel } from "./OutlinePanel";
import { queueActionFor } from "./queueKeys";
import { RAIL_ELEMENT_ID, type RailPresentation } from "./railPresentation";
import {
  INITIAL_RAIL_MODE,
  nextRailMode,
  nextTabSelection,
  RAIL_MODES,
  RAIL_SELECTIONS,
  type RailMode,
  type RailSelection,
} from "./railTabs";
import { isTypingTarget } from "./typingTarget";

export interface WorkingOrderRailProps {
  handle: DocumentHandle;
  /**
   * Stories 251 and 252: docked beside the prose, overlaying it, or hidden,
   * from `railPresentation`. The shell owns it, because the Status line offers
   * the Rail too.
   */
  presentation: RailPresentation;
  /** Whether the window is 1024px or wider, so a hidden Rail leaves its strip. */
  wide: boolean;
  onShowRail: () => void;
  onHideRail: () => void;
  /** Story 25: the Outline's Sections, derived from the Document's headings. */
  outlineSections: Section[];
  activeHeadingBlockIndex: number | null;
  onJumpToSection: (blockIndex: number) => void;
  currentFindingId: string | null;
  onSelectFinding: (findingId: string | null) => void;
  /** Stories 73 and 238: set in AI Settings, read here. */
  showRawResponse: boolean;
  /** The Selected span as an Anchor, or null when the selection is collapsed. */
  selection: AnchorDraft | null;
  /** The Section at the cursor as an Anchor, or null outside any Section. */
  section: AnchorDraft | null;
  milestoneNote: string;
  onMilestoneNoteChange: (note: string) => void;
  onFlagMilestone: () => void;
  milestonesOnly: boolean;
  onMilestonesOnlyChange: (milestonesOnly: boolean) => void;
  onOpenHelp?: (sectionId: HelpSectionId) => void;
}

export function WorkingOrderRail({
  handle,
  presentation,
  wide,
  onShowRail,
  onHideRail,
  outlineSections,
  activeHeadingBlockIndex,
  onJumpToSection,
  currentFindingId,
  onSelectFinding,
  showRawResponse,
  selection,
  section,
  milestoneNote,
  onMilestoneNoteChange,
  onFlagMilestone,
  milestonesOnly,
  onMilestonesOnlyChange,
  onOpenHelp,
}: WorkingOrderRailProps) {
  const { passes, findings, railBand, setRailBand } = handle;
  /** **All** is not a Band, so it is a local override rather than stored state. */
  const [allSelected, setAllSelected] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  /**
   * ADR 0012: Findings or Judge. Local and never stored, so every session opens
   * on Findings (story 231).
   */
  const [railMode, setRailMode] = useState<RailMode>(INITIAL_RAIL_MODE);

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

  const { markAddressed, decline, declineRestOfPass, reopen } = handle;

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

  /**
   * Stories 179 and 182: declines every open Finding in one Pass. When the
   * Current Finding was one of them, the selection lands on the Finding that
   * slid into the vacated slot; otherwise it stays where the Writer left it.
   */
  const declineRestAndAdvance = useCallback(
    (passId: string) => {
      const before = openQueue;
      void declineRestOfPass(passId).then((written) => {
        if (written) onSelectFinding(selectionAfterLeavingPass(before, passId, currentFindingId));
      });
    },
    [openQueue, currentFindingId, declineRestOfPass, onSelectFinding],
  );

  // The queue's keys are live while the Rail shows the queue: in Findings mode
  // (ADR 0012). The plain `j`, `k`, `a`, `x` and `v` are ordinary letters:
  // `queueActionFor` stands them down inside the Editor and any field so they
  // reach the prose, and in Judge mode, where the queue is not on screen. The
  // Alt-arrow step keeps working from anywhere: arriving in Judge mode it
  // switches the Rail to Findings, and arriving with the Rail hidden it opens
  // it first — docked when wide, overlaying the prose when narrow (story 254) —
  // so the selection it makes is visible.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const decision = queueActionFor(
        {
          key: event.key,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          typing: isTypingTarget(event.target),
        },
        railMode,
      );
      if (decision === null) return;
      const { action } = decision;

      if (presentation === "hidden") {
        if (!event.altKey) return;
        onShowRail();
      }
      if (decision.switchToFindings) setRailMode("findings");

      if (action.kind === "step") {
        event.preventDefault();
        onSelectFinding(stepSelection(openQueue, currentFindingId, action.direction));
        return;
      }

      if (currentFinding === null) return;

      if (action.kind === "address") {
        event.preventDefault();
        void leaveQueue(currentFinding.id, () => markAddressed(currentFinding.id));
        return;
      }

      if (action.kind === "decline") {
        event.preventDefault();
        void leaveQueue(currentFinding.id, () => decline(currentFinding.id));
        return;
      }

      if (action.kind === "decline-violation" && (currentFinding.violations?.length ?? 0) > 0) {
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
    presentation,
    onShowRail,
    railMode,
    onSelectFinding,
  ]);

  // Story 255: while the Rail overlays the prose, Escape or a press outside it
  // closes it, so returning to the prose is one move. The Status line's offer
  // is not outside: it toggles the Rail itself.
  const railRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (presentation !== "overlay") return;
    const offer = () =>
      document.querySelector<HTMLElement>(`[aria-controls="${RAIL_ELEMENT_ID}"]`);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const focusWasInRail = railRef.current?.contains(document.activeElement) ?? false;
      onHideRail();
      if (focusWasInRail) offer()?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (railRef.current?.contains(event.target)) return;
      if (offer()?.contains(event.target)) return;
      onHideRail();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [presentation, onHideRail]);

  // Story 186: Live region announcements for Run finished, Run failed, and Verdict arrived.
  const [announcement, setAnnouncement] = useState("");
  const prevRunStateRef = useRef<RailRunState>(railRunStateFromHandle(handle));

  const currentRunState = useMemo<RailRunState>(
    () => railRunStateFromHandle(handle),
    [
      handle.runningPassId,
      handle.structuralRunning,
      handle.readerRunning,
      handle.auditRunning,
      handle.judgeRunning,
      handle.runError,
      handle.readerError,
      handle.auditError,
      handle.judgeError,
      handle.judgeResult,
    ],
  );

  useEffect(() => {
    const prev = prevRunStateRef.current;
    prevRunStateRef.current = currentRunState;
    const message = announcementForTransition(prev, currentRunState);
    if (message !== null) {
      setAnnouncement(message);
      const timer = setTimeout(() => {
        setAnnouncement("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [currentRunState]);

  const onModeKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const next = nextRailMode(railMode, event.key);
    if (next !== null) {
      event.preventDefault();
      setRailMode(next);
      document.getElementById(`rail-mode-tab-${next}`)?.focus();
    }
  };

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const next = nextTabSelection(railSelection, event.key);
    if (next !== null) {
      event.preventDefault();
      selectRail(next);
      const tabElement = document.getElementById(`rail-tab-${next}`);
      tabElement?.focus();
    }
  };

  const hasStructuralPasses = structuralPasses(passes).length > 0;
  const runBusy = anyRunInFlight(handle);
  const documentLength = handle.document?.canonical.length ?? 0;
  const pastLimit = hasStructuralPasses && documentLength > handle.characterLimit;
  const visibleRevisions = milestonesOnly
    ? handle.revisions.filter((revision) => revision.flagged)
    : handle.revisions;

  return (
    <>
      {/* Story 186 and 234: the polite live region announcing a Run finished or
          failed and a Verdict. It sits outside both Rail modes, and outside the
          hidden Rail, so switching modes never costs the Writer a result. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      {/* Below 1024px a hidden Rail leaves no strip: the page keeps its full
          width and the Status line offers the Rail (stories 251 and 253). */}
      {presentation === "hidden" ? (
        wide && (
          <button
            type="button"
            onClick={onShowRail}
            title="Show the rail"
            className="sticky top-0 flex max-h-screen w-8 shrink-0 items-center justify-center border-l border-rule-soft bg-sunk/60 text-xs font-medium text-muted-ink hover:bg-sunk-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
          >
            <span className="[writing-mode:vertical-rl]">Show rail</span>
          </button>
        )
      ) : (
        // Docked, the Rail is bounded to the viewport and sticks there, so its
        // body scrolls inside itself while the window scrolls a long Document
        // (#92); the margin Outline and the Status line rely on the window.
        <aside
          ref={railRef}
          id={RAIL_ELEMENT_ID}
          aria-label="Rail"
          className={
            presentation === "overlay"
              ? "fixed inset-y-0 right-0 z-30 flex w-96 max-w-[calc(100vw-2rem)] flex-col border-l border-rule-soft bg-sunk shadow-md"
              : "sticky top-0 flex max-h-screen w-96 flex-col border-l border-rule-soft bg-sunk/60"
          }
        >
          {/* ADR 0012, story 228: the two Rail modes, switched at the Rail's top. */}
          <div className="sticky top-0 z-10 flex shrink-0 items-stretch border-b border-rule bg-sunk">
            <div role="tablist" aria-label="Rail modes" className="flex flex-1">
              {RAIL_MODES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  id={`rail-mode-tab-${value}`}
                  aria-selected={railMode === value}
                  aria-controls={`rail-mode-${value}`}
                  tabIndex={railMode === value ? 0 : -1}
                  onClick={() => setRailMode(value)}
                  onKeyDown={onModeKeyDown}
                  className={[
                    "flex-1 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset",
                    railMode === value
                      ? "border-ink font-semibold text-ink"
                      : "border-transparent text-muted-ink hover:text-soft-ink",
                  ].join(" ")}
                >
                  {label}
                  {value === "findings" && (
                    <span className="ml-1.5 text-xs font-normal tabular-nums text-muted-ink">
                      {order.all.filter(isOpenFinding).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onHideRail}
              className="shrink-0 px-3 text-xs text-muted-ink hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
            >
              Hide rail
            </button>
          </div>

          {/* A model Run's failure is not about one Band or one mode, so it is
              shown whichever mode is up; Cancel is reachable from either, since a
              Run may have started in either. */}
          {handle.runError !== null && (
            <p className="shrink-0 border-b border-failure-rule bg-failure-surface px-4 py-2 text-xs text-failure">
              {handle.runError}
            </p>
          )}
          {runBusy && (
            <div className="shrink-0 border-b border-rule-soft px-4 py-2">
              <button
                type="button"
                onClick={handle.cancelRun}
                className="w-full rounded border border-failure-rule bg-paper px-2.5 py-1.5 text-xs font-medium text-failure hover:bg-failure-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-failure-focus"
              >
                Cancel run
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Findings mode: the Band control, All, the run controls and the
                queue, first (story 229). Both modes stay mounted and the other
                is hidden, so neither loses its place or its choices. */}
            <div
              id="rail-mode-findings"
              role="tabpanel"
              aria-labelledby="rail-mode-tab-findings"
              hidden={railMode !== "findings"}
            >
              {/* ADR 0010: the Band is the navigation, plus All for the whole queue. */}
              <div
                role="tablist"
                aria-label="Bands of the Working order"
                className="flex border-b border-rule bg-sunk/60"
              >
                {RAIL_SELECTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    id={`rail-tab-${value}`}
                    aria-selected={railSelection === value}
                    aria-controls={railSelection === value ? `rail-panel-${value}` : undefined}
                    tabIndex={railSelection === value ? 0 : -1}
                    onClick={() => selectRail(value)}
                    onKeyDown={onTabKeyDown}
                    className={[
                      "flex-1 border-b-2 px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset",
                      railSelection === value
                        ? "border-ink font-semibold text-ink"
                        : "border-transparent text-muted-ink hover:text-soft-ink",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <p className="border-b border-rule-soft px-4 py-1.5 text-right text-xs tabular-nums text-muted-ink">
                {openQueue.length} open
              </p>

              <div
                id={`rail-panel-${railSelection}`}
                role="tabpanel"
                tabIndex={0}
                aria-labelledby={`rail-tab-${railSelection}`}
                className="border-b border-rule focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
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
                    onDeclineRest={declineRestAndAdvance}
                    onReopen={(findingId) => void reopen(findingId)}
                    onOpenHelp={onOpenHelp}
                  />
                ) : (
                  <>
                    {railSelection === "structure" && (
                      <div className="border-b border-rule-soft">
                        <div className="flex items-center justify-between px-4 py-1.5 text-xs text-muted-ink">
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
                                ? (handle.structuralEstimate.costKnown
                                    ? `Run every enabled document-scope Pass (${formatUsd(handle.structuralEstimate.costUsd)})`
                                    : "Run every enabled document-scope Pass (cost is unknown)")
                                : "Enable a structural Pass first"
                            }
                            className="w-full rounded border border-rule bg-paper px-2.5 py-1.5 text-xs font-medium text-quiet-ink hover:bg-sunk disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                          >
                            {handle.structuralRunning
                              ? "Running structural set…"
                              : hasStructuralPasses
                                ? `Run structural set · ${formatCostEstimate(handle.structuralEstimate)}`
                                : "Run structural set"}
                          </button>
                        </div>
                        {pastLimit && (
                          <p className="border-t border-warning-rule bg-warning-surface px-4 py-2 text-xs text-warning">
                            This document is {documentLength.toLocaleString()} characters, past the{" "}
                            {handle.characterLimit.toLocaleString()} character limit for a single call.{" "}
                            {handle.documentChunks > 1
                              ? `Structural passes will run in ${handle.documentChunks} overlapping chunks, section by section where the document has headings, so the whole piece is still examined.`
                              : "The text has no section or paragraph boundary to split on, so a structural pass will run as a single call."}
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
                      onReopen={(findingId) => void reopen(findingId)}
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
                      onOpenHelp={onOpenHelp}
                    />
                  </>
                )}
              </div>
            </div>

            {/* Judge mode: the Judge, with the milestones and Revisions it
                compares beside it (stories 163, 165 and 230). */}
            <div
              id="rail-mode-judge"
              role="tabpanel"
              aria-labelledby="rail-mode-tab-judge"
              hidden={railMode !== "judge"}
            >
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
                onOpenHelp={onOpenHelp}
              />

              <section>
                <div className="space-y-3 border-b border-rule-soft p-4">
                  <h2 className="text-base font-semibold">Milestones</h2>
                  <textarea
                    value={milestoneNote}
                    onChange={(event) => onMilestoneNoteChange(event.target.value)}
                    placeholder="Note for this milestone (optional)"
                    rows={2}
                    className="w-full resize-none rounded border border-rule bg-paper px-2 py-1.5 text-sm focus:border-rule-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  />
                  <button
                    type="button"
                    onClick={onFlagMilestone}
                    className="w-full rounded bg-ink px-3 py-1.5 text-sm font-medium text-on-ink hover:bg-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                  >
                    Flag this revision
                  </button>
                </div>

                <div className="flex items-center justify-between border-b border-rule-soft px-4 py-2">
                  <h2 className="text-base font-semibold">Revisions</h2>
                  <label className="flex items-center gap-1.5 text-xs text-muted-ink">
                    <input
                      type="checkbox"
                      checked={milestonesOnly}
                      onChange={(event) => onMilestonesOnlyChange(event.target.checked)}
                      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    />
                    Milestones only
                  </label>
                </div>

                <p className="border-b border-rule-soft px-4 py-2 text-xs text-muted-ink">
                  {PANEL_GLOSSES.revisions.text}{" "}
                  <button
                    type="button"
                    onClick={() => onOpenHelp?.(PANEL_GLOSSES.revisions.sectionId)}
                    className="rounded px-0.5 underline hover:text-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    How this works
                  </button>
                </p>

                <ol>
                  {visibleRevisions.length === 0 && (
                    <li className="px-4 py-4 text-sm text-muted-ink">
                      {milestonesOnly
                        ? "No milestones yet. Flag one to make it findable later."
                        : "Revisions appear as you write."}
                    </li>
                  )}
                  {visibleRevisions.map((revision) => (
                    <li key={revision.id} className="border-b border-rule-soft/70 px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-quiet-ink">
                          {new Date(revision.createdAt).toLocaleString()}
                        </span>
                        {revision.flagged && (
                          <span className="rounded bg-milestone px-1.5 py-0.5 text-xs font-medium text-milestone-ink">
                            Milestone
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-ink">{revision.wordCount} words</p>
                      {revision.note !== null && revision.note !== "" && (
                        <p className="mt-1 text-quiet-ink">{revision.note}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            {/* Story 165: Outline and metrics, collapsible, reachable from either
                mode and below the queue, so the queue comes first. */}
            <section className="border-t border-rule">
              <button
                type="button"
                onClick={() => setReferenceOpen((open) => !open)}
                aria-expanded={referenceOpen}
                className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-sunk-strong/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
              >
                <span className="text-base font-semibold">Reference</span>
                <span className="text-xs text-muted-ink">
                  {referenceOpen ? "Hide " : "Show "}
                  <span className="obelus-rail-outline">outline and </span>metrics
                </span>
              </button>
              {referenceOpen && (
                <>
                  {/* Story 242: below 1440px the Outline is here; at 1440px and
                      wider the stylesheet hides it, as the margin Outline shows. */}
                  <div className="obelus-rail-outline">
                    <OutlinePanel
                      sections={outlineSections}
                      activeHeadingBlockIndex={activeHeadingBlockIndex}
                      onJump={onJumpToSection}
                      onOpenHelp={onOpenHelp}
                    />
                  </div>
                  <MetricsPanel
                    canonical={handle.document?.canonical ?? ""}
                    tree={handle.document?.tree ?? emptyDocTree()}
                    onOpenHelp={onOpenHelp}
                  />
                </>
              )}
            </section>
          </div>

          {/* Stories 177, 236 and 237: one line at the Rail's foot, still saying
              when the plain keys are live; the full text is on the shortcuts page. */}
          <p className="sticky bottom-0 z-10 flex shrink-0 items-center justify-between gap-2 border-t border-rule-soft bg-sunk px-4 py-1.5 text-xs text-muted-ink">
            <span className="truncate" title={QUEUE_HINT}>
              {QUEUE_HINT}
            </span>
            {/* The shell-wide ? opens the same page; the key cap teaches it. */}
            <button
              type="button"
              onClick={() => onOpenHelp?.(HELP_SECTION_IDS.shortcuts)}
              aria-label="All shortcuts"
              title="All shortcuts"
              className="shrink-0 rounded border border-rule bg-paper px-1.5 font-medium text-quiet-ink hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {SHORTCUTS_KEY}
            </button>
          </p>
        </aside>
      )}
    </>
  );
}
