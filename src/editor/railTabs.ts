import type { WorkingOrderBand } from "../core/pass";

/**
 * ADR 0012: the Rail's two Rail modes, switched at its top. Findings holds the
 * Band control, **All**, the run controls and the queue; Judge holds the Judge
 * with milestones and Revisions. The mode is local to the Rail and never
 * stored, so every session opens on Findings, where the work is.
 */
export type RailMode = "findings" | "judge";

export const RAIL_MODES: readonly { value: RailMode; label: string }[] = [
  { value: "findings", label: "Findings" },
  { value: "judge", label: "Judge" },
];

/** Story 231: the Rail mode every session opens on. */
export const INITIAL_RAIL_MODE: RailMode = "findings";

/** The rail's top-level options: the three Bands, plus All. */
export type RailSelection = WorkingOrderBand | "all";

export const RAIL_SELECTIONS: readonly { value: RailSelection; label: string }[] = [
  { value: "structure", label: "Structure" },
  { value: "paragraph", label: "Paragraph" },
  { value: "word", label: "Word" },
  { value: "all", label: "All" },
];

/**
 * The next option in a tablist when navigating with arrow or Home/End keys,
 * following the WAI-ARIA tablist keyboard pattern, wrapping at either end.
 * Returns null if the key is not a tab-navigation key.
 */
function nextInTablist<T>(
  options: readonly { value: T }[],
  current: T,
  key: string,
): T | null {
  const index = options.findIndex((item) => item.value === current);
  if (index === -1) return null;

  if (key === "ArrowRight" || key === "ArrowDown") {
    return options[(index + 1) % options.length].value;
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return options[(index - 1 + options.length) % options.length].value;
  }
  if (key === "Home") {
    return options[0].value;
  }
  if (key === "End") {
    return options[options.length - 1].value;
  }

  return null;
}

/** The next Band or **All** from the Band control's keys, or null. */
export function nextTabSelection(current: RailSelection, key: string): RailSelection | null {
  return nextInTablist(RAIL_SELECTIONS, current, key);
}

/** The next Rail mode from the mode switch's keys, or null. */
export function nextRailMode(current: RailMode, key: string): RailMode | null {
  return nextInTablist(RAIL_MODES, current, key);
}
