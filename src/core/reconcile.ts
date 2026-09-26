import { anchorResolver } from "./anchor";
import type { Finding, Interval } from "./finding";

/**
 * Merges a fresh Run's Findings with the Findings already stored for the same
 * Pass. A rule Pass re-runs on every save, so without this the sidebar would
 * grow a duplicate for every keystroke pause and a status the Writer set would
 * reset each time.
 *
 * Matching is by *resolved interval*, not by id or offset: offsets rot and the
 * fresh Run carries new ids, but a quote that resolves to the same span is the
 * same problem. A stored Finding is resolved the same way re-resolution does —
 * diff-projected from its provenance Revision — so a Finding the Writer rewrote
 * inside still matches the span the Run re-found, and reconciliation and
 * re-resolution never disagree about where a Finding sits.
 *
 * A matched Finding keeps the fields the Writer owns (`id`, `status`,
 * `declineReason`) and the fields that pin it to a coordinate system (`anchor`,
 * `provenance`): the anchor's offset and its `provenance.revisionId` must name
 * the same canonical string, or projection would move in the wrong coordinates.
 * The Run-derived prose (`issue`, `diagnosis`, `pattern`, `promptHash`)
 * refreshes, so an edited Rule config is reflected. A matched Finding is
 * `attached` by construction — the match required its stored Anchor to resolve
 * to the same span — and an unmatched one has its `anchor.state` recomputed by
 * resolution.
 *
 * Findings the Run did not re-produce are dropped, with one exception: a
 * Finding whose quote is no longer in the canonical string is kept as
 * Orphaned, because the problem may outlive the words that named it. An
 * attached Finding the current Pass no longer produces is stale — the Pass is
 * the authority on what it flags — so editing a Rule config takes effect on the
 * next Run, and a duplicate of a span the Run already accounted for is removed.
 *
 * Pure and DOM-free. `provenanceCanonical` supplies the projection source for a
 * stored Finding; without it, stored Findings resolve by quote match, which is
 * the identity projection and the behaviour a Run on unchanged text needs.
 */
export function reconcileFindings(
  produced: Finding[],
  existing: Finding[],
  canonical: string,
  provenanceCanonical: (revisionId: string) => string | undefined = () => undefined,
): Finding[] {
  const resolve = anchorResolver(canonical);
  const producedIntervals = produced.map((finding) => resolve(finding.anchor));
  const claimed = new Set<string>();
  // A resolved Finding travels with its already-computed interval. A produced
  // Finding's interval is in current coordinates and must not be re-projected
  // from a provenance string, which is a coordinate system it never saw.
  const entries: { finding: Finding; interval: Interval | null }[] = [];

  // Resolve each stored Finding once; a pass can hold many. The resolver shares
  // one diff per provenance Revision, the expensive part, across all of them.
  const resolvedExisting = new Map<string, Interval | null>();
  const intervalFor = (finding: Finding): Interval | null => {
    if (resolvedExisting.has(finding.id)) return resolvedExisting.get(finding.id) ?? null;
    const interval = resolve(finding.anchor, provenanceCanonical(finding.provenance.revisionId));
    resolvedExisting.set(finding.id, interval);
    return interval;
  };

  // Stored Findings by resolved interval, each bucket in stored order, so a
  // match is a lookup rather than a scan of every stored Finding for every
  // produced one — quadratic once a Pass holds hundreds. The first unclaimed
  // Finding in a bucket is the one a scan in stored order would have found.
  const byInterval = new Map<string, Finding[]>();
  for (const candidate of existing) {
    const interval = intervalFor(candidate);
    if (interval === null) continue;
    const key = intervalKey(interval);
    const bucket = byInterval.get(key);
    if (bucket === undefined) byInterval.set(key, [candidate]);
    else bucket.push(candidate);
  }

  for (let index = 0; index < produced.length; index++) {
    const finding = produced[index];
    const interval = producedIntervals[index];
    const match =
      interval === null
        ? undefined
        : byInterval.get(intervalKey(interval))?.find((candidate) => !claimed.has(candidate.id));

    if (match === undefined) {
      entries.push({ finding, interval });
      continue;
    }

    claimed.add(match.id);
    // The Run's prose — and therefore its violations — refreshes; the Writer's
    // fields and the coordinates stay. A violation the Run no longer produces
    // must clear, so `violations` is dropped from the match before it is set.
    // The Voice-list annotation is Run-derived too (story 152): a fresh Run
    // decides it, so a stale one is dropped from the match as well. So is the
    // severity (story 138): the rule that produced the Finding decides it.
    const {
      violations: _previousViolations,
      inVoiceList: _previousInVoiceList,
      severity: _previousSeverity,
      ...writerFields
    } = match;
    entries.push({
      finding: {
        ...writerFields,
        issue: finding.issue,
        diagnosis: finding.diagnosis,
        pattern: finding.pattern,
        promptHash: finding.promptHash,
        anchor: { ...match.anchor, state: "attached" },
        ...(finding.violations === undefined ? {} : { violations: finding.violations }),
        ...(finding.inVoiceList === undefined ? {} : { inVoiceList: finding.inVoiceList }),
        ...(finding.severity === undefined ? {} : { severity: finding.severity }),
      },
      interval,
    });
  }

  for (const finding of existing) {
    if (claimed.has(finding.id)) continue;
    // Orphaned: the text the Anchor named is gone, so the Finding stays open
    // and actionable. Attached but not re-produced: either a duplicate of a
    // span the Run already claimed, or a problem the current Pass no longer
    // flags. The Run decides the whole set, so it drops.
    if (intervalFor(finding) === null) {
      entries.push({
        finding: { ...finding, anchor: { ...finding.anchor, state: "orphaned" } },
        interval: null,
      });
    }
  }

  return documentOrder(entries);
}

function intervalKey(interval: Interval): string {
  return `${interval.start}:${interval.end}`;
}

/** Findings within a Pass in document order, Orphaned ones last. */
function documentOrder(
  entries: { finding: Finding; interval: Interval | null }[],
): Finding[] {
  return entries
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => {
      if (a.interval === null && b.interval === null) return a.index - b.index;
      if (a.interval === null) return 1;
      if (b.interval === null) return -1;
      if (a.interval.start !== b.interval.start) return a.interval.start - b.interval.start;
      return a.index - b.index;
    })
    .map((entry) => entry.finding);
}
