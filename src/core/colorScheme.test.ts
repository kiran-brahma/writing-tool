import { describe, expect, it } from "vitest";
import {
  COLOR_SCHEME_SETTINGS,
  isColorSchemeSetting,
  resolveColorScheme,
  type ColorScheme,
  type ColorSchemeSetting,
} from "./colorScheme";

describe("resolveColorScheme", () => {
  const table: [ColorSchemeSetting, boolean, ColorScheme][] = [
    ["system", false, "light"],
    ["system", true, "dark"],
    ["light", false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["dark", true, "dark"],
  ];

  it.each(table)("resolves %s with the system preferring dark=%s to %s", (setting, dark, scheme) => {
    expect(resolveColorScheme(setting, dark)).toBe(scheme);
  });

  it("covers every setting the Writer can choose", () => {
    expect(new Set(table.map(([setting]) => setting))).toEqual(
      new Set(COLOR_SCHEME_SETTINGS.map((entry) => entry.setting)),
    );
  });
});

describe("the colour scheme choice", () => {
  it("offers Light, Dark and System, in that order", () => {
    expect(COLOR_SCHEME_SETTINGS).toEqual([
      { setting: "light", label: "Light" },
      { setting: "dark", label: "Dark" },
      { setting: "system", label: "System" },
    ]);
  });

  it("recognises only the three settings", () => {
    expect(isColorSchemeSetting("light")).toBe(true);
    expect(isColorSchemeSetting("dark")).toBe(true);
    expect(isColorSchemeSetting("system")).toBe(true);
    expect(isColorSchemeSetting("Dark")).toBe(false);
    expect(isColorSchemeSetting("sepia")).toBe(false);
    expect(isColorSchemeSetting(undefined)).toBe(false);
    expect(isColorSchemeSetting(true)).toBe(false);
  });
});
