/**
 * Session-only keys live here and nowhere else: a module-level map that a
 * reload empties. Nothing writes it to storage, so "never persisted" is true by
 * construction rather than by a flag that could be forgotten.
 */
const sessionKeys = new Map<string, string>();

export function setSessionKey(connectionId: string, apiKey: string): void {
  if (apiKey === "") sessionKeys.delete(connectionId);
  else sessionKeys.set(connectionId, apiKey);
}

export function getSessionKey(connectionId: string): string | null {
  return sessionKeys.get(connectionId) ?? null;
}

export function clearSessionKey(connectionId: string): void {
  sessionKeys.delete(connectionId);
}

/** Exposed for tests and for a future "forget all session keys" action. */
export function clearAllSessionKeys(): void {
  sessionKeys.clear();
}
