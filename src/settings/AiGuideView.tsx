import { Fragment, type ReactNode } from "react";
import { pageOrigin } from "../wire/ollama";
import { aiGuideSections, type GuideBlock, type GuideMode } from "./aiGuideContent";

/**
 * The AI guide under AI Settings: how to connect each Provider, what every
 * setting does, the limits and the errors. It is prose, not a control: nothing
 * here sends a request or changes a setting. The content lives in
 * `aiGuideContent.ts` so it can be asserted without a DOM.
 */
export function AiGuideView() {
  const sections = aiGuideSections(pageOrigin());

  return (
    <article className="space-y-8">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">Guide to models and Providers</h2>
        <p className="mt-1 text-sm text-faint-ink">
          How to connect each Provider, what every setting does, the limits Obelus applies, and why
          requests leave from your browser.
        </p>
        <nav aria-label="Guide sections" className="mt-4">
          <ol className="space-y-1 text-sm">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  onClick={(event) => {
                    // The app has no router; scroll instead of changing the hash.
                    event.preventDefault();
                    document.getElementById(section.id)?.scrollIntoView({ block: "start" });
                  }}
                  className="text-quiet-ink underline hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {section.heading}
                </a>{" "}
                <span className="text-xs text-faint-ink">· {section.mode}</span>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      {sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-8">
          <ModeLabel mode={section.mode} />
          <h3 className="mt-1 text-lg font-semibold text-ink">{section.heading}</h3>
          <Blocks blocks={section.blocks} />
        </section>
      ))}
    </article>
  );
}

function ModeLabel({ mode }: { mode: GuideMode }) {
  return (
    <span className="rounded bg-sunk px-1.5 py-0.5 text-xs font-medium text-faint-ink">{mode}</span>
  );
}

function Blocks({ blocks }: { blocks: readonly GuideBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </>
  );
}

function Block({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case "p":
      return <p className="mt-3 text-sm leading-relaxed text-quiet-ink">{inline(block.text)}</p>;
    case "steps":
      return (
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-quiet-ink">
          {block.items.map((item) => (
            <li key={item}>{inline(item)}</li>
          ))}
        </ol>
      );
    case "list":
      return (
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-quiet-ink">
          {block.items.map((item) => (
            <li key={item}>{inline(item)}</li>
          ))}
        </ul>
      );
    case "code":
      return (
        <pre className="mt-2 overflow-x-auto rounded border border-rule-soft bg-sunk px-3 py-2 text-xs text-soft-ink">
          <code>{block.text}</code>
        </pre>
      );
    case "table":
      return (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr>
                {block.head.map((cell) => (
                  <th
                    key={cell}
                    scope="col"
                    className="border-b border-rule px-2 py-1.5 font-semibold text-soft-ink"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="align-top">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="border-b border-rule-soft px-2 py-1.5 leading-relaxed text-quiet-ink"
                    >
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "sub":
      return (
        <div className="mt-5">
          <h4 className="text-sm font-semibold text-ink">{block.heading}</h4>
          <Blocks blocks={block.blocks} />
        </div>
      );
  }
}

/** `code`, **bold** and <https://links>, the only inline markup the guide uses. */
function inline(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|<https?:\/\/[^>]+>)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return (
        <code key={index} className="rounded bg-sunk px-1 text-[0.95em] text-soft-ink">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 3) {
      return (
        <strong key={index} className="font-semibold text-soft-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("<http") && part.endsWith(">")) {
      const url = part.slice(1, -1);
      return (
        <a
          key={index}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {url}
        </a>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
