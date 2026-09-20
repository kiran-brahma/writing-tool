/**
 * Durability, the storage half of the offline shell: on the first save, ask the
 * browser to keep the Library rather than evict it under storage pressure.
 *
 * `navigator.storage.persist()` is a request, not a guarantee — the
 * last-backed-up reminder remains the real defence — so its answer is discarded
 * and a refusal never fails the save that triggered it. This module remembers
 * that it asked, so exactly one request is made per page load no matter how many
 * saves follow.
 */

let requested = false;

/** Ask the browser to persist the Library. Non-blocking and never throws. */
export function requestPersistentStorage(): void {
  if (requested) return;
  requested = true;

  const storage = globalThis.navigator?.storage;
  if (storage === undefined || typeof storage.persist !== "function") return;

  void storage.persist().catch(() => {
    // The browser declined to answer, or the request failed. This is a request,
    // not a guarantee, and the save it accompanies has already succeeded, so it
    // must not surface as a save failure. The backup reminder is the durable
    // defence against eviction, not this call.
  });
}
