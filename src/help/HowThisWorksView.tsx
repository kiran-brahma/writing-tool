import { useEffect } from "react";
import { HELP_SECTIONS, type HelpSectionId } from "./helpContent";

/**
 * How this works. It is prose, not a control: it carries Rule 1 and Rule 2 in
 * full, the three-step loop, the glossary of the words the interface uses and
 * the shortcuts the app binds. It is a destination rather than a note, so the
 * two Rules have a permanent home in the product even after the first-run note
 * is dismissed. Nothing here sends anything or puts model text anywhere.
 */
export function HowThisWorksView({ initialSectionId = null }: { initialSectionId?: HelpSectionId | null }) {
  // Story 178: `?` opens the page at the shortcuts, not the top. The section id
  // is stable (`HELP_SECTION_IDS`) and the sections carry `scroll-mt-8`.
  useEffect(() => {
    if (initialSectionId === null) return;
    document.getElementById(initialSectionId)?.scrollIntoView({ block: "start" });
  }, [initialSectionId]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <article className="mx-auto max-w-2xl px-6 py-8">
        <h2 className="text-lg font-semibold tracking-tight">How this works</h2>
        <p className="mt-1 text-sm text-faint-ink">
          The method inside the tool: the two rules, the loop, the words, and the keys.
        </p>

        {HELP_SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="mt-8 scroll-mt-8">
            <h3 className="text-lg font-semibold text-ink">{section.heading}</h3>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-sm leading-relaxed text-quiet-ink">
                {paragraph}
              </p>
            ))}
            {section.items !== undefined && (
              <ol className="mt-4 space-y-4">
                {section.items.map((entry) => (
                  <li key={entry.title}>
                    <h4 className="text-sm font-semibold text-ink">{entry.title}</h4>
                    {entry.body.map((paragraph) => (
                      <p key={paragraph} className="mt-1 text-sm leading-relaxed text-quiet-ink">
                        {paragraph}
                      </p>
                    ))}
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </article>
    </div>
  );
}
