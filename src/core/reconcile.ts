import { resolveAnchor } from "./anchor";
import type { Finding } from "./finding";

/**
 * Merges a fresh Run's Findings with the Findings already stored for the same
 * Pass. A rule Pass re-runs on every save, so without this the sidebar would
 * grow a duplicate for every keystroke pause and a status the Writer set would
 * reset each time.
 *
 * Matching is by *resolved interval*, not by id or offset: offsets rot and the
 * fresh Run carries new ids, but a quote that resolves to the same span is the
 * same problem.
 *
 * A matched Finding keeps the fields the Writer owns (`id`, `status`,
 * `declineReason`) and the fields that pin it to a coordinate system (`anchor`,
 * `provenance`): the anchor's offset and its `provenance.revisionId` must name
 * the same canonical string, or #5's diff-projection projects in the wrong
 * coordinates. The Run-derived prose (`issue`, `diagnosis`, `pattern`,
 * `promptHash`) refreshes, so an edited Rule config is reflected. `anchor.state`
 * is recomputed by resolution, never carried over.
 *
 * Findings the Run did not re-produce are kept — an Orphaned Finding stays open
 * and actionable — except a duplicate that resolves onto a span the Run did
 * re-find, which the Run has already accounted for.
 *
 * Pure and DOM-free.
 */
export function reconcileFindings(
  produced: Finding[],
  existing: Finding[],
  canonical: string,
): Finding[] {
  const producedIntervals = produced.map((finding) => resolveAnchor(finding.anchor, canonical));
  const claimed = new Set<string>();
  const result: Finding[] = [];

  for (let index = 0; index < produced.length; index++) {
    const finding = produced[index];
    const interval = producedIntervals[index];
    const match = existing.find(
      (candidate) =>
        !claimed.has(candidate.id) && sameInterval(resolveAnchor(candidate.anchor, canonical), interval),
    );

    if (match === undefined) {
      result.push(finding);
      continue;
    }

    claimed.add(match.id);
    result.push({
      ...match,
      issue: finding.issue,
      diagnosis: finding.diagnosis,
      promptHash: finding.promptHash,
      ...(finding.pattern === undefined ? {} : { pattern: finding.pattern }),
      anchor: { ...match.anchor, state: "attached" },
    });
  }

  for (const finding of existing) {
    if (claimed.has(finding.id)) continue;
    const interval = resolveAnchor(finding.anchor, canonical);
    if (interval !== null && producedIntervals.some((candidate) => sameInterval(candidate, interval))) {
      // The Run re-found this span and another stored Finding already claimed
      // it; this copy is the duplicate the merge exists to remove.
      continue;
    }
    result.push({
      ...finding,
      anchor: { ...finding.anchor, state: interval === null ? "orphaned" : "attached" },
    });
  }

  return documentOrder(result, canonical);
}

function sameInterval(
  a: { start: number; end: number } | null,
  b: { start: number; end: number } | null,
): boolean {
  return a !== null && b !== null && a.start === b.start && a.end === b.end;
}

/**
 * Whether any candidate span is not already represented by a stored Finding.
 * A Run only needs a Revision when it has something new to attribute; a Run
 * that re-finds spans already stored leaves their provenance untouched.
 */
export function hasUnmatchedSpan(
  candidates: { quote: string; offset: number }[],
  existing: Finding[],
  canonical: string,
): boolean {
  const existingIntervals = existing
    .map((finding) => resolveAnchor(finding.anchor, canonical))
    .filter((interval): interval is { start: number; end: number } => interval !== null);

  return candidates.some((candidate) => {
    const interval = resolveAnchor(candidate, canonical);
    return interval !== null && !existingIntervals.some((entry) => sameInterval(entry, interval));
  });
}

/** Findings within a Pass in document order, Orphaned ones last. */
function documentOrder(findings: Finding[], canonical: string): Finding[] {
  return findings
    .map((finding, index) => ({ finding, index, interval: resolveAnchor(finding.anchor, canonical) }))
    .sort((a, b) => {
      if (a.interval === null && b.interval === null) return a.index - b.index;
      if (a.interval === null) return 1;
      if (b.interval === null) return -1;
      if (a.interval.start !== b.interval.start) return a.interval.start - b.interval.start;
      return a.index - b.index;
    })
    .map((entry) => entry.finding);
}
