import { DEFAULT_CHARACTER_LIMIT, MIN_CHARACTER_LIMIT } from "../core/chunking";
import type { ObelusDatabase } from "./obelusDatabase";

/**
 * Global settings that are not about one Document or one Connection. The
 * Screening frame is the first: it is the Critic's standing instruction, it
 * applies to critic Passes only, and the Writer can switch it off to compare
 * how a model behaves with and without it.
 */
const SCREENING_FRAME_SETTING_KEY = "screeningFrame";

/** The Screening frame is on by default; only an explicit `false` turns it off. */
export async function loadScreeningFrame(database: ObelusDatabase): Promise<boolean> {
  const record = await database.settings.get(SCREENING_FRAME_SETTING_KEY);
  return record === undefined ? true : record.value !== false;
}

export async function saveScreeningFrame(
  database: ObelusDatabase,
  enabled: boolean,
): Promise<boolean> {
  await database.settings.put({ key: SCREENING_FRAME_SETTING_KEY, value: enabled });
  return enabled;
}

/**
 * Story 50: the character limit above which a document-scope Run is chunked.
 * DESIGN calls it configurable, so it is a setting rather than a constant; the
 * pure Core default seeds it. A stored value that is not a number falls back to
 * the default rather than disabling the limit, and a value below the floor is
 * raised to the floor.
 */
export const CHARACTER_LIMIT_SETTING_KEY = "characterLimit";

export async function loadCharacterLimit(database: ObelusDatabase): Promise<number> {
  const record = await database.settings.get(CHARACTER_LIMIT_SETTING_KEY);
  return normalizeCharacterLimit(record?.value);
}

export async function saveCharacterLimit(
  database: ObelusDatabase,
  limit: number,
): Promise<number> {
  const normalized = normalizeCharacterLimit(limit);
  await database.settings.put({ key: CHARACTER_LIMIT_SETTING_KEY, value: normalized });
  return normalized;
}

/** A whole number at or above the floor, or the Core default otherwise. */
function normalizeCharacterLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_CHARACTER_LIMIT;
  return Math.max(MIN_CHARACTER_LIMIT, Math.round(value));
}
