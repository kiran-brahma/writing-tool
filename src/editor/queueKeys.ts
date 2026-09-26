/**
 * The queue's key bindings, as data and as a pure decision. The rail's keydown
 * effect reads `queueActionFor`; How this works lists the same bindings, so the
 * page cannot advertise a key the app does not bind. Keeping the decision pure
 * lets the guard that stands the plain keys down inside the Editor be covered by
 * a test with no DOM, which this project has no layer for.
 *
 * The plain letters belong to the Writer while they type, so those bindings are
 * live only outside a typing target. The modifier binding is for the Writer who
 * is already in the prose: Alt with the arrow keys steps the queue without
 * stealing a letter. Alt-arrow is not a browser or system-wide shortcut, and
 * `preventDefault` takes it from the caret's own paragraph movement; ProseMirror
 * binds the bare arrows and a few Alt-letters, never an Alt-arrow.
 *
 * ADR 0012: the queue is on screen only in Findings mode, so the keys act only
 * there — `j`/`k` never move a selection the Writer cannot see. The modifier
 * step is the one exception: it works from anywhere, so in Judge mode it
 * switches the Rail to Findings first, as it already opens a collapsed Rail.
 */

import type { RailMode } from "./railTabs";

/** What a bound key asks the queue to do. */
export type QueueAction =
  | { readonly kind: "step"; readonly direction: 1 | -1 }
  | { readonly kind: "address" }
  | { readonly kind: "decline" }
  | { readonly kind: "decline-violation" };

export interface QueueKeyEvent {
  /** `KeyboardEvent.key`. */
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  /** True when the target is the Editor or a field, where plain letters reach the prose. */
  readonly typing: boolean;
}

/** What a key event asks of the queue, and whether the Rail must show Findings first. */
export interface QueueKeyDecision {
  readonly action: QueueAction;
  /** True for the modifier step in Judge mode: the Rail switches to Findings, then steps. */
  readonly switchToFindings: boolean;
}

/** One key the queue binds: what fires it, and what it does. */
export interface QueueShortcut {
  /** The `KeyboardEvent.key` value that triggers this action. */
  readonly eventKey: string;
  /** Alt must be held; this is the modifier shortcut that works while typing. */
  readonly alt: boolean;
  readonly action: QueueAction;
}

/** The queue's bindings, in the order How this works lists them. */
export const QUEUE_SHORTCUTS: readonly QueueShortcut[] = [
  { eventKey: "j", alt: false, action: { kind: "step", direction: 1 } },
  { eventKey: "k", alt: false, action: { kind: "step", direction: -1 } },
  { eventKey: "a", alt: false, action: { kind: "address" } },
  { eventKey: "x", alt: false, action: { kind: "decline" } },
  { eventKey: "v", alt: false, action: { kind: "decline-violation" } },
  { eventKey: "ArrowDown", alt: true, action: { kind: "step", direction: 1 } },
  { eventKey: "ArrowUp", alt: true, action: { kind: "step", direction: -1 } },
];

/** How a `KeyboardEvent.key` is written, where the raw name is not the glyph. */
const KEY_LABELS: Readonly<Record<string, string>> = { ArrowDown: "↓", ArrowUp: "↑" };

/**
 * The keys as the Writer presses them, derived from what dispatch matches, so
 * the page and the hint bar cannot advertise a key the table does not bind.
 */
export function queueShortcutKeys(shortcut: QueueShortcut): readonly string[] {
  const label = KEY_LABELS[shortcut.eventKey] ?? shortcut.eventKey;
  return shortcut.alt ? ["Alt", label] : [label];
}

/**
 * The action a key event asks for, or null when the event is not a queue key or
 * the Rail mode leaves it nothing to do. `typing` is the target kind: the plain
 * letters stand down while the Writer is in the Editor or a field; the modifier
 * shortcut does not. In Judge mode only the modifier step acts, and it asks the
 * Rail to switch to Findings.
 */
export function queueActionFor(event: QueueKeyEvent, railMode: RailMode): QueueKeyDecision | null {
  // Ctrl and Cmd belong to the browser, never to the queue.
  if (event.ctrlKey || event.metaKey) return null;

  for (const shortcut of QUEUE_SHORTCUTS) {
    if (shortcut.alt !== event.altKey) continue;
    if (shortcut.eventKey !== event.key) continue;
    if (!shortcut.alt && event.typing) return null;
    if (railMode === "findings") return { action: shortcut.action, switchToFindings: false };
    // Judge mode: the queue is not on screen, so only the modifier step acts.
    if (shortcut.alt && shortcut.action.kind === "step") {
      return { action: shortcut.action, switchToFindings: true };
    }
    return null;
  }
  return null;
}
