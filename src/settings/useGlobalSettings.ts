import { useCallback, useState, type RefObject } from "react";
import { DEFAULT_CHARACTER_LIMIT } from "../core/chunking";
import { DEFAULT_COLOR_SCHEME_SETTING, type ColorSchemeSetting } from "../core/colorScheme";
import type { WorkingOrderBand } from "../core/pass";
import { describeError } from "../errors";
import type { ObelusDatabase } from "../storage/obelusDatabase";
import {
  loadCharacterLimit,
  loadColorScheme,
  loadFirstRunNoteDismissed,
  loadRailBand,
  loadRailCollapsed,
  loadScreeningFrame,
  loadVoiceList,
  saveCharacterLimit,
  saveColorScheme,
  saveFirstRunNoteDismissed,
  saveRailBand,
  saveRailCollapsed,
  saveScreeningFrame,
  saveVoiceList,
} from "../storage/settings";

/**
 * One global setting: the stored value in React state, the write path, and the
 * load path. Every setting in `src/storage/settings.ts` shares the same shape —
 * read the stored value, write the normalised value back, surface a write
 * failure — so that shape lives here once instead of seven times. The setters are
 * the only place `databaseRef` and `setSaveError` are touched.
 */
interface SettingHandle<T> {
  value: T;
  set: (next: T) => Promise<void>;
  load: (database: ObelusDatabase) => Promise<T>;
}

interface SettingOptions<T> {
  /** Read through the storage module's bound normaliser. */
  load: (database: ObelusDatabase) => Promise<T>;
  /** Write through the storage module's bound normaliser. */
  save: (database: ObelusDatabase, value: T) => Promise<T>;
  /** The value shown before the store has been read. */
  initial: T;
  databaseRef: RefObject<ObelusDatabase | null>;
  /** Surfaces a write failure; never a silent failure. */
  onError: (message: string) => void;
  /**
   * Set the visible value before the write resolves, so the surface does not lag
   * behind a click on IndexedDB. The stored value overwrites it once written.
   */
  optimistic?: boolean;
  /** Runs after a successful write, for the setting's own side effects. */
  onSaved?: (saved: T) => void | Promise<void>;
}

function useSetting<T>(options: SettingOptions<T>): SettingHandle<T> {
  const { load, save, initial, databaseRef, onError, optimistic, onSaved } = options;
  const [value, setValue] = useState<T>(initial);

  const set = useCallback(
    async (next: T) => {
      if (optimistic === true) setValue(next);
      const database = databaseRef.current;
      if (database === null) return;
      try {
        const saved = await save(database, next);
        setValue(saved);
        // A side effect that fails is surfaced like the write itself; the value
        // written above stands, exactly as it did when the two were one callback.
        if (onSaved !== undefined) await onSaved(saved);
      } catch (error) {
        onError(describeError(error));
      }
    },
    [databaseRef, onError, optimistic, save, onSaved],
  );

  const loadSetting = useCallback(
    async (database: ObelusDatabase) => {
      const loaded = await load(database);
      setValue(loaded);
      return loaded;
    },
    [load],
  );

  return { value, set, load: loadSetting };
}

export interface GlobalSettingsOptions {
  databaseRef: RefObject<ObelusDatabase | null>;
  /** Surfaces a write failure; never a silent failure. */
  onError: (message: string) => void;
  /**
   * Story 149: the Voice list is read synchronously by every rule and model Run,
   * so the setting keeps a ref beside its state.
   */
  voiceListRef: RefObject<string[]>;
  /** A Voice list change must re-run the rule Passes so declared words leave the queue. */
  onVoiceListSaved: () => void | Promise<void>;
}

export interface GlobalSettingsHandle {
  /** Stories 76, 77: the Critic's Screening frame, on by default. */
  screeningFrame: boolean;
  setScreeningFrame: (enabled: boolean) => Promise<void>;
  /** Story 50: the character limit above which a document Run is chunked. */
  characterLimit: number;
  setCharacterLimit: (limit: number) => Promise<void>;
  /** Stories 149–152: the words and phrases the Writer has declared theirs. */
  voiceList: string[];
  setVoiceList: (entries: string[]) => Promise<void>;
  /** ADR 0010: the Band the rail opens on, and whether it is collapsed. */
  railBand: WorkingOrderBand;
  setRailBand: (band: WorkingOrderBand) => Promise<void>;
  railCollapsed: boolean;
  setRailCollapsed: (collapsed: boolean) => Promise<void>;
  /** Story 169: whether the Writer has dismissed the first-run note. */
  firstRunNoteDismissed: boolean;
  dismissFirstRunNote: () => Promise<void>;
  /** Stories 201–204: Light, Dark or System, System by default. */
  colorScheme: ColorSchemeSetting;
  setColorScheme: (setting: ColorSchemeSetting) => Promise<void>;
  /** Reads every global setting, in the order the shell reads them. */
  load: (database: ObelusDatabase) => Promise<void>;
}

/**
 * The global settings that are not about one Document or one Connection: the
 * Screening frame, the chunking character limit, the Voice list, the rail's
 * two view preferences plus the first-run note, and the colour scheme. Each is the same `useSetting`
 * over its bound storage functions; the Voice list additionally mirrors its
 * value into a ref and re-runs the rule Passes when it changes.
 */
export function useGlobalSettings(options: GlobalSettingsOptions): GlobalSettingsHandle {
  const { databaseRef, onError, voiceListRef, onVoiceListSaved } = options;

  const screeningFrame = useSetting({
    load: loadScreeningFrame,
    save: saveScreeningFrame,
    initial: true,
    databaseRef,
    onError,
  });
  const characterLimit = useSetting({
    load: loadCharacterLimit,
    save: saveCharacterLimit,
    initial: DEFAULT_CHARACTER_LIMIT,
    databaseRef,
    onError,
  });
  const voiceList = useSetting({
    load: loadVoiceList,
    save: saveVoiceList,
    initial: [],
    databaseRef,
    onError,
    onSaved: (saved) => {
      voiceListRef.current = saved;
      return onVoiceListSaved();
    },
  });
  // The rail's three preferences move the surface before the write resolves.
  const railBand = useSetting({
    load: loadRailBand,
    save: saveRailBand,
    initial: "structure",
    databaseRef,
    onError,
    optimistic: true,
  });
  const railCollapsed = useSetting({
    load: loadRailCollapsed,
    save: saveRailCollapsed,
    initial: false,
    databaseRef,
    onError,
    optimistic: true,
  });
  const firstRunNote = useSetting({
    load: loadFirstRunNoteDismissed,
    save: saveFirstRunNoteDismissed,
    initial: false,
    databaseRef,
    onError,
    optimistic: true,
  });

  // The scheme changes the moment the Writer chooses it, not after the write.
  const colorScheme = useSetting({
    load: loadColorScheme,
    save: saveColorScheme,
    initial: DEFAULT_COLOR_SCHEME_SETTING,
    databaseRef,
    onError,
    optimistic: true,
  });

  const dismissFirstRunNote = useCallback(async () => {
    await firstRunNote.set(true);
  }, [firstRunNote.set]);

  const load = useCallback(
    async (database: ObelusDatabase) => {
      await screeningFrame.load(database);
      await characterLimit.load(database);
      // Read the Voice list through the ref as well as the state, so the rule
      // Passes `enterDocument` runs next see the Writer's declared words.
      voiceListRef.current = await voiceList.load(database);
      await railBand.load(database);
      await railCollapsed.load(database);
      await firstRunNote.load(database);
      await colorScheme.load(database);
    },
    [
      screeningFrame.load,
      characterLimit.load,
      voiceList.load,
      voiceListRef,
      railBand.load,
      railCollapsed.load,
      firstRunNote.load,
      colorScheme.load,
    ],
  );

  return {
    screeningFrame: screeningFrame.value,
    setScreeningFrame: screeningFrame.set,
    characterLimit: characterLimit.value,
    setCharacterLimit: characterLimit.set,
    voiceList: voiceList.value,
    setVoiceList: voiceList.set,
    railBand: railBand.value,
    setRailBand: railBand.set,
    railCollapsed: railCollapsed.value,
    setRailCollapsed: railCollapsed.set,
    firstRunNoteDismissed: firstRunNote.value,
    dismissFirstRunNote,
    colorScheme: colorScheme.value,
    setColorScheme: colorScheme.set,
    load,
  };
}
