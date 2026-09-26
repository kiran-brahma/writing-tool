import { RAIL_ELEMENT_ID } from "./railPresentation";
import { railOfferLabel, wordCountLabel } from "./statusLine";

/** Story 253: the Rail as the Status line offers it below 1024px. */
export interface StatusLineRailOffer {
  openFindingCount: number;
  /** Whether the Rail is overlaying the prose now. */
  open: boolean;
  onToggle: () => void;
}

/**
 * Story 200: the Status line, beneath the prose at every width, carrying the
 * Document's word count. It is the tool's, not the Writer's, so it is set in
 * the sans, and it lines up with the column. It sticks to the foot of the
 * window when the page is taller than the screen, so the count is always in
 * view at a glance. The count follows the Document of
 * record, which settles once the Writer pauses, so it updates as they type
 * without re-rendering the shell on every keystroke. It is not a live region:
 * a count announced after every pause would talk over the Writer.
 *
 * Story 253: below 1024px, where the Rail is hidden until it overlays the
 * prose, the Status line also offers the Rail with the open-Finding count.
 */
export function StatusLine({
  wordCount,
  rail = null,
}: {
  wordCount: number;
  rail?: StatusLineRailOffer | null;
}) {
  return (
    <div className="sticky bottom-0 border-t border-rule-faint bg-paper">
      <div className="obelus-column flex items-center justify-between gap-4 py-1.5 text-xs tabular-nums text-faint-ink">
        <p>{wordCountLabel(wordCount)}</p>
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
  );
}
