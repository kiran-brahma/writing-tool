import {
  DEFAULT_COLOR_SCHEME_SETTING,
  isColorSchemeSetting,
  type ColorSchemeSetting,
} from "../core/colorScheme";
import type { ObelusDatabase } from "./obelusDatabase";

/**
 * The three global preferences the shell still has: whether the rail is
 * collapsed, whether the first-run note was dismissed, and the colour scheme.
 * They share one key-value store and one shape — read, normalise, write.
 */
function setting<T>(key: string, normalize: (stored: unknown) => T) {
  return {
    async load(database: ObelusDatabase): Promise<T> {
      const record = await database.settings.get(key);
      return normalize(record?.value);
    },
    async save(database: ObelusDatabase, value: T): Promise<T> {
      const normalized = normalize(value);
      await database.settings.put({ key, value: normalized });
      return normalized;
    },
  };
}

/** Whether the rail is collapsed entirely. Off by default. */
export const RAIL_COLLAPSED_SETTING_KEY = "railCollapsed";

const railCollapsedSetting = setting<boolean>(RAIL_COLLAPSED_SETTING_KEY, (stored) => stored === true);

export const loadRailCollapsed = railCollapsedSetting.load;
export const saveRailCollapsed = railCollapsedSetting.save;

/** Whether the Writer has dismissed the first-run note. Off by default. */
export const FIRST_RUN_NOTE_SETTING_KEY = "firstRunNoteDismissed";

const firstRunNoteSetting = setting<boolean>(FIRST_RUN_NOTE_SETTING_KEY, (stored) => stored === true);

export const loadFirstRunNoteDismissed = firstRunNoteSetting.load;
export const saveFirstRunNoteDismissed = firstRunNoteSetting.save;

/** Light, Dark or System. System by default; an unknown value falls back. */
export const COLOR_SCHEME_SETTING_KEY = "colorScheme";

function normalizeColorScheme(value: unknown): ColorSchemeSetting {
  return isColorSchemeSetting(value) ? value : DEFAULT_COLOR_SCHEME_SETTING;
}

const colorSchemeSetting = setting<ColorSchemeSetting>(COLOR_SCHEME_SETTING_KEY, normalizeColorScheme);

export const loadColorScheme = colorSchemeSetting.load;
export const saveColorScheme = colorSchemeSetting.save;
