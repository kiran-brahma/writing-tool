import { describe, expect, it } from "vitest";
import { frameText, isScreeningFrame, SCREENING_FRAMES } from "./screeningFrame";

describe("Screening frames (story 153)", () => {
  it("offers the default plus Skimmer, Skeptic and Practitioner", () => {
    expect(SCREENING_FRAMES).toEqual(["default", "skimmer", "skeptic", "practitioner"]);
  });

  it("gives each frame the persona the spec names", () => {
    expect(frameText("default")).toContain("editor screening a submission");
    expect(frameText("skimmer")).toContain("no time and no patience");
    expect(frameText("skeptic")).toContain("hostile domain expert");
    expect(frameText("practitioner")).toContain("act on this advice this week");
  });

  it("treats an unset frame as the default", () => {
    expect(frameText(undefined)).toBe(frameText("default"));
  });

  it("keeps the no-praise and no-rewrite clause in every frame", () => {
    for (const frame of SCREENING_FRAMES) {
      expect(frameText(frame)).toMatch(/do not praise/i);
      expect(frameText(frame)).toMatch(/do not suggest replacement prose/i);
    }
  });

  it("recognises only the known frames", () => {
    expect(isScreeningFrame("skimmer")).toBe(true);
    expect(isScreeningFrame("busybody")).toBe(false);
    expect(isScreeningFrame(undefined)).toBe(false);
  });
});
