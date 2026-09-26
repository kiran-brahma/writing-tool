/**
 * Stories 201–205: the Writer's colour scheme. The setting is what the Writer
 * chose; the scheme is what is drawn. **System**, the default, follows the
 * operating system as it changes.
 */
export type ColorSchemeSetting = "light" | "dark" | "system";

/** The scheme actually drawn once a setting meets the system's preference. */
export type ColorScheme = "light" | "dark";

/** The choice in AI Settings, in the order it is offered. */
export const COLOR_SCHEME_SETTINGS: readonly { setting: ColorSchemeSetting; label: string }[] = [
  { setting: "light", label: "Light" },
  { setting: "dark", label: "Dark" },
  { setting: "system", label: "System" },
];

/** The default: follow the operating system, so a Writer need do nothing. */
export const DEFAULT_COLOR_SCHEME_SETTING: ColorSchemeSetting = "system";

export function isColorSchemeSetting(value: unknown): value is ColorSchemeSetting {
  return (
    typeof value === "string" && COLOR_SCHEME_SETTINGS.some((entry) => entry.setting === value)
  );
}

/**
 * The scheme a setting draws. Light and Dark override the operating system;
 * System follows it. The stylesheet does the same for System on its own, from
 * `prefers-color-scheme`, so this is needed only where the resolved scheme must
 * be named in script — the browser's `theme-color`.
 */
export function resolveColorScheme(
  setting: ColorSchemeSetting,
  systemPrefersDark: boolean,
): ColorScheme {
  if (setting === "system") return systemPrefersDark ? "dark" : "light";
  return setting;
}

/**
 * Story 205: the browser's `theme-color` in each scheme — the colour of the
 * header, `ground`, so the window's chrome and the app read as one surface.
 * `index.html` carries the same two values, one per `prefers-color-scheme`, so
 * the chrome is right before any script runs.
 */
export const THEME_COLORS: Readonly<Record<ColorScheme, string>> = {
  light: "#fafaf9",
  dark: "#191816",
};
