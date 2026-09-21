import { PRIVACY_SECTIONS, type PrivacyLink } from "./privacyContent";

/**
 * The privacy page. It is prose, not a control: it explains what happens to the
 * Writer's words, how to check those claims in DevTools, and where to read more.
 * Nothing here sends anything or inserts anything; it is the surface that makes
 * the tool's central promise auditable.
 */
export function PrivacyView() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <article className="mx-auto max-w-2xl px-6 py-8">
        <h2 className="text-lg font-semibold tracking-tight">Privacy</h2>
        <p className="mt-1 text-sm text-stone-500">
          What happens to your words, and how to check it yourself.
        </p>

        {PRIVACY_SECTIONS.map((section) => (
          <section key={section.heading} className="mt-8">
            <h3 className="text-base font-semibold text-stone-900">{section.heading}</h3>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-sm leading-relaxed text-stone-700">
                {paragraph}
              </p>
            ))}
            {section.links !== undefined && <LinkList links={section.links} />}
            {section.steps !== undefined && (
              <ol className="mt-4 space-y-4">
                {section.steps.map((step) => (
                  <li key={step.title}>
                    <h4 className="text-sm font-semibold text-stone-900">{step.title}</h4>
                    {step.body.map((paragraph) => (
                      <p key={paragraph} className="mt-1 text-sm leading-relaxed text-stone-700">
                        {paragraph}
                      </p>
                    ))}
                    {step.links !== undefined && <LinkList links={step.links} />}
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

/**
 * The outward links on a section or a step: the sources a reader can open to
 * check a claim. Each one opens in a new tab with `noopener noreferrer`, so the
 * page it points at gets no handle on this tab, and it is marked as leaving the
 * app. The link list is data, so the claims test can assert the sources exist.
 */
function LinkList({ links }: { links: readonly PrivacyLink[] }) {
  return (
    <ul className="mt-3 space-y-1">
      {links.map((link) => (
        <li key={link.href}>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-700 underline underline-offset-2 hover:text-blue-900"
          >
            {link.label}
            <span aria-hidden="true"> ↗</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
