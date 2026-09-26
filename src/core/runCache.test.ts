import { describe, expect, it } from "vitest";
import { hashCanonical, hashRunText, runCacheKey, type RunCacheKeyInput } from "./runCache";

function key(overrides: Partial<RunCacheKeyInput> = {}): string {
  return runCacheKey({
    canonicalHash: hashCanonical("the document text\n"),
    passId: "cliche",
    promptHash: "abc123",
    connectionId: "openai",
    protocol: "openai-shaped",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    maxOutputTokens: 4096,
    reasoningEffort: "",
    extraHeaders: {},
    screeningFrame: true,
    characterLimit: 20_000,
    voiceList: [],
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
    // A Custom Connection repointed in place is a different endpoint, so its
    // base URL and Protocol are keyed, not only its id.
    expect(key({ baseUrl: "http://localhost:8080/v1" })).not.toBe(base);
    expect(key({ protocol: "anthropic-shaped" })).not.toBe(base);
    expect(key({ model: "gpt-4o-mini" })).not.toBe(base);
    expect(key({ screeningFrame: false })).not.toBe(base);
    expect(key({ characterLimit: 40 })).not.toBe(base);
    // The Voice list is attached to the request and shapes the annotation, so a
    // change to it must miss rather than reuse the previous list's Findings.
    expect(key({ voiceList: ["leverage"] })).not.toBe(base);
    // A local Pass's Target is part of its input, so a different Paragraph or
    // Section is a different Run and must not reuse this entry.
    expect(key({ target: { start: 10, end: 42 } })).not.toBe(base);
    expect(key({ target: { start: 0, end: 41 } })).not.toBe(base);
  });

  // A Connection's output ceiling, reasoning effort and extra headers are all
  // edited in place under the same id, and all three reach the wire, so each
  // must miss rather than return the previous setting's Findings.
  it("misses when the output ceiling changes", () => {
    expect(key({ maxOutputTokens: 16_384 })).not.toBe(key());
  });

  it("misses when reasoning effort changes", () => {
    // Empty means the field is not sent; any value puts it on the wire.
    expect(key({ reasoningEffort: "low" })).not.toBe(key());
    expect(key({ reasoningEffort: "low" })).not.toBe(key({ reasoningEffort: "high" }));
  });

  it("misses when an extra header is added, changed or removed", () => {
    const base = key({ extraHeaders: { "X-Tenant": "a" } });
    expect(key()).not.toBe(base);
    expect(key({ extraHeaders: { "X-Tenant": "b" } })).not.toBe(base);
    expect(key({ extraHeaders: { "X-Other": "a" } })).not.toBe(base);
    expect(key({ extraHeaders: { "X-Tenant": "a", "X-Other": "b" } })).not.toBe(base);
  });

  it("hits for the same extra headers in a different insertion order", () => {
    expect(key({ extraHeaders: { a: "1", b: "2" } })).toBe(
      key({ extraHeaders: { b: "2", a: "1" } }),
    );
  });

  it("does not collide when a field contains the separator characters", () => {
    // A naive `join(":")` would let these two collide; JSON over an array cannot.
    expect(key({ passId: "a", promptHash: "b" })).not.toBe(
      key({ passId: "a:b", promptHash: "" }),
    );
  });
});
