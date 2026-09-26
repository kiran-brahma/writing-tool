import { useEffect, useRef } from "react";
import { isOpenFinding, type DeclineReason, type Finding } from "../core/finding";
import { QuarantinedRewrite, StruckText, StruckViolations } from "./ViolationDisplay";
import { splitViolations, violationsOutsideText } from "./violationMarks";

/**
 * One Finding in the rail. The same row renders in the **All** queue and inside
 * the Band that produced it, so the two views cannot drift.
 *
 * The row is display and controls only: selecting it, declining it, and — once
 * it has left the queue — returning it to `open`. No affordance here inserts
 * model-derived text, and a rewrite the linter caught is quarantined behind
 * `QuarantinedRewrite` rather than shown as prose to accept.
 */
/**
 * Story 138: the quiet label a note-severity Finding carries, in the Rail's
 * row and in the Callout alike — outlined rather than filled, so it reads
 * lighter than the row's other chips.
 */
export function NoteLabel() {
  return (
    <span
      title="Reported at note severity: judge it, it is not an error"
      className="shrink-0 rounded border border-rule px-1 text-xs leading-5 text-muted-ink"
    >
      Note
    </span>
  );
}

export interface FindingRowProps {
  finding: Finding;
  current: boolean;
  onSelect: (findingId: string) => void;
  onDecline: (findingId: string, reason: DeclineReason) => void;
  /** Story 181: return a Finding that left the queue to `open`. */
  onReopen?: (findingId: string) => void;
  rawResponse?: string;
}

export function FindingRow({
  finding,
  current,
  onSelect,
  onDecline,
  onReopen,
  rawResponse,
}: FindingRowProps) {
  const rowRef = useRef<HTMLLIElement | null>(null);

  // Keep the Current Finding on screen whichever view is showing it. The nonce
  // a jump request carries matters to the prose (#38); here `current` toggling
  // is enough to pull a newly selected row into view.
  useEffect(() => {
    if (current) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const attached = finding.anchor.state === "attached";
  const leftQueue = !isOpenFinding(finding);
  // Story 138: a note-severity Finding reads at a lighter weight than an error.
  // Only the row's weight changes; its place in the queue does not.
  const note = finding.severity === "note";
  const violations = finding.violations ?? [];
  const { rewrites } = splitViolations(violations);
  const elsewhere = violationsOutsideText(
    [finding.issue, finding.diagnosis, finding.anchor.quote],
    violations,
  );

  return (
    <li ref={rowRef} className="border-b border-rule-soft/70 last:border-b-0">
      <button
        type="button"
        onClick={() => onSelect(finding.id)}
        aria-current={current ? "true" : undefined}
        className={[
          "w-full px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset",
          current ? "bg-mark-wash/70" : "hover:bg-sunk-strong/50",
          leftQueue ? "opacity-60" : "",
        ].join(" ")}
      >
        <p className={["flex items-start gap-2", note ? "text-quiet-ink" : "text-soft-ink"].join(" ")}>
          <span className="font-mono text-xs text-muted-ink">
            “<StruckText text={finding.anchor.quote} violations={violations} />”
          </span>
          {note && <NoteLabel />}
          <span className={note ? "font-normal" : "font-medium"}>
            <StruckText text={finding.issue} violations={violations} />
          </span>
        </p>
        <p className="mt-1 text-muted-ink">
          <StruckText text={finding.diagnosis} violations={violations} />
        </p>
        {finding.inVoiceList === true && (
          <p className="mt-1 text-xs text-muted-ink">
            <span className="rounded bg-sunk-strong px-1.5 py-0.5 font-medium text-quiet-ink">
              In your Voice list
            </span>{" "}
            The model flagged it anyway.
          </p>
        )}
        {!attached && (
          <p className="mt-1 text-xs italic text-muted-ink">No longer found in the text.</p>
        )}
        {/* Story 239: model and time on the Current Finding only, so the queue
            reads cleanly; the Callout shows them for every Finding. */}
        {(current || leftQueue) && (
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted-ink">
            {current && (
              <span>
                {finding.provenance.model} · {new Date(finding.provenance.at).toLocaleString()}
              </span>
            )}
            {leftQueue && (
              <span className="rounded bg-rule/70 px-1.5 py-0.5 font-medium text-quiet-ink">
                {finding.status}
                {finding.declineReason === undefined ? "" : ` · ${finding.declineReason}`}
              </span>
            )}
          </p>
        )}
      </button>
      {leftQueue && onReopen !== undefined && (
        <div className="border-t border-rule-soft/70 px-4 py-2">
          <button
            type="button"
            onClick={() => onReopen(finding.id)}
            className="rounded border border-rule bg-paper px-2 py-1 text-xs font-medium text-quiet-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Reopen
          </button>
        </div>
      )}
      {violations.length > 0 && (
        <div className="border-t border-rule-soft/70 px-4 py-2">
          {elsewhere.length > 0 && (
            <p className="text-xs text-muted-ink">
              Praise from the model: <StruckViolations violations={elsewhere} />
            </p>
          )}
          {rewrites.length > 0 && <QuarantinedRewrite violations={rewrites} />}
          {!leftQueue && (
            <button
              type="button"
              onClick={() => onDecline(finding.id, "violation")}
              className="mt-2 rounded border border-violation-rule bg-violation-surface px-2 py-1 text-xs font-medium text-violation-ink hover:bg-violation-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violation-focus"
            >
              Decline as violation
            </button>
          )}
        </div>
      )}
      {rawResponse !== undefined && rawResponse !== "" && (
        <pre className="mx-4 mb-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-ink/90 p-2 font-mono text-xs text-sunk">
          {rawResponse}
        </pre>
      )}
    </li>
  );
}
