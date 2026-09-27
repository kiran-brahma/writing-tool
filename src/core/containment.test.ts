import { describe, expect, it } from "vitest";
import { applyContainment } from "./containment";

const CANONICAL = "One para.\n\nTwo para.\n\nThree para.\n";
// The Target is the middle Paragraph: "Two para." occupies [11, 20).
const TARGET = { start: 11, end: 20 };

describe("applyContainment", () => {
  it("keeps an Anchor that resolves inside the Target", () => {
    const result = applyContainment([{ quote: "Two", offset: 0 }], CANONICAL, TARGET);

    expect(result.kept).toHaveLength(1);
    expect(result.kept[0].interval).toEqual({ start: 11, end: 14 });
    expect(result.dropped).toBe(0);
  });

  it("drops and counts an Anchor in the context rather than the Target", () => {
    const result = applyContainment(
      [{ quote: "One", offset: 0 }, { quote: "Three", offset: 0 }],
      CANONICAL,
      TARGET,
    );

    expect(result.kept).toEqual([]);
    expect(result.dropped).toBe(2);
  });

  it("drops an Anchor that does not resolve in the current canonical string", () => {
    const result = applyContainment([{ quote: "nowhere", offset: 0 }], CANONICAL, TARGET);

    expect(result.kept).toEqual([]);
    expect(result.dropped).toBe(1);
  });

  it("resolves a quote every paragraph shares to the Target's occurrence", () => {
    // "para" occurs in every paragraph; the occurrence in the middle paragraph —
    // not the first — must win.
    const result = applyContainment([{ quote: "para", offset: 0 }], CANONICAL, TARGET);

    expect(result.dropped).toBe(0);
    expect(result.kept[0].interval).toEqual({ start: 15, end: 19 });
  });

  it("keeps a quote the Target contains even when the context holds it nearer the hint", () => {
    // A model is no longer asked for an offset, so the hint is 0. "same words"
    // sits in the context just before the Target and again deep inside it; the
    // Target's own occurrence must win or a valid Finding is dropped.
    const canonical = "Context with same words.\n\nA long Target paragraph that ends with same words.\n";
    const target = { start: 26, end: canonical.length - 1 };
    const result = applyContainment([{ quote: "same words", offset: 0 }], canonical, target);

    expect(result.dropped).toBe(0);
    expect(result.kept[0].interval).toEqual({ start: 65, end: 75 });
  });

  it("records the resolved position as the Anchor's offset, not the model's hint", () => {
    const result = applyContainment([{ quote: "para", offset: 40 }], CANONICAL, TARGET);

    expect(result.kept[0].draft.offset).toBe(15);
  });

  it("keeps the whole Target when the Target is the whole Document", () => {
    const result = applyContainment(
      [{ quote: "One", offset: 0 }, { quote: "Three", offset: 0 }],
      CANONICAL,
      { start: 0, end: CANONICAL.length },
    );

    expect(result.kept).toHaveLength(2);
    expect(result.dropped).toBe(0);
  });
});
