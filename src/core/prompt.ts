/**
 * Prompt templates are data, so the placeholders they may use are a closed set.
 * `fillPrompt` substitutes the placeholders a Pass actually has values for and
 * leaves the rest alone — an unknown placeholder is a save-time error in #10's
 * Workbench, not something to paper over at Run time.
 */

import type { Target } from "./target";

export const PROMPT_PLACEHOLDERS = [
  "title",
  "outline",
  "document",
  "target",
  "context_above",
  "context_below",
] as const;

export type PromptPlaceholder = (typeof PROMPT_PLACEHOLDERS)[number];

/**
 * The placeholders as they are written in a template, in order. One source for
 * the assistant's instruction, the Workbench's legend and the validator, so the
 * closed set cannot drift between them.
 */
export function placeholderTokens(): string[] {
  return PROMPT_PLACEHOLDERS.map((name) => `{{${name}}}`);
}

export type PromptValues = Partial<Record<PromptPlaceholder, string>>;

const PLACEHOLDER_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

const KNOWN_PLACEHOLDERS = new Set<string>(PROMPT_PLACEHOLDERS);

/**
 * Any `{{...}}` in a template, whether or not it names a known placeholder. The
 * inner text is captured loosely — including uppercase and spaces — so a typo
 * like `{{Title}}` or `{{context}}` is caught on save rather than left verbatim
 * when the prompt is filled at Run time (story 100).
 */
const ANY_PLACEHOLDER_PATTERN = /\{\{\s*([^{}]*?)\s*\}\}/g;

/**
 * Story 100: the unknown placeholder names in a template, in first-seen order
 * and deduplicated. An empty list means every placeholder the template names is
 * one Obelus can fill.
 */
export function findUnknownPlaceholders(template: string): string[] {
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const match of template.matchAll(ANY_PLACEHOLDER_PATTERN)) {
    const name = match[1];
    if (KNOWN_PLACEHOLDERS.has(name) || seen.has(name)) continue;
    seen.add(name);
    unknown.push(name);
  }
  return unknown;
}

/** Replaces every `{{name}}` that has a value; leaves the rest verbatim. */
export function fillPrompt(template: string, values: PromptValues): string {
  return template.replace(PLACEHOLDER_PATTERN, (match, name: string) => {
    const value = (values as Record<string, string | undefined>)[name];
    return value === undefined ? match : value;
  });
}

/**
 * The placeholder values a Pass's scope permits, all carried on the Target.
 * One mapping for every model Pass, findings or Reader account, so a new output
 * shape cannot fill `{{document}}` differently from the pass that came before it.
 */
export function promptValues(target: Target): PromptValues {
  return {
    title: target.title,
    outline: target.outline,
    // The Target placeholder is always the text the Run was asked about.
    target: target.text,
    context_above: target.contextAbove,
    context_below: target.contextBelow,
    // The Document text this Target exposes: the whole Document for a
    // structural Target sent in one call, one chunk of it for a chunked Run,
    // empty for a local Target. The Target decides it, not the caller.
    document: target.documentText,
  };
}

/**
 * The characters a Run actually sends: the Pass template with the Target's
 * placeholder values filled, the same builder `critiqueOnce` uses. A local Pass
 * is priced at its Target plus the one Paragraph of context either side, not at
 * the whole Document; a structural Pass that fills `{{document}}` is priced at
 * the Document it sends. Cost is an estimate over what leaves the browser, so it
 * follows the request, not the Document.
 */
export function promptCharacters(template: string, target: Target): number {
  return fillPrompt(template, promptValues(target)).length;
}
