import { describe, expect, it } from "vitest";
import {
  QUEUE_SHORTCUTS,
  queueActionFor,
  queueShortcutKeys,
  type QueueAction,
  type QueueKeyEvent,
} from "./queueKeys";
import type { RailMode } from "./railTabs";

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

/** The action a key asks for in Findings mode, where the queue is on screen. */
function actionFor(
  key: string,
  options: Partial<Omit<QueueKeyEvent, "key">> = {},
  mode: RailMode = "findings",
): QueueAction | null {
  return queueActionFor(event(key, options), mode)?.action ?? null;
}

describe("queueActionFor", () => {
  it("dispatches every binding to the action written here", () => {
    for (const [key, alt, action] of EXPECTED) {
      expect(actionFor(key, { altKey: alt }), `${alt ? "Alt+" : ""}${key}`).toEqual(
        action,
      );
    }
  });

  it("stands the plain keys down inside the Editor or a field", () => {
    for (const key of ["j", "k", "a", "x", "v"]) {
      expect(actionFor(key, { typing: true }), key).toBeNull();
    }
  });

  it("steps the queue with Alt and the arrow keys, even while typing", () => {
    expect(actionFor("ArrowDown", { altKey: true, typing: true })).toEqual({
      kind: "step",
      direction: 1,
    });
    expect(actionFor("ArrowUp", { altKey: true, typing: true })).toEqual({
      kind: "step",
      direction: -1,
    });
  });

  it("does not fire the modifier shortcut when Ctrl or Cmd joins it", () => {
    expect(actionFor("ArrowDown", { altKey: true, ctrlKey: true })).toBeNull();
    expect(actionFor("ArrowDown", { altKey: true, metaKey: true })).toBeNull();
  });

  it("ignores the bare arrows, which belong to the prose", () => {
    expect(actionFor("ArrowDown")).toBeNull();
    expect(actionFor("ArrowUp", { typing: true })).toBeNull();
  });

  it("ignores keys the queue does not bind, including the app-wide ?", () => {
    expect(actionFor("q")).toBeNull();
    expect(actionFor("Enter")).toBeNull();
    expect(actionFor("?")).toBeNull();
  });

  it("never fires a plain key with a modifier, so Alt+J stays a letter", () => {
    expect(actionFor("j", { altKey: true })).toBeNull();
    expect(actionFor("j", { ctrlKey: true })).toBeNull();
    expect(actionFor("k", { metaKey: true })).toBeNull();
  });
});

/**
 * ADR 0012, stories 232–233: the queue keys act only in Findings mode, so `j`
 * and `k` never move a selection the Writer cannot see. The modifier step still
 * works from anywhere: in Judge mode it switches the Rail to Findings first, as
 * it already opens a collapsed Rail.
 */
describe("queueActionFor and the Rail mode", () => {
  it("acts in Findings mode without switching the Rail", () => {
    for (const [key, alt, action] of EXPECTED) {
      expect(queueActionFor(event(key, { altKey: alt }), "findings"), key).toEqual({
        action,
        switchToFindings: false,
      });
    }
  });

  it("does nothing with a plain key in Judge mode, typing or not", () => {
    for (const key of ["j", "k", "a", "x", "v"]) {
      expect(queueActionFor(event(key), "judge"), key).toBeNull();
      expect(queueActionFor(event(key, { typing: true }), "judge"), key).toBeNull();
    }
  });

  it("switches to Findings on the modifier step in Judge mode, and steps", () => {
    expect(queueActionFor(event("ArrowDown", { altKey: true }), "judge")).toEqual({
      action: { kind: "step", direction: 1 },
      switchToFindings: true,
    });
    expect(queueActionFor(event("ArrowUp", { altKey: true, typing: true }), "judge")).toEqual({
      action: { kind: "step", direction: -1 },
      switchToFindings: true,
    });
  });

  it("still ignores the keys it does not bind in Judge mode", () => {
    expect(queueActionFor(event("ArrowDown"), "judge")).toBeNull();
    expect(queueActionFor(event("ArrowDown", { altKey: true, ctrlKey: true }), "judge")).toBeNull();
    expect(queueActionFor(event("?"), "judge")).toBeNull();
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
