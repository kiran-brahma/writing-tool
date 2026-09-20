import type { ObelusDatabase } from "./obelusDatabase";

/**
 * Global settings that are not about one Document or one Connection. The
 * Screening frame is the first: it is the Critic's standing instruction, it
 * applies to critic Passes only, and the Writer can switch it off to compare
 * how a model behaves with and without it.
 */
export const SCREENING_FRAME_SETTING_KEY = "screeningFrame";

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
