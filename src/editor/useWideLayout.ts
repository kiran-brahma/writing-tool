import { useEffect, useState } from "react";
import { WIDE_LAYOUT_QUERY } from "./railPresentation";

/**
 * Story 251: whether the window is wide enough to dock the Rail beside the
 * prose. One media-query subscription, so crossing 1024px switches between the
 * overlay and the docked Rail as the window is resized, with no reload.
 */
export function useWideLayout(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_LAYOUT_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(WIDE_LAYOUT_QUERY);
    const onChange = () => setWide(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return wide;
}
