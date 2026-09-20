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

  it("moves a target-relative offset into canonical coordinates before tie-breaking", () => {
    // "para" occurs in every paragraph; offset 0 is target-relative, so the
    // occurrence in the middle paragraph — not the first — must win.
    const result = applyContainment([{ quote: "para", offset: 0 }], CANONICAL, TARGET);

    expect(result.dropped).toBe(0);
    expect(result.kept[0].interval).toEqual({ start: 15, end: 19 });
    expect(result.kept[0].draft.offset).toBe(11);
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
