import { RAIL_ELEMENT_ID } from "./railPresentation";
import { railOfferLabel, wordCountLabel } from "./statusLineLabels";

/** Story 253: the Rail as the Status line offers it below 1024px. */
export interface StatusLineRailOffer {
  openFindingCount: number;
  /** Whether the Rail is overlaying the prose now. */
  open: boolean;
  onToggle: () => void;
}

/**
 * The Status line, beneath the prose at every width: the word count, the Review
 * action, the Judge's Compare action, and the findings-rail toggle.
 *
 * Review runs the three model passes on the paragraph at the cursor. While it
 * runs, the same control offers Cancel. Compare opens the Judge for the current
 * section, or the selected span.
 */
export function StatusLine({
  wordCount,
  rail = null,
  onReview,
  reviewRunning = false,
  canReview = false,
  onCancel,
  onCompare,
  canCompare = false,
}: {
  wordCount: number;
  rail?: StatusLineRailOffer | null;
  onReview?: () => void;
  reviewRunning?: boolean;
  canReview?: boolean;
  onCancel?: () => void;
  onCompare?: () => void;
  canCompare?: boolean;
}) {
  return (
    <div className="sticky bottom-0 border-t border-rule-faint bg-paper">
      <div className="obelus-column flex items-center justify-between gap-4 py-1.5 text-xs tabular-nums text-faint-ink">
        <p>{wordCountLabel(wordCount)}</p>
        <div className="flex items-center gap-3">
          {onReview !== undefined &&
            (reviewRunning && onCancel !== undefined ? (
              <button
                type="button"
                onClick={onCancel}
                className="rounded px-1 font-medium text-muted-ink hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={onReview}
                disabled={!canReview || reviewRunning}
                className="rounded px-1 font-medium text-muted-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Review
              </button>
            ))}
          {onCompare !== undefined && (
            <button
              type="button"
              onClick={onCompare}
              disabled={!canCompare}
              className="rounded px-1 font-medium text-muted-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Compare
            </button>
          )}
          {rail !== null && (
            <button
              type="button"
              onClick={rail.onToggle}
              aria-expanded={rail.open}
              aria-controls={RAIL_ELEMENT_ID}
              title={rail.open ? "Hide the rail" : "Show the rail"}
              className="rounded px-1 font-medium text-muted-ink hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {railOfferLabel(rail.openFindingCount)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
