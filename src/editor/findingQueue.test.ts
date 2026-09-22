import { describe, expect, it } from "vitest";
import type { Finding, FindingStatus } from "../core/finding";
import type { Pass } from "../core/pass";
import { openFindings, selectionAfterLeavingPass, selectionAfterLeavingQueue, stepSelection } from "./findingQueue";

function finding(id: string, passId: string, status: FindingStatus = "open"): Finding {
  return {
    id,
    passId,
    promptHash: "hash",
    anchor: { quote: "very", offset: 0, state: "attached" },
    issue: "issue",
    diagnosis: "diagnosis",
    status,
    provenance: { providerId: "local", model: "rule", at: 1, revisionId: "r1" },
  };
}

function pass(id: string, name: string): Pass {
  return {
    id,
    name,
    description: "",
    kind: "rule",
    scope: "document",
    output: "findings",
    slot: "critic",
    enabled: true,
  };
}

const PASSES = [pass("first", "First"), pass("second", "Second")];

describe("openFindings", () => {
  it("keeps only open Findings, in the sidebar's order", () => {
    const queue = openFindings(
      [
        finding("a", "second"),
        finding("b", "first"),
        finding("c", "second", "addressed"),
        finding("d", "first", "declined"),
        finding("e", "second"),
      ],
      PASSES,
    );

    expect(queue.map((entry) => entry.id)).toEqual(["b", "a", "e"]);
  });

  it("is empty when every Finding has left the queue", () => {
    expect(openFindings([finding("a", "first", "declined")], PASSES)).toEqual([]);
  });
});

describe("stepSelection", () => {
  const open = ["a", "b", "c"].map((id) => finding(id, "first"));

  it("selects the first open Finding going forward with no selection", () => {
    expect(stepSelection(open, null, 1)).toBe("a");
  });

  it("selects the last open Finding going backward with no selection", () => {
    expect(stepSelection(open, null, -1)).toBe("c");
  });

  it("steps forward and back through the queue", () => {
    expect(stepSelection(open, "a", 1)).toBe("b");
    expect(stepSelection(open, "b", 1)).toBe("c");
    expect(stepSelection(open, "c", -1)).toBe("b");
    expect(stepSelection(open, "b", -1)).toBe("a");
  });

  it("does not wrap at either end", () => {
    expect(stepSelection(open, "c", 1)).toBe("c");
    expect(stepSelection(open, "a", -1)).toBe("a");
  });

  it("returns null when the queue is empty", () => {
    expect(stepSelection([], null, 1)).toBeNull();
  });

  it("recovers from a stale selection by picking the boundary", () => {
    expect(stepSelection(open, "gone", 1)).toBe("a");
    expect(stepSelection(open, "gone", -1)).toBe("c");
  });
});

describe("selectionAfterLeavingQueue", () => {
  const open = ["a", "b", "c"].map((id) => finding(id, "first"));

  it("selects the Finding that slid into the vacated slot", () => {
    expect(selectionAfterLeavingQueue(open, "b")).toBe("c");
  });

  it("falls back to the previous Finding when the last one left", () => {
    expect(selectionAfterLeavingQueue(open, "c")).toBe("b");
  });

  it("selects the first Finding when the first one left", () => {
    expect(selectionAfterLeavingQueue(open, "a")).toBe("b");
  });

  it("returns null when nothing open remains", () => {
    expect(selectionAfterLeavingQueue([finding("a", "first")], "a")).toBeNull();
  });
});

describe("selectionAfterLeavingPass", () => {
  const open = [
    finding("a", "first"),
    finding("b", "second"),
    finding("c", "first"),
    finding("d", "second"),
  ];

  it("selects the Finding that slid into the vacated slot", () => {
    expect(selectionAfterLeavingPass(open, "first", "a")).toBe("b");
    expect(selectionAfterLeavingPass(open, "first", "c")).toBe("d");
  });

  it("keeps a Current Finding that is in another Pass", () => {
    expect(selectionAfterLeavingPass(open, "first", "b")).toBe("b");
    expect(selectionAfterLeavingPass(open, "first", "d")).toBe("d");
  });

  it("returns null when the declined Pass held every open Finding", () => {
    const only = [finding("a", "first"), finding("c", "first")];
    expect(selectionAfterLeavingPass(only, "first", "a")).toBeNull();
  });

  it("returns null with no Current Finding", () => {
    expect(selectionAfterLeavingPass(open, "first", null)).toBeNull();
  });

  it("returns null for a stale Current Finding", () => {
    expect(selectionAfterLeavingPass(open, "first", "gone")).toBeNull();
  });
});
