/** One place to turn an unknown failure into a message the Writer can read. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
