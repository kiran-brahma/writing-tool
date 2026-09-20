/**
 * The Finding shape the spec publishes. A Finding is analysis anchored to the
 * prose it concerns: there is no field for rewritten prose, so the schema
 * itself cannot carry a model's sentence into a Document.
 *
 * `anchor.state` is *computed on every resolution* and never authored. A rule
 * pass or parser may set `quote` and `offset`; only `resolveAnchor` may decide
 * whether the Anchor is `attached` or `orphaned`.
 */

export type FindingStatus = "open" | "addressed" | "declined";

/** Present only when a Finding is declined. */
export type DeclineReason = "advice" | "violation";

export type AnchorState = "attached" | "orphaned";

export interface AnchorDraft {
  quote: string;
  /** A hint for resolution; never the sole basis. */
  offset: number;
}

export interface Anchor extends AnchorDraft {
  state: AnchorState;
}

/** The data a Run records about what produced a Finding. */
export interface Provenance {
  providerId: string;
  model: string;
  at: number;
  revisionId: string;
}

/**
 * Praise or rewrite-shaped content caught in model output. About the model
 * misbehaving, never about the prose. The praise linter that fills this in is
 * #24's; the shape lives here because every Finding carries it.
 */
export interface Violation {
  kind: "praise" | "rewrite";
  text: string;
}

export interface Finding {
  id: string;
  passId: string;
  promptHash: string;
  anchor: Anchor;
  issue: string;
  diagnosis: string;
  pattern?: string;
  status: FindingStatus;
  declineReason?: DeclineReason;
  provenance: Provenance;
  violations?: Violation[];
}

/** A half-open interval `[start, end)` over the canonical string. */
export interface Interval {
  start: number;
  end: number;
}

/**
 * Whether a Finding is still in the Writer's queue. Status is exactly `open`,
 * `addressed` or `declined`; only `open` is work remaining, and an addressed or
 * declined Finding has left the queue without being erased.
 */
export function isOpenFinding(finding: Finding): boolean {
  return finding.status === "open";
}

/** A half-open range in the Editor's document, what `projectInterval` returns. */
export interface EditorRange {
  from: number;
  to: number;
}
