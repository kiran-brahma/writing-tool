import { useEffect } from "react";
import {
  resolveColorScheme,
  THEME_COLORS,
  type ColorSchemeSetting,
} from "../core/colorScheme";

/** The one attribute a Light or Dark choice sets on the root element. */
const THEME_ATTRIBUTE = "data-theme";

/**
 * Stories 201–205: draws the Writer's colour scheme. With System no attribute
 * is set, so the stylesheet follows `prefers-color-scheme` on its own — live as
 * the operating system changes, and with no flash on load. Light or Dark sets
 * `data-theme` on the root element, which the stylesheet reads over the system.
 *
 * `index.html` holds two `theme-color` metas, one per system scheme. Each is
 * given the colour the setting resolves to while its own media query holds, so
 * with System they keep their own colours and the browser switches between them
 * without script.
 */
export function useColorScheme(setting: ColorSchemeSetting): void {
  useEffect(() => {
    const root = document.documentElement;
    if (setting === "system") root.removeAttribute(THEME_ATTRIBUTE);
    else root.setAttribute(THEME_ATTRIBUTE, setting);

    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      const systemPrefersDark = meta.media.includes("dark");
      meta.content = THEME_COLORS[resolveColorScheme(setting, systemPrefersDark)];
    }
  }, [setting]);
}
