/**
 * A US dollar figure for a Run's estimate and the session total. Sub-cent
 * figures keep four decimals so a cheap estimate never reads as `$0.00`; zero
 * and anything not finite read as `$0.00`. Display only.
 */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}
