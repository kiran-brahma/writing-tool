import { describe, expect, it } from "vitest";
import type { Finding, FindingStatus } from "../core/finding";
import { calloutFindings, calloutPosition } from "./callout";

function finding(id: string, status: FindingStatus = "open"): Finding {
  return {
    id,
    passId: "hedges",
    promptHash: "hash",
    anchor: { quote: "very", offset: 0, state: "attached" },
    issue: "issue",
    diagnosis: "diagnosis",
    status,
    provenance: { providerId: "local", model: "rule", at: 1, revisionId: "r1" },
  };
}

describe("calloutFindings", () => {
  it("shows the open Findings the clicked Highlight names, in the order named", () => {
    const shown = calloutFindings(["b", "a"], [finding("a"), finding("b"), finding("c")]);

    expect(shown.map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  it("leaves out a Finding that has left the queue or no longer exists", () => {
    const shown = calloutFindings(
      ["a", "gone", "b"],
      [finding("a", "addressed"), finding("b")],
    );

    expect(shown.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("shows a Finding once when overlapping Highlights both name it", () => {
    const shown = calloutFindings(["a", "a"], [finding("a")]);

    expect(shown).toHaveLength(1);
  });
});

describe("calloutPosition", () => {
  const viewport = { width: 1200, height: 800 };
  const size = { width: 288, height: 200 };

  it("sits below the Highlight, aligned to its left edge", () => {
    const position = calloutPosition({ left: 100, top: 300, bottom: 320 }, viewport, size);

    expect(position).toEqual({ left: 100, top: 326, placement: "below" });
  });

  it("flips above the Highlight when there is no room below", () => {
    const position = calloutPosition({ left: 100, top: 700, bottom: 720 }, viewport, size);

    expect(position).toEqual({ left: 100, top: 494, placement: "above" });
  });

  it("stays inside the viewport near its right edge", () => {
    const position = calloutPosition({ left: 1100, top: 300, bottom: 320 }, viewport, size);

    expect(position.left).toBe(1200 - 288 - 16);
  });
});
