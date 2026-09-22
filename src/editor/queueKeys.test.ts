import { describe, expect, it } from "vitest";
import {
  QUEUE_SHORTCUTS,
  queueActionFor,
  queueShortcutKeys,
  type QueueAction,
  type QueueKeyEvent,
} from "./queueKeys";

/**
 * The key-dispatch decision, with no DOM. `typing` stands in for the target
 * kind: the plain letters must reach the Editor or a field, and the modifier
 * shortcut must not.
 */
function event(key: string, options: Partial<Omit<QueueKeyEvent, "key">> = {}): QueueKeyEvent {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    typing: false,
    ...options,
  };
}

/**
 * The mapping written out independently of `QUEUE_SHORTCUTS`, so a change to
 * the table's key or action has to be answered here rather than silently
 * agreeing with itself.
 */
const EXPECTED: readonly [string, boolean, QueueAction][] = [
  ["j", false, { kind: "step", direction: 1 }],
  ["k", false, { kind: "step", direction: -1 }],
  ["a", false, { kind: "address" }],
  ["x", false, { kind: "decline" }],
  ["v", false, { kind: "decline-violation" }],
  ["ArrowDown", true, { kind: "step", direction: 1 }],
  ["ArrowUp", true, { kind: "step", direction: -1 }],
];

describe("queueActionFor", () => {
  it("dispatches every binding to the action written here", () => {
    for (const [key, alt, action] of EXPECTED) {
      expect(queueActionFor(event(key, { altKey: alt })), `${alt ? "Alt+" : ""}${key}`).toEqual(
        action,
      );
    }
  });

  it("stands the plain keys down inside the Editor or a field", () => {
    for (const key of ["j", "k", "a", "x", "v"]) {
      expect(queueActionFor(event(key, { typing: true })), key).toBeNull();
    }
  });

  it("steps the queue with Alt and the arrow keys, even while typing", () => {
    expect(queueActionFor(event("ArrowDown", { altKey: true, typing: true }))).toEqual({
      kind: "step",
      direction: 1,
    });
    expect(queueActionFor(event("ArrowUp", { altKey: true, typing: true }))).toEqual({
      kind: "step",
      direction: -1,
    });
  });

  it("does not fire the modifier shortcut when Ctrl or Cmd joins it", () => {
    expect(queueActionFor(event("ArrowDown", { altKey: true, ctrlKey: true }))).toBeNull();
    expect(queueActionFor(event("ArrowDown", { altKey: true, metaKey: true }))).toBeNull();
  });

  it("ignores the bare arrows, which belong to the prose", () => {
    expect(queueActionFor(event("ArrowDown"))).toBeNull();
    expect(queueActionFor(event("ArrowUp", { typing: true }))).toBeNull();
  });

  it("ignores keys the queue does not bind, including the app-wide ?", () => {
    expect(queueActionFor(event("q"))).toBeNull();
    expect(queueActionFor(event("Enter"))).toBeNull();
    expect(queueActionFor(event("?"))).toBeNull();
  });

  it("never fires a plain key with a modifier, so Alt+J stays a letter", () => {
    expect(queueActionFor(event("j", { altKey: true }))).toBeNull();
    expect(queueActionFor(event("j", { ctrlKey: true }))).toBeNull();
    expect(queueActionFor(event("k", { metaKey: true }))).toBeNull();
  });
});

describe("QUEUE_SHORTCUTS", () => {
  it("is exactly the mapping the dispatch was tested against", () => {
    expect(
      QUEUE_SHORTCUTS.map((shortcut) => [shortcut.eventKey, shortcut.alt, shortcut.action]),
    ).toEqual(EXPECTED);
  });

  it("writes every binding for the page, with Alt and arrow glyphs where needed", () => {
    expect(QUEUE_SHORTCUTS.flatMap((shortcut) => queueShortcutKeys(shortcut))).toEqual([
      "j",
      "k",
      "a",
      "x",
      "v",
      "Alt",
      "↓",
      "Alt",
      "↑",
    ]);
  });
});
