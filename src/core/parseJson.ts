/**
 * The shared shape check for parsed model output: a non-null object, which is
 * what both parsers try to read fields from. An array satisfies this, so a
 * caller that needs a plain object also checks `Array.isArray`.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
