import type { Violation } from "../core/finding";

/** A run of text, and whether the linter marked it as a Violation. */
export interface MarkedSegment {
  text: string;
  violated: boolean;
}

/**
 * Splits `text` at the Violation phrases it contains, so the display can strike
 * the offending words through while leaving the diagnosis readable. Praise is
 * struck through rather than removed: silently stripping it would hide prompt
 * drift and make debugging impossible.
 *
 * Matching is case-insensitive, as the linter's rules are. A phrase that occurs
 * more than once is marked every time; overlaps merge into one run. Pure and
 * DOM-free, so it is testable even though the pane it feeds is not.
 */
export function markViolations(text: string, violations: Violation[]): MarkedSegment[] {
  if (text === "") return [];

  const ranges = rangesFor(text, violations);
  if (ranges.length === 0) return [{ text, violated: false }];

  const segments: MarkedSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) segments.push({ text: text.slice(cursor, range.start), violated: false });
    segments.push({ text: text.slice(range.start, range.end), violated: true });
    cursor = range.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), violated: false });
  return segments;
}

/**
 * Violations split by kind, so each display path shows the right one: strikes
 * inline, rewrites behind the Quarantined rewrite reveal.
 */
export function splitViolations(violations: Violation[]): {
  strikes: Violation[];
  rewrites: Violation[];
} {
  return {
    strikes: violations.filter((violation) => violation.kind !== "rewrite"),
    rewrites: violations.filter((violation) => violation.kind === "rewrite"),
  };
}

/**
 * Violations that none of the rendered strings contains, so a per-Finding
 * decline does not offer with nothing on screen to explain it. A rewrite is
 * excluded because the Quarantined rewrite pane already shows it.
 */
export function violationsOutsideText(texts: string[], violations: Violation[]): Violation[] {
  const lower = texts.map((text) => text.toLowerCase());
  return violations.filter(
    (violation) =>
      violation.kind !== "rewrite" &&
      !lower.some((text) => text.includes(violation.text.trim().toLowerCase())),
  );
}

/** The merged, ordered character ranges of every Violation phrase in `text`. */
function rangesFor(text: string, violations: Violation[]): { start: number; end: number }[] {
  const found: { start: number; end: number }[] = [];

  for (const violation of violations) {
    const needle = violation.text.trim();
    if (needle === "") continue;
    // A regex over the original string keeps the match index aligned even when
    // case folding would change a character's length; `lastIndex + 1` allows a
    // phrase to overlap itself.
    const pattern = new RegExp(escapeRegExp(needle), "gi");
    let match = pattern.exec(text);
    while (match !== null) {
      found.push({ start: match.index, end: match.index + match[0].length });
      pattern.lastIndex = match.index + 1;
      match = pattern.exec(text);
    }
  }

  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: { start: number; end: number }[] = [];
  for (const range of found) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
