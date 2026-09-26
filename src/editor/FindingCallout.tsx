import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DeclineReason, Finding } from "../core/finding";
import { calloutPosition, type CalloutPosition, type HighlightRect } from "./callout";
import { QuarantinedRewrite, StruckText, StruckViolations } from "./ViolationDisplay";
import { splitViolations, violationsOutsideText } from "./violationMarks";

export interface FindingCalloutProps {
  findings: Finding[];
  rect: HighlightRect;
  onAddress: (findingId: string) => void;
  onDecline: (findingId: string, reason: DeclineReason) => void;
  onClose: () => void;
}

/** Until the popover has measured itself, place it as if it were this size. */
const ESTIMATED_SIZE = { width: 288, height: 120 };

/**
 * A small popover with the Findings on a clicked Highlight: what is wrong and
 * why, and the queue's verdicts. Like the Rail's row it is display and controls
 * only: nothing here inserts model-derived text, praise is struck through, and
 * a caught rewrite stays behind `QuarantinedRewrite`.
 *
 * Opening it takes no focus and moves nothing else on screen — not even the
 * Current Finding — so the caret the click placed stays in the prose and the
 * Writer keeps their place; typing closes it. Pressing one of its buttons
 * focuses that button, as any button does.
 */
export function FindingCallout({
  findings,
  rect,
  onAddress,
  onDecline,
  onClose,
}: FindingCalloutProps) {
  const calloutRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<CalloutPosition>(() =>
    calloutPosition(rect, viewport(), ESTIMATED_SIZE),
  );

  useLayoutEffect(() => {
    const element = calloutRef.current;
    const size =
      element === null
        ? ESTIMATED_SIZE
        : { width: element.offsetWidth, height: element.offsetHeight };
    setPosition(calloutPosition(rect, viewport(), size));
  }, [rect, findings]);

  // Escape closes it, as does a press anywhere else. A press on another
  // Highlight closes this one and the Editor's click opens that one's.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (calloutRef.current?.contains(event.target)) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  return (
    <div
      ref={calloutRef}
      role="dialog"
      aria-label={findings.length === 1 ? "Finding" : `${findings.length} Findings`}
      style={{ left: position.left, top: position.top }}
      className="fixed z-40 w-72 divide-y divide-rule-soft rounded-md border border-rule bg-paper text-sm shadow-md"
    >
      {findings.map((finding) => (
        <CalloutEntry
          key={finding.id}
          finding={finding}
          onAddress={onAddress}
          onDecline={onDecline}
        />
      ))}
    </div>
  );
}

interface CalloutEntryProps {
  finding: Finding;
  onAddress: (findingId: string) => void;
  onDecline: (findingId: string, reason: DeclineReason) => void;
}

function CalloutEntry({ finding, onAddress, onDecline }: CalloutEntryProps) {
  const violations = finding.violations ?? [];
  const { rewrites } = splitViolations(violations);
  const elsewhere = violationsOutsideText([finding.issue, finding.diagnosis], violations);

  return (
    <div className="px-3 py-2.5">
      <p className="font-medium text-ink">
        <StruckText text={finding.issue} violations={violations} />
      </p>
      <p className="mt-0.5 text-muted-ink">
        <StruckText text={finding.diagnosis} violations={violations} />
      </p>
      {/* Story 239: each Finding's provenance, where the Writer judges it. */}
      <p className="mt-1 text-xs text-muted-ink">
        {finding.provenance.model} · {new Date(finding.provenance.at).toLocaleString()}
      </p>
      {elsewhere.length > 0 && (
        <p className="mt-1 text-xs text-muted-ink">
          Praise from the model: <StruckViolations violations={elsewhere} />
        </p>
      )}
      {rewrites.length > 0 && <QuarantinedRewrite violations={rewrites} />}
      <p className="mt-2 flex gap-3 text-xs">
        <CalloutAction onClick={() => onAddress(finding.id)}>Addressed</CalloutAction>
        <CalloutAction onClick={() => onDecline(finding.id, "advice")}>Decline</CalloutAction>
        {violations.length > 0 && (
          <CalloutAction onClick={() => onDecline(finding.id, "violation")}>
            Decline as violation
          </CalloutAction>
        )}
      </p>
    </div>
  );
}

function CalloutAction({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded font-medium text-muted-ink underline-offset-2 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      {children}
    </button>
  );
}

function viewport(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}
