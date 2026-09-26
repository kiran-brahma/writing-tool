import { wordCountLabel } from "./statusLine";

/**
 * Story 200: the Status line, beneath the prose at every width, carrying the
 * Document's word count. It is the tool's, not the Writer's, so it is set in
 * the sans, and it lines up with the column. It sticks to the foot of the
 * window when the page is taller than the screen, so the count is always in
 * view at a glance. The count follows the Document of
 * record, which settles once the Writer pauses, so it updates as they type
 * without re-rendering the shell on every keystroke. It is not a live region:
 * a count announced after every pause would talk over the Writer.
 */
export function StatusLine({ wordCount }: { wordCount: number }) {
  return (
    <div className="sticky bottom-0 border-t border-rule-faint bg-paper">
      <p className="obelus-column py-1.5 text-xs tabular-nums text-faint-ink">
        {wordCountLabel(wordCount)}
      </p>
    </div>
  );
}
