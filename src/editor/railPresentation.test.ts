import { describe, expect, it } from "vitest";
import { railPresentation, WIDE_LAYOUT_QUERY } from "./railPresentation";

describe("railPresentation", () => {
  describe("wide: the stored collapsed preference decides", () => {
    it("docks the Rail when it is not collapsed", () => {
      expect(railPresentation(true, false, false)).toBe("docked");
    });

    it("hides the Rail when it is collapsed", () => {
      expect(railPresentation(true, true, false)).toBe("hidden");
    });

    it("ignores the overlay flag", () => {
      expect(railPresentation(true, false, true)).toBe("docked");
      expect(railPresentation(true, true, true)).toBe("hidden");
    });
  });

  describe("narrow: only the local overlay flag decides", () => {
    it("overlays the prose when the overlay is open", () => {
      expect(railPresentation(false, false, true)).toBe("overlay");
    });

    it("hides the Rail when the overlay is closed", () => {
      expect(railPresentation(false, false, false)).toBe("hidden");
    });

    it("ignores collapsed, so a desktop preference never covers the prose", () => {
      expect(railPresentation(false, false, false)).toBe("hidden");
      expect(railPresentation(false, true, false)).toBe("hidden");
      expect(railPresentation(false, true, true)).toBe("overlay");
    });

    it("never docks the Rail beside the prose", () => {
      for (const collapsed of [false, true]) {
        for (const overlayOpen of [false, true]) {
          expect(railPresentation(false, collapsed, overlayOpen)).not.toBe("docked");
        }
      }
    });
  });

  it("draws the line between narrow and wide at 1024px", () => {
    expect(WIDE_LAYOUT_QUERY).toBe("(min-width: 1024px)");
  });
});
