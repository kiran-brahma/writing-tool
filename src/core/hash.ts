/**
 * The one deterministic, dependency-free string hash in Core. FNV-1a is what
 * `promptHash` already used and what the Run cache's canonical hash uses, so
 * there is a single hash definition rather than two that could drift.
 *
 * It is deliberately not `crypto.subtle`: that is async and DOM-adjacent, and a
 * pure Core hash must not be.
 */
export function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
