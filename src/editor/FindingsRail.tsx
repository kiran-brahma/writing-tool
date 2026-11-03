import { useEffect, useMemo, useState } from "react";
import { isOpenFinding, type DeclineReason, type Finding } from "../core/finding";
import type { Pass } from "../core/pass";
import {
  selectionAfterLeavingQueue,
  stepSelection,
} from "./findingQueue";
import { RAIL_ELEMENT_ID, type RailPresentation } from "./railPresentation";
import { isTypingTarget } from "./typingTarget";
import { QuarantinedRewrite, StruckText, StruckViolations } from "./ViolationDisplay";
import { splitViolations, violationsOutsideText } from "./violationMarks";

export interface FindingsRailProps {
  findings: Finding[];
  passes: Pass[];
  currentFindingId: string | null;
  onSelectFinding: (findingId: string | null) => void;
  onAddress: (findingId: string) => Promise<boolean>;
  onDecline: (findingId: string, reason?: DeclineReason) => Promise<boolean>;
  onReopen: (findingId: string) => Promise<boolean>;
  /** Moves every open Finding out of the queue in one action. */
  onClearFindings: () => Promise<boolean>;
  presentation: RailPresentation;
  onHideRail: () => void;
}

/**
 * The one findings rail: every Finding in document order, with the pass that
 * produced it on the row. There are no bands, no modes and no per-pass blocks.
 *
 * The queue keys work the open Findings on screen: `j`/`k` step, `a` addresses
 * and `x` declines. Addressed and declined Findings sit behind "Show closed" so
 * the queue stays quiet, and a closed Finding can be reopened from there.
 */
export function FindingsRail({
  findings,
  passes,
  currentFindingId,
  onSelectFinding,
  onAddress,
  onDecline,
  onReopen,
  onClearFindings,
  presentation,
  onHideRail,
}: FindingsRailProps) {
  const [showClosed, setShowClosed] = useState(false);

  const ordered = useMemo(
    () =>
      [...findings].sort(
        (left, right) =>
          left.anchor.offset - right.anchor.offset || left.issue.localeCompare(right.issue),
      ),
    [findings],
  );
  const open = useMemo(() => ordered.filter(isOpenFinding), [ordered]);
  const closed = useMemo(() => ordered.filter((finding) => !isOpenFinding(finding)), [ordered]);
  const visible = showClosed ? ordered : open;
  const passName = useMemo(
    () => new Map(passes.map((pass) => [pass.id, pass.name])),
    [passes],
  );
  const current = open.find((finding) => finding.id === currentFindingId) ?? null;

  const leaveQueue = (findingId: string, write: () => Promise<boolean>) => {
    return write().then((written) => {
      if (written) onSelectFinding(selectionAfterLeavingQueue(open, findingId));
      return written;
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (presentation === "hidden") return;

      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        onSelectFinding(stepSelection(open, currentFindingId, event.key === "j" ? 1 : -1));
        return;
      }
      if (current === null) return;
      if (event.key === "a") {
        event.preventDefault();
        void leaveQueue(current.id, () => onAddress(current.id));
      } else if (event.key === "x") {
        event.preventDefault();
        void leaveQueue(current.id, () => onDecline(current.id));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    open,
    current,
    currentFindingId,
    onSelectFinding,
    onAddress,
    onDecline,
    presentation,
  ]);

  if (presentation === "hidden") return null;

  return (
    <aside
      id={RAIL_ELEMENT_ID}
      aria-label="Findings"
      className={[
        "flex min-h-0 flex-col border-l border-rule bg-paper",
        presentation === "overlay"
          ? "fixed inset-y-0 right-0 z-30 w-80 max-w-[90vw] shadow-xl"
          : "w-80 shrink-0",
      ].join(" ")}
    >
      <div className="flex items-center justify-between border-b border-rule px-4 py-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">Findings</h2>
          <p className="text-xs text-faint-ink">
            {open.length === 0
              ? "Nothing open."
              : `${open.length} open${closed.length > 0 ? ` · ${closed.length} closed` : ""}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              void onClearFindings().then((cleared) => {
                if (cleared) onSelectFinding(null);
              });
            }}
            disabled={open.length === 0}
            title="Move every open finding to Show closed"
            className="rounded px-2 py-1 text-xs font-medium text-muted-ink underline underline-offset-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onHideRail}
            className="rounded px-2 py-1 text-xs font-medium text-muted-ink hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Close
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-ink">
            No open findings. The rule passes run on save; Review runs the model passes on
            the paragraph at your cursor.
          </p>
        )}
        {visible.map((finding) => (
          <RailRow
            key={finding.id}
            finding={finding}
            passName={passName.get(finding.passId) ?? "A pass no longer in the set"}
            current={finding.id === currentFindingId}
            onSelect={() => onSelectFinding(finding.id)}
            onAddress={() => void leaveQueue(finding.id, () => onAddress(finding.id))}
            onDecline={() => void leaveQueue(finding.id, () => onDecline(finding.id))}
            onDeclineViolation={() =>
              void leaveQueue(finding.id, () => onDecline(finding.id, "violation"))
            }
            onReopen={() => void onReopen(finding.id)}
          />
        ))}
      </div>

      {closed.length > 0 && (
        <div className="border-t border-rule px-4 py-2">
          <button
            type="button"
            onClick={() => setShowClosed((current) => !current)}
            aria-pressed={showClosed}
            className="rounded text-xs font-medium text-muted-ink underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {showClosed ? "Hide closed" : `Show closed (${closed.length})`}
          </button>
        </div>
      )}
    </aside>
  );
}

function RailRow({
  finding,
  passName,
  current,
  onSelect,
  onAddress,
  onDecline,
  onDeclineViolation,
  onReopen,
}: {
  finding: Finding;
  passName: string;
  current: boolean;
  onSelect: () => void;
  onAddress: () => void;
  onDecline: () => void;
  onDeclineViolation: () => void;
  onReopen: () => void;
}) {
  const open = isOpenFinding(finding);
  const violations = finding.violations ?? [];
  const { rewrites } = splitViolations(violations);
  const elsewhere = violationsOutsideText(
    [finding.issue, finding.diagnosis, finding.anchor.quote],
    violations,
  );

  return (
    <article
      className={[
        "border-b border-rule-soft px-4 py-3",
        current ? "bg-mark-wash/70" : "",
        open ? "" : "opacity-60",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={current ? "true" : undefined}
        className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-faint-ink">{passName}</p>
        <p className="mt-1 text-sm text-soft-ink">
          “<StruckText text={finding.anchor.quote} violations={violations} />”
        </p>
        <p className="mt-1 text-sm font-medium text-ink">
          <StruckText text={finding.issue} violations={violations} />
        </p>
        <p className="mt-0.5 text-sm text-muted-ink">
          <StruckText text={finding.diagnosis} violations={violations} />
        </p>
        {!open && (
          <p className="mt-1 text-xs text-muted-ink">
            {finding.status}
            {finding.declineReason === undefined ? "" : ` · ${finding.declineReason}`}
          </p>
        )}
        {finding.anchor.state !== "attached" && (
          <p className="mt-1 text-xs italic text-muted-ink">No longer found in the text.</p>
        )}
      </button>

      {elsewhere.length > 0 && (
        <p className="mt-2 text-xs text-muted-ink">
          Praise from the model: <StruckViolations violations={elsewhere} />
        </p>
      )}
      {rewrites.length > 0 && <QuarantinedRewrite violations={rewrites} />}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {open ? (
          <>
            <button
              type="button"
              onClick={onAddress}
              className="rounded bg-ink px-2.5 py-1 font-semibold text-on-ink hover:bg-soft-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
            >
              Addressed
            </button>
            <button
              type="button"
              onClick={onDecline}
              className="rounded border border-rule px-2.5 py-1 text-quiet-ink hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Decline
            </button>
            {violations.length > 0 && (
              <button
                type="button"
                onClick={onDeclineViolation}
                className="px-1 py-1 text-muted-ink underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Decline as violation
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={onReopen}
            className="rounded border border-rule px-2.5 py-1 text-quiet-ink hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Reopen
          </button>
        )}
      </div>
    </article>
  );
}
