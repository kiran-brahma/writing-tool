import { describe, expect, it } from "vitest";
import { openFindingsInPass, type Finding, type FindingStatus } from "./finding";

function finding(id: string, passId: string, status: FindingStatus): Finding {
  return {
    id,
    passId,
    promptHash: "hash",
    anchor: { quote: "very", offset: 0, state: "attached" },
    issue: "Hedge",
    diagnosis: "Intensifier.",
    status,
    ...(status === "declined" ? { declineReason: "advice" as const } : {}),
    provenance: { providerId: "local", model: "rule", at: 1, revisionId: "rev" },
  };
}

describe("openFindingsInPass", () => {
  it("selects only the open Findings in that Pass", () => {
    const findings = [
      finding("a", "hedges", "open"),
      finding("b", "hedges", "addressed"),
      finding("c", "hedges", "declined"),
      finding("d", "cliche", "open"),
    ];

    expect(openFindingsInPass(findings, "hedges").map((entry) => entry.id)).toEqual(["a"]);
  });

  it("selects nothing when the Pass has no open Findings", () => {
    const findings = [
      finding("a", "hedges", "addressed"),
      finding("b", "hedges", "declined"),
    ];

    expect(openFindingsInPass(findings, "hedges")).toEqual([]);
  });

  it("selects nothing for a Pass id that produced no Findings", () => {
    const findings = [finding("a", "hedges", "open")];

    expect(openFindingsInPass(findings, "missing")).toEqual([]);
  });
});
