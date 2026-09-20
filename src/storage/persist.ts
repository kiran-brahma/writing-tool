/**
 * Durability, the storage half of the offline shell: on the first save, ask the
 * browser to keep the Library rather than evict it under pressure.
 *
 * `navigator.storage.persist()` is a request, not a guarantee — the
 * last-backed-up reminder remains the real defence — so its answer is
 * informational and a refusal never fails the save that triggered it. The
 * request is made once per app open, no matter how many saves follow.
 */

/** The one capability this needs, so a test can pass a fake without a DOM. */
export interface PersistentStorage {
  persist?: () => Promise<boolean>;
}

/** A one-shot, non-failing request to persist the browser's storage. */
export interface PersistRequest {
  /**
   * Ask the browser to persist storage. Idempotent: the first call performs the
   * request and every later call returns the same answer, including while the
   * first is still in flight. Resolves `null` when the browser exposes no
   * `persist`, or refused to answer.
   */
  request: () => Promise<boolean | null>;
}

export function createPersistRequest(storage: PersistentStorage | undefined): PersistRequest {
  let inFlight: Promise<boolean | null> | null = null;
  return {
    request() {
      inFlight ??= askToPersist(storage);
      return inFlight;
    },
  };
}

async function askToPersist(storage: PersistentStorage | undefined): Promise<boolean | null> {
  if (storage === undefined || typeof storage.persist !== "function") return null;
  try {
    return await storage.persist();
  } catch {
    // The browser declined to answer, or the request failed. This is a request,
    // not a guarantee, and the save it accompanies has already succeeded, so it
    // must not surface as a save failure. The backup reminder is the durable
    // defence against eviction, not this call.
    return null;
  }
}
