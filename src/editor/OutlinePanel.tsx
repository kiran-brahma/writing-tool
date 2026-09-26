import type { Section } from "../core/sections";
import { PANEL_GLOSSES, type HelpSectionId } from "../help/helpContent";
import { outlineEntries } from "./outlineEntries";

/**
 * Story 25: the Document outline derived from the Writer's headings. It is the
 * same Section model the Passes reason about — `sections()` — rendered as a
 * list. Choosing a heading moves the Writer's cursor to that Section, so the
 * outline is navigation as well as a map of the piece.
 */
export interface OutlinePanelProps {
  sections: Section[];
  /** The heading block the cursor is inside, or null when it is in the preamble. */
  activeHeadingBlockIndex: number | null;
  onJump: (blockIndex: number) => void;
  onOpenHelp?: (sectionId: HelpSectionId) => void;
}

export function OutlinePanel({
  sections,
  activeHeadingBlockIndex,
  onJump,
  onOpenHelp,
}: OutlinePanelProps) {
  return (
    <section className="border-b border-rule bg-sunk/60">
      <div className="flex items-center justify-between border-b border-rule-soft px-4 py-2">
        <h2 className="text-base font-semibold">Outline</h2>
        <span className="text-xs text-muted-ink">
          {sections.length} {sections.length === 1 ? "section" : "sections"}
        </span>
      </div>

      <p className="border-b border-rule-soft px-4 py-2 text-xs text-muted-ink">
        {PANEL_GLOSSES.outline.text}{" "}
        <button
          type="button"
          onClick={() => onOpenHelp?.(PANEL_GLOSSES.outline.sectionId)}
          className="rounded px-0.5 underline hover:text-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          How this works
        </button>
      </p>

      {sections.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-ink">
          Add a heading to build your outline.
        </p>
      ) : (
        <ol className="max-h-56 overflow-y-auto py-1">
          {outlineEntries(sections, activeHeadingBlockIndex).map((entry) => (
            <li key={`${entry.headingBlockIndex}:${entry.heading}`}>
              <button
                type="button"
                onClick={() => onJump(entry.headingBlockIndex)}
                title={`Jump to ${entry.heading}`}
                aria-current={entry.current ? "true" : undefined}
                style={{ paddingLeft: `${(entry.level - 1) * 12 + 16}px` }}
                className={[
                  "w-full truncate py-1 pr-4 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset",
                  entry.current
                    ? "bg-sunk-strong font-medium text-ink"
                    : "text-quiet-ink hover:bg-sunk-strong/60",
                ].join(" ")}
              >
                {entry.heading}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export interface MarginOutlineProps {
  sections: Section[];
  /** The heading block the cursor is inside, or null when it is in the preamble. */
  activeHeadingBlockIndex: number | null;
  onJump: (blockIndex: number) => void;
}

/**
 * Stories 241 and 243: the Outline in the left margin at 1440px and wider, in
 * the space the capped column leaves empty beside the page. It is a quiet list
 * of headings, without the Rail section's chrome, that marks the Section the
 * cursor is in and jumps on click exactly as the Rail's Outline does. Both
 * render; the stylesheet shows one, so no script decides where the Outline is.
 */
export function MarginOutline({ sections, activeHeadingBlockIndex, onJump }: MarginOutlineProps) {
  return (
    <nav aria-label="Outline" className="py-8 pr-3 pl-4">
      <h2 className="mb-2 px-2 text-xs font-semibold text-muted-ink">Outline</h2>
      {sections.length === 0 && (
        <p className="px-2 text-xs text-muted-ink">Add a heading to build your outline.</p>
      )}
      <ol>
        {outlineEntries(sections, activeHeadingBlockIndex).map((entry) => (
          <li key={`${entry.headingBlockIndex}:${entry.heading}`}>
            <button
              type="button"
              onClick={() => onJump(entry.headingBlockIndex)}
              title={`Jump to ${entry.heading}`}
              aria-current={entry.current ? "true" : undefined}
              style={{ paddingLeft: `${(entry.level - 1) * 10 + 8}px` }}
              className={[
                "block w-full truncate border-l-2 py-0.5 pr-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                entry.current
                  ? "border-ink font-medium text-ink"
                  : "border-transparent text-muted-ink hover:text-quiet-ink",
              ].join(" ")}
            >
              {entry.heading}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
