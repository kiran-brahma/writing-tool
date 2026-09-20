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

export type PromptValues = Partial<Record<PromptPlaceholder, string>>;

const PLACEHOLDER_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

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
