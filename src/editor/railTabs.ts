import type { WorkingOrderBand } from "../core/pass";

/** The rail's top-level options: the three Bands, plus All. */
export type RailSelection = WorkingOrderBand | "all";

export const RAIL_SELECTIONS: readonly { value: RailSelection; label: string }[] = [
  { value: "structure", label: "Structure" },
  { value: "paragraph", label: "Paragraph" },
  { value: "word", label: "Word" },
  { value: "all", label: "All" },
];

/**
 * Computes the next selected tab when navigating with arrow or home/end keys,
 * following the WAI-ARIA tablist keyboard specification. Returns null if the
 * key is not a tab-navigation key.
 */
export function nextTabSelection(current: RailSelection, key: string): RailSelection | null {
  const index = RAIL_SELECTIONS.findIndex((item) => item.value === current);
  if (index === -1) return null;

  if (key === "ArrowRight" || key === "ArrowDown") {
    return RAIL_SELECTIONS[(index + 1) % RAIL_SELECTIONS.length].value;
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return RAIL_SELECTIONS[(index - 1 + RAIL_SELECTIONS.length) % RAIL_SELECTIONS.length].value;
  }
  if (key === "Home") {
    return RAIL_SELECTIONS[0].value;
  }
  if (key === "End") {
    return RAIL_SELECTIONS[RAIL_SELECTIONS.length - 1].value;
  }

  return null;
}
