import type { Interval } from "./finding";
import { fnv1a } from "./hash";

/**
 * The Run cache's key, as pure Core. It is everything that shapes what a model
 * Pass returns except the prose-agnostic plumbing: the hash of the Document's
 * text and title, the Pass, its `promptHash`, the Connection and model, the
 * Target the Run was asked about, and the two global settings that change the
 * request the Run makes (the Screening frame and the chunking limit).
 *
 * The spec names `hash(canonical string) + pass id + promptHash + Connection +
 * model`. The title is folded into the text hash because `{{title}}` is a
 * placeholder, so the title shapes the Run; `screeningFrame` and
 * `characterLimit` are added on top because both change what the Transport is
 * asked. A cache that ignored any of them could return Findings the current Run
 * would not have produced — exactly what `promptHash` exists to prevent. They
 * only ever add misses, never a wrong hit.
 *
 * The Connection belongs in the key because two Connections can serve the same
 * model id — and a Custom Connection's base URL and Protocol can be edited in
 * place under the same id, so all three wire-shaping fields are keyed, not just
 * the id. The text hash ties the entry to the exact Document text, so any edit
 * anywhere misses rather than returning Findings for prose that no longer
 * exists.
 *
 * The Target interval is in the key because a local Pass's input depends on the
 * cursor, not only on the Document: `{{target}}`, `{{context_above}}` and
 * `{{context_below}}` are all filled from the Target. Two Runs of the same Pass
 * over the same unchanged Document with the cursor in different Paragraphs make
 * different requests, so they must not share a cache entry. The whole-Document
 * hash already covers the text; the interval says *which* Paragraph or Section
 * the Run was asked about.
 */
export interface RunCacheKeyInput {
  /**
   * The Document text's hash, together with its title: both shape the prompt
   * (`{{title}}` is a placeholder), so a cache keyed on the text alone could
   * return Findings produced under a different title.
   */
  canonicalHash: string;
  passId: string;
  promptHash: string;
  connectionId: string;
  /**
   * The Connection's Protocol and base URL, because both shape the request and
   * a Custom Connection can be repointed in place under the same id. Plain
   * strings rather than the wire `Protocol` type, so Core stays wire-free.
   */
  protocol: string;
  baseUrl: string;
  model: string;
  screeningFrame: boolean;
  characterLimit: number;
  /**
   * Story 151: the Voice list is attached to a Findings pass's request, so it
   * shapes what the Transport is asked. A change to it must miss the cache
   * rather than reuse Findings annotated against the previous list.
   */
  voiceList: string[];
  /** The Target's half-open interval in the Document's canonical string. */
  target: Interval;
}

/** FNV-1a over the one canonical string. */
export function hashCanonical(canonical: string): string {
  return fnv1a(canonical);
}

/**
 * The hash the cache keys on: the Document's title and canonical text together.
 * The title is in the prompt's `{{title}}` placeholder, so it shapes the Run as
 * much as the prose does.
 */
export function hashRunText(title: string, canonical: string): string {
  return hashCanonical(JSON.stringify([title, canonical]));
}

/**
 * The cache key as one string. JSON over an array rather than a separator join:
 * a model id or Connection name may contain any character, and a delimiter that
 * appears inside a field could make two different Runs collide.
 */
export function runCacheKey(input: RunCacheKeyInput): string {
  return JSON.stringify([
    input.canonicalHash,
    input.passId,
    input.promptHash,
    input.connectionId,
    input.protocol,
    input.baseUrl,
    input.model,
    input.screeningFrame,
    input.characterLimit,
    input.voiceList,
    input.target.start,
    input.target.end,
  ]);
}
