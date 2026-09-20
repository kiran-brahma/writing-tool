/**
 * The last-backed-up reminder: its thresholds and its wording. Nothing here
 * touches storage, so the reminder is testable without a browser. The backup
 * file format itself lives in `src/storage/durability.ts`, where it is read and
 * written.
 */

/**
 * A backup older than a week is worth a nudge. `navigator.storage.persist()` is
 * a request, not a guarantee, so the reminder is the real defence against
 * eviction; a week is long enough not to nag and short enough to matter.
 */
export const BACKUP_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export interface BackupReminder {
  /** `never` and `stale` both warrant drawing the Writer's eye. */
  stale: boolean;
  /** The sentence the Writer sees. */
  label: string;
}

/**
 * Story 113: a visible reminder of when the Writer last backed up. A null
 * timestamp means never, which is stale by definition — an eviction must not be
 * the thing that teaches the Writer to back up.
 */
export function backupReminder(
  lastBackedUp: number | null,
  now: number = Date.now(),
): BackupReminder {
  if (lastBackedUp === null) {
    return { stale: true, label: "Last backed up: never." };
  }
  const age = now - lastBackedUp;
  const stale = age >= BACKUP_STALE_AFTER_MS;
  const label = `Last backed up ${describeAge(age)}.`;
  return { stale, label };
}

/** A coarse, human age: the reminder never needs second precision. */
function describeAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
