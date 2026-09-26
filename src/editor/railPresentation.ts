/**
 * Stories 251 and 252: how the Rail is drawn. At 1024px and wider it is docked
 * beside the prose, and the stored collapsed preference decides whether it is
 * shown. Below that it overlays the prose instead of squeezing it, and only a
 * local overlay flag — false on every load, never stored — decides, so a
 * preference set on a wide screen never covers the prose on a tablet.
 */
export type RailPresentation = "docked" | "overlay" | "hidden";

/** The one media query that tells a wide layout from a narrow one. */
export const WIDE_LAYOUT_QUERY = "(min-width: 1024px)";

/**
 * The Rail's element id, so the Status line's offer can name what it controls
 * and a press on that offer is not taken for a press outside the overlay.
 */
export const RAIL_ELEMENT_ID = "obelus-rail";

export function railPresentation(
  wide: boolean,
  collapsed: boolean,
  overlayOpen: boolean,
): RailPresentation {
  if (wide) return collapsed ? "hidden" : "docked";
  return overlayOpen ? "overlay" : "hidden";
}
