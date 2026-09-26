import { useEffect, useRef, useState, type FocusEvent } from "react";
import {
  destinationsAt,
  isCurrentDestination,
  isHelpCurrent,
  type DestinationId,
} from "./navigation";

export interface HelpMenuProps {
  view: DestinationId;
  onNavigate: (destination: DestinationId) => void;
}

/**
 * Story 246: How this works and Privacy under one help control, so they are
 * always reachable without taking header space. A disclosure rather than a
 * menu: its two destinations follow the button in the tab order, Escape closes
 * it and returns focus to the button, and a press or focus outside closes it.
 */
export function HelpMenu({ view, onNavigate }: HelpMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = isHelpCurrent(view);

  // Any change of destination closes it, including `?` opening the shortcuts.
  useEffect(() => setOpen(false), [view]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (containerRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && containerRef.current?.contains(next)) return;
    if (next === null) return; // focus left the page, or a press is handled above
    setOpen(false);
  };

  return (
    <div ref={containerRef} onBlur={onBlur} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="help-destinations"
        onClick={() => setOpen((previous) => !previous)}
        className={[
          "flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
          current ? "font-semibold text-ink" : "font-medium text-faint-ink",
        ].join(" ")}
      >
        <span>Help</span>
        <span aria-hidden="true" className="text-ghost-ink">
          ▾
        </span>
      </button>

      <ul
        id="help-destinations"
        hidden={!open}
        className="absolute right-0 top-full z-30 mt-1.5 w-40 rounded border border-rule-soft bg-paper py-1 shadow-md"
      >
        {destinationsAt("help").map(({ id, label }) => {
          const isCurrent = isCurrentDestination(id, view);
          return (
            <li key={id}>
              <button
                type="button"
                aria-current={isCurrent ? "page" : undefined}
                onClick={() => {
                  setOpen(false);
                  onNavigate(id);
                }}
                className={[
                  "flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors hover:bg-ground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
                  isCurrent ? "font-semibold text-ink" : "text-quiet-ink",
                ].join(" ")}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
