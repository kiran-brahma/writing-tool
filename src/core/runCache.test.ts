import { describe, expect, it } from "vitest";
import { hashCanonical, hashRunText, runCacheKey, type RunCacheKeyInput } from "./runCache";

function key(overrides: Partial<RunCacheKeyInput> = {}): string {
  return runCacheKey({
    canonicalHash: hashCanonical("the document text\n"),
    passId: "cliche",
    promptHash: "abc123",
    connectionId: "openai",
    model: "gpt-4o",
    screeningFrame: true,
    characterLimit: 20_000,
    target: { start: 0, end: 42 },
    ...overrides,
  });
}

describe("hashCanonical", () => {
  it("is deterministic and dependency-free", () => {
    expect(hashCanonical("prose")).toBe(hashCanonical("prose"));
    expect(hashCanonical("prose")).not.toBe(hashCanonical("prose!"));
    expect(hashCanonical("")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("hashRunText", () => {
  it("covers the title as well as the text, because {{title}} shapes the prompt", () => {
    expect(hashRunText("Title", "body")).toBe(hashRunText("Title", "body"));
    expect(hashRunText("Title", "body")).not.toBe(hashRunText("Other", "body"));
    expect(hashRunText("Title", "body")).not.toBe(hashRunText("Title", "body!"));
    // A title/text split cannot collide with a different split.
    expect(hashRunText("a", "bc")).not.toBe(hashRunText("ab", "c"));
  });
});

describe("runCacheKey", () => {
  it("is stable for the same Run", () => {
    expect(key()).toBe(key());
  });

  it("misses when any keyed component changes", () => {
    const base = key();
    expect(key({ canonicalHash: hashCanonical("edited\n") })).not.toBe(base);
    expect(key({ passId: "hedges" })).not.toBe(base);
    expect(key({ promptHash: "def456" })).not.toBe(base);
    expect(key({ connectionId: "openrouter" })).not.toBe(base);
    expect(key({ model: "gpt-4o-mini" })).not.toBe(base);
    expect(key({ screeningFrame: false })).not.toBe(base);
    expect(key({ characterLimit: 40 })).not.toBe(base);
    // A local Pass's Target is part of its input, so a different Paragraph or
    // Section is a different Run and must not reuse this entry.
    expect(key({ target: { start: 10, end: 42 } })).not.toBe(base);
    expect(key({ target: { start: 0, end: 41 } })).not.toBe(base);
  });

  it("does not collide when a field contains the separator characters", () => {
    // A naive `join(":")` would let these two collide; JSON over an array cannot.
    expect(key({ passId: "a", promptHash: "b" })).not.toBe(
      key({ passId: "a:b", promptHash: "" }),
    );
  });
});
