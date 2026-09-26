import type { Section } from "../core/sections";
import { PANEL_GLOSSES, type HelpSectionId } from "../help/helpContent";

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
        <h2 className="text-sm font-semibold">Outline</h2>
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
          {sections.map((section) => {
            const active = section.headingBlockIndex === activeHeadingBlockIndex;
            return (
              <li key={`${section.headingBlockIndex}:${section.heading}`}>
                <button
                  type="button"
                  onClick={() => onJump(section.headingBlockIndex)}
                  title={`Jump to ${section.heading}`}
                  aria-current={active ? "true" : undefined}
                  style={{ paddingLeft: `${(section.level - 1) * 12 + 16}px` }}
                  className={[
                    "w-full truncate py-1 pr-4 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset",
                    active
                      ? "bg-sunk-strong font-medium text-ink"
                      : "text-quiet-ink hover:bg-sunk-strong/60",
                  ].join(" ")}
                >
                  {section.heading}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
