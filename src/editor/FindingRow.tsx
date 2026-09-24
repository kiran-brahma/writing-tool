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
  const violations = finding.violations ?? [];
  const { rewrites } = splitViolations(violations);
  const elsewhere = violationsOutsideText(
    [finding.issue, finding.diagnosis, finding.anchor.quote],
    violations,
  );

  return (
    <li ref={rowRef} className="border-b border-stone-200/70 last:border-b-0">
      <button
        type="button"
        onClick={() => onSelect(finding.id)}
        aria-current={current ? "true" : undefined}
        className={[
          "w-full px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600 focus-visible:ring-inset",
          current ? "bg-amber-100/70" : "hover:bg-stone-200/50",
          leftQueue ? "opacity-60" : "",
        ].join(" ")}
      >
        <p className="flex items-start gap-2 text-stone-800">
          <span className="font-mono text-xs text-stone-600">
            “<StruckText text={finding.anchor.quote} violations={violations} />”
          </span>
          <span className="font-medium">
            <StruckText text={finding.issue} violations={violations} />
          </span>
        </p>
        <p className="mt-1 text-stone-600">
          <StruckText text={finding.diagnosis} violations={violations} />
        </p>
        {finding.inVoiceList === true && (
          <p className="mt-1 text-xs text-stone-600">
            <span className="rounded bg-stone-200 px-1.5 py-0.5 font-medium text-stone-700">
              In your Voice list
            </span>{" "}
            The model flagged it anyway.
          </p>
        )}
        {!attached && (
          <p className="mt-1 text-xs italic text-stone-600">No longer found in the text.</p>
        )}
        <p className="mt-1 text-xs text-stone-600">
          {finding.provenance.model} · {new Date(finding.provenance.at).toLocaleString()}
          {leftQueue && (
            <span className="ml-2 rounded bg-stone-300/70 px-1.5 py-0.5 font-medium text-stone-700">
              {finding.status}
              {finding.declineReason === undefined ? "" : ` · ${finding.declineReason}`}
            </span>
          )}
        </p>
      </button>
      {leftQueue && onReopen !== undefined && (
        <div className="border-t border-stone-200/70 px-4 py-2">
          <button
            type="button"
            onClick={() => onReopen(finding.id)}
            className="rounded border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600"
          >
            Reopen
          </button>
        </div>
      )}
      {violations.length > 0 && (
        <div className="border-t border-stone-200/70 px-4 py-2">
          {elsewhere.length > 0 && (
            <p className="text-xs text-stone-600">
              Praise from the model: <StruckViolations violations={elsewhere} />
            </p>
          )}
          {rewrites.length > 0 && <QuarantinedRewrite violations={rewrites} />}
          {!leftQueue && (
            <button
              type="button"
              onClick={() => onDecline(finding.id, "violation")}
              className="mt-2 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
            >
              Decline as violation
            </button>
          )}
        </div>
      )}
      {rawResponse !== undefined && rawResponse !== "" && (
        <pre className="mx-4 mb-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-stone-900/90 p-2 font-mono text-xs text-stone-100">
          {rawResponse}
        </pre>
      )}
    </li>
  );
}
