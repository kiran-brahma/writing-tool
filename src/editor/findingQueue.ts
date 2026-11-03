import type { Finding } from "../core/finding";

/**
 * The id to select when the Writer steps with `j` or `k`. With no current
 * selection, forward picks the first open Finding and backward the last. At
 * either end the selection stays put rather than wrapping, so a held key does
 * not cycle.
 */
export function stepSelection(
  open: Finding[],
  currentId: string | null,
  direction: 1 | -1,
): string | null {
  if (open.length === 0) return null;
  const index = currentId === null ? -1 : open.findIndex((finding) => finding.id === currentId);
  if (index === -1) return direction === 1 ? open[0].id : open[open.length - 1].id;

  const next = index + direction;
  if (next < 0 || next >= open.length) return open[index].id;
  return open[next].id;
}

/**
 * The id to select after the Writer marks a Finding addressed or declines it.
 * The queue from *before* the write is passed in, so the Finding that slid into
 * the vacated slot is chosen and the Writer keeps their place instead of
 * skipping a problem.
 */
export function selectionAfterLeavingQueue(
  openBefore: Finding[],
  leavingId: string,
): string | null {
  const index = openBefore.findIndex((finding) => finding.id === leavingId);
  const remaining = openBefore.filter((finding) => finding.id !== leavingId);
  if (remaining.length === 0) return null;
  if (index === -1) return remaining[0].id;
  return remaining[Math.min(index, remaining.length - 1)].id;
}
