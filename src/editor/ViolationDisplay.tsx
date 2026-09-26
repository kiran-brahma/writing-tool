import type { Violation } from "../core/finding";
import { markViolations } from "./violationMarks";

/**
 * The display half of the linter. Praise and rewrite-shaped content is marked
 * in place rather than stripped: the Writer must be able to see that a model
 * ignored the instruction, because that is how prompt drift becomes visible.
 * Nothing here can put text into the Document; it only draws what came back.
 */
export function StruckText({ text, violations }: { text: string; violations: Violation[] }) {
  return (
    <>
      {markViolations(text, violations).map((segment, index) =>
        segment.violated ? (
          <s key={index} className="text-muted-ink decoration-violation decoration-2">
            {segment.text}
          </s>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

/**
 * A plain list of violation phrases, each struck through. Used where the
 * violation text is not embedded in a longer string: the per-Finding drift a
 * field the row does not render carried, and a Run's whole-response drift.
 */
export function StruckViolations({ violations }: { violations: Violation[] }) {
  return (
    <>
      {violations.map((violation, index) => (
        <span key={index}>
          {index > 0 && ", "}
          <s className="text-muted-ink decoration-violation decoration-2">{violation.text}</s>
        </span>
      ))}
    </>
  );
}

/**
 * Stories 69 and 70: the quarantined rewrite. Reachable only behind the
 * explicit `details` reveal, and rendered `user-select: none` with no control
 * that could insert it. Model-written prose is shown, never offered.
 */
export function QuarantinedRewrite({ violations }: { violations: Violation[] }) {
  return (
    <details className="mt-2 rounded border border-rule bg-ground">
      <summary className="cursor-pointer px-2 py-1 text-xs font-medium text-muted-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
        Reveal quarantined rewrite
      </summary>
      <div
        className="select-none border-t border-rule-soft px-2 py-1.5 font-mono text-xs text-muted-ink"
        style={{ userSelect: "none" }}
      >
        {violations.map((violation, index) => (
          <p key={index} className="whitespace-pre-wrap">
            {violation.text}
          </p>
        ))}
        <p className="mt-1 font-sans text-xs italic text-muted-ink">
          Shown for inspection only. Your keyboard is the only way text enters your Document.
        </p>
      </div>
    </details>
  );
}
