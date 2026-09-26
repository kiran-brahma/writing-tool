import { DEFAULT_CHARACTER_LIMIT, MIN_CHARACTER_LIMIT } from "../core/chunking";
import {
  DEFAULT_COLOR_SCHEME_SETTING,
  isColorSchemeSetting,
  type ColorSchemeSetting,
} from "../core/colorScheme";
import { isWorkingOrderBand, type WorkingOrderBand } from "../core/pass";
import { normalizeVoiceList } from "../core/voiceList";
import type { ObelusDatabase } from "./obelusDatabase";

/**
 * Global settings that are not about one Document or one Connection: the
 * Screening frame, the chunking character limit, the Voice list, the rail's
 * two view preferences, and the app's display preferences. They share one key-value store and one shape — read the
 * stored value, normalise it, write the normalised value back — so that shape
 * lives here once rather than being written out per setting.
 */
function setting<T>(key: string, normalize: (stored: unknown) => T) {
  return {
    /** The stored value through `normalize`, or the default when absent. */
    async load(database: ObelusDatabase): Promise<T> {
      const record = await database.settings.get(key);
      return normalize(record?.value);
    },
    /** Write the normalised value and return what was written. */
    async save(database: ObelusDatabase, value: T): Promise<T> {
      const normalized = normalize(value);
      await database.settings.put({ key, value: normalized });
      return normalized;
    },
  };
}

/**
 * The Screening frame: the Critic's standing instruction. It applies to critic
 * Passes only, and the Writer can switch it off to compare how a model behaves
 * with and without it. On by default; only an explicit `false` turns it off.
 */
const SCREENING_FRAME_SETTING_KEY = "screeningFrame";

const screeningFrameSetting = setting<boolean>(SCREENING_FRAME_SETTING_KEY, (stored) =>
  stored === undefined ? true : stored !== false,
);

export const loadScreeningFrame = screeningFrameSetting.load;
export const saveScreeningFrame = screeningFrameSetting.save;

/**
 * Story 50: the character limit above which a document-scope Run is chunked.
 * DESIGN calls it configurable, so it is a setting rather than a constant; the
 * pure Core default seeds it. A stored value that is not a number falls back to
 * the default rather than disabling the limit, and a value below the floor is
 * raised to the floor.
 */
export const CHARACTER_LIMIT_SETTING_KEY = "characterLimit";

/** A whole number at or above the floor, or the Core default otherwise. */
function normalizeCharacterLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_CHARACTER_LIMIT;
  return Math.max(MIN_CHARACTER_LIMIT, Math.round(value));
}

const characterLimitSetting = setting<number>(CHARACTER_LIMIT_SETTING_KEY, normalizeCharacterLimit);

export const loadCharacterLimit = characterLimitSetting.load;
export const saveCharacterLimit = characterLimitSetting.save;

/**
 * Stories 149–152: the Voice list, the words and phrases the Writer has
 * declared theirs. It is a JSON array of strings in the settings store beside
 * the Screening frame and the character limit. Stored as structured data rather
 * than a serialised string: the setting is read back by Core, not by a parser,
 * and normalisation is `normalizeVoiceList`, so a bad value degrades to the
 * empty list rather than throwing.
 */
export const VOICE_LIST_SETTING_KEY = "voiceList";

const voiceListSetting = setting<string[]>(VOICE_LIST_SETTING_KEY, normalizeVoiceList);

export const loadVoiceList = voiceListSetting.load;
export const saveVoiceList = voiceListSetting.save;

/**
 * ADR 0010: the rail opens on Structure the first time and on the last Band the
 * Writer was in thereafter. A default is not a gate. Only the three Bands are
 * stored — **All** is a view of the queue, not a Band, so selecting it leaves
 * the stored Band where it was. A value that is not a Band falls back to
 * Structure rather than leaving the rail with nothing selected.
 */
export const RAIL_BAND_SETTING_KEY = "railBand";

function normalizeRailBand(value: unknown): WorkingOrderBand {
  return isWorkingOrderBand(value) ? value : "structure";
}

const railBandSetting = setting<WorkingOrderBand>(RAIL_BAND_SETTING_KEY, normalizeRailBand);

export const loadRailBand = railBandSetting.load;
export const saveRailBand = railBandSetting.save;

/**
 * ADR 0010, story 166: whether the rail is collapsed entirely so the Writer has
 * the prose alone. Off by default; only an explicit `true` collapses it.
 */
export const RAIL_COLLAPSED_SETTING_KEY = "railCollapsed";

const railCollapsedSetting = setting<boolean>(RAIL_COLLAPSED_SETTING_KEY, (stored) => stored === true);

export const loadRailCollapsed = railCollapsedSetting.load;
export const saveRailCollapsed = railCollapsedSetting.save;

/**
 * Story 169: whether the Writer has dismissed the first-run note in the Editor
 * body. Off by default, so a new Writer meets the note once; only an explicit
 * `true` dismisses it. It lives in the existing key-value store, so no Dexie
 * migration is needed, and because it travels in a Backup a Restore carries the
 * dismissal onto a fresh browser. That is correct: a Writer restoring is not
 * new.
 */
export const FIRST_RUN_NOTE_SETTING_KEY = "firstRunNoteDismissed";

const firstRunNoteSetting = setting<boolean>(FIRST_RUN_NOTE_SETTING_KEY, (stored) => stored === true);

export const loadFirstRunNoteDismissed = firstRunNoteSetting.load;
export const saveFirstRunNoteDismissed = firstRunNoteSetting.save;

/**
 * Stories 201–204: the Writer's colour scheme — Light, Dark or System. System
 * by default, and a stored value that is not one of the three falls back to
 * System rather than forcing a scheme. It lives in the existing key-value store,
 * so no Dexie migration is needed, and it travels in a Backup like every
 * setting; an older build ignores it.
 */
export const COLOR_SCHEME_SETTING_KEY = "colorScheme";

function normalizeColorScheme(value: unknown): ColorSchemeSetting {
  return isColorSchemeSetting(value) ? value : DEFAULT_COLOR_SCHEME_SETTING;
}

const colorSchemeSetting = setting<ColorSchemeSetting>(COLOR_SCHEME_SETTING_KEY, normalizeColorScheme);

export const loadColorScheme = colorSchemeSetting.load;
export const saveColorScheme = colorSchemeSetting.save;

/**
 * Stories 73 and 238: whether each Finding row in the Rail shows the raw
 * provider response it came from, so the Writer can check the linter. A
 * debugging aid, so it is set from AI Settings rather than above the queue, and
 * remembered. Off by default; only an explicit `true` turns it on. It lives in
 * the existing key-value store, so no Dexie migration is needed, and it travels
 * in a Backup like every setting; an older build ignores it.
 */
export const SHOW_RAW_RESPONSE_SETTING_KEY = "showRawResponse";

const showRawResponseSetting = setting<boolean>(
  SHOW_RAW_RESPONSE_SETTING_KEY,
  (stored) => stored === true,
);

export const loadShowRawResponse = showRawResponseSetting.load;
export const saveShowRawResponse = showRawResponseSetting.save;
