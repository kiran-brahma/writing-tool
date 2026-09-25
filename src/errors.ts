/** One place to turn an unknown failure into a message the Writer can read. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * True when a write failed because the browser's storage quota is full. Dexie
 * rejects with the DOMException it caught, whose `name` is the only reliable
 * signal: a plain `Error` is never this.
 */
export function isQuotaExceededError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "QuotaExceededError"
  );
}
