import { resolveAnchor } from "./anchor";
import type { Finding, Interval } from "./finding";

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
 * `promptHash`) refreshes, so an edited Rule config is reflected. A matched
 * Finding is `attached` by construction — the match required its stored Anchor
 * to resolve to the same span — and an unmatched one has its `anchor.state`
 * recomputed by resolution.
 *
 * Findings the Run did not re-produce are dropped, with one exception: a
 * Finding whose quote is no longer in the canonical string is kept as
 * Orphaned, because the problem may outlive the words that named it. An
 * attached Finding the current Pass no longer produces is stale — the Pass is
 * the authority on what it flags — so editing a Rule config takes effect on the
 * next Run, and a duplicate of a span the Run already accounted for is removed.
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
    // The Run's prose — and therefore its violations — refreshes; the Writer's
    // fields and the coordinates stay. A violation the Run no longer produces
    // must clear, so `violations` is dropped from the match before it is set.
    const { violations: _previousViolations, ...writerFields } = match;
    result.push({
      ...writerFields,
      issue: finding.issue,
      diagnosis: finding.diagnosis,
      pattern: finding.pattern,
      promptHash: finding.promptHash,
      anchor: { ...match.anchor, state: "attached" },
      ...(finding.violations === undefined ? {} : { violations: finding.violations }),
    });
  }

  for (const finding of existing) {
    if (claimed.has(finding.id)) continue;
    const interval = resolveAnchor(finding.anchor, canonical);
    // Orphaned: the quoted text is gone, so the Finding stays open and
    // actionable. Attached but not re-produced: either a duplicate of a span
    // the Run already claimed, or a problem the current Pass no longer flags.
    // The Run decides the whole set, so it drops.
    if (interval === null) {
      result.push({ ...finding, anchor: { ...finding.anchor, state: "orphaned" } });
    }
  }

  return documentOrder(result, canonical);
}

function sameInterval(a: Interval | null, b: Interval | null): boolean {
  return a !== null && b !== null && a.start === b.start && a.end === b.end;
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
