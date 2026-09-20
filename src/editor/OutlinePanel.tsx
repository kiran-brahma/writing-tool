import type { Section } from "../core/sections";

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
}

export function OutlinePanel({ sections, activeHeadingBlockIndex, onJump }: OutlinePanelProps) {
  return (
    <section className="border-b border-stone-300 bg-stone-100/60">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2">
        <h2 className="text-sm font-semibold">Outline</h2>
        <span className="text-xs text-stone-500">
          {sections.length} {sections.length === 1 ? "section" : "sections"}
        </span>
      </div>

      {sections.length === 0 ? (
        <p className="px-4 py-4 text-sm text-stone-500">
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
                    "w-full truncate py-1 pr-4 text-left text-sm",
                    active
                      ? "bg-stone-200 font-medium text-stone-900"
                      : "text-stone-700 hover:bg-stone-200/60",
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
