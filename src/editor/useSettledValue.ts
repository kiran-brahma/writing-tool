import { useEffect, useState } from "react";

/**
 * `value` once it has held still for `delayMs`. A view whose derivation is
 * expensive reads this instead of the live value, so a value that changes on
 * every keystroke or pointer move — a selection being dragged, a word selected
 * and immediately retyped — costs nothing until the Writer stops.
 */
export function useSettledValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(value, settled)) return;
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, settled, delayMs]);
  return settled;
}
