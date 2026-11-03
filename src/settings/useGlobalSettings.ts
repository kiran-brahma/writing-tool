import { useCallback, useState, type RefObject } from "react";
import { DEFAULT_COLOR_SCHEME_SETTING, type ColorSchemeSetting } from "../core/colorScheme";
import { describeError } from "../errors";
import type { ObelusDatabase } from "../storage/obelusDatabase";
import {
  loadColorScheme,
  loadFirstRunNoteDismissed,
  loadRailCollapsed,
  saveColorScheme,
  saveFirstRunNoteDismissed,
  saveRailCollapsed,
} from "../storage/settings";

interface SettingHandle<T> {
  value: T;
  set: (next: T) => Promise<void>;
  load: (database: ObelusDatabase) => Promise<T>;
}

interface SettingOptions<T> {
  load: (database: ObelusDatabase) => Promise<T>;
  save: (database: ObelusDatabase, value: T) => Promise<T>;
  initial: T;
  databaseRef: RefObject<ObelusDatabase | null>;
  onError: (message: string) => void;
  optimistic?: boolean;
}

function useSetting<T>(options: SettingOptions<T>): SettingHandle<T> {
  const { load, save, initial, databaseRef, onError, optimistic } = options;
  const [value, setValue] = useState<T>(initial);

  const set = useCallback(
    async (next: T) => {
      if (optimistic === true) setValue(next);
      const database = databaseRef.current;
      if (database === null) return;
      try {
        const saved = await save(database, next);
        setValue(saved);
      } catch (error) {
        onError(describeError(error));
      }
    },
    [databaseRef, onError, optimistic, save],
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
  onError: (message: string) => void;
}

export interface GlobalSettingsHandle {
  railCollapsed: boolean;
  setRailCollapsed: (collapsed: boolean) => Promise<void>;
  firstRunNoteDismissed: boolean;
  dismissFirstRunNote: () => Promise<void>;
  colorScheme: ColorSchemeSetting;
  setColorScheme: (setting: ColorSchemeSetting) => Promise<void>;
  load: (database: ObelusDatabase) => Promise<void>;
}

export function useGlobalSettings(options: GlobalSettingsOptions): GlobalSettingsHandle {
  const { databaseRef, onError } = options;

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
      await railCollapsed.load(database);
      await firstRunNote.load(database);
      await colorScheme.load(database);
    },
    [railCollapsed.load, firstRunNote.load, colorScheme.load],
  );

  return {
    railCollapsed: railCollapsed.value,
    setRailCollapsed: railCollapsed.set,
    firstRunNoteDismissed: firstRunNote.value,
    dismissFirstRunNote,
    colorScheme: colorScheme.value,
    setColorScheme: colorScheme.set,
    load,
  };
}
