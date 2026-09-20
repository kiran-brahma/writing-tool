/**
 * The shared shape check for parsed model output. Both the findings parser and
 * the Judge parser must agree on what "the model returned a JSON object" means,
 * so neither owns a private definition that can drift from the other.
 */

/** Whether a parsed value is a JSON object. Arrays and `null` are not. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
