/**
 * Prompt templates are data, so the placeholders they may use are a closed set.
 * `fillPrompt` substitutes the placeholders a Pass actually has values for and
 * leaves the rest alone — an unknown placeholder is a save-time error in #10's
 * Workbench, not something to paper over at Run time.
 */

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
