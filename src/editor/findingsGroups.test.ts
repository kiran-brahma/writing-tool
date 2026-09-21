import { describe, expect, it } from "vitest";
import type { Finding } from "../core/finding";
import type { Pass } from "../core/pass";
import { groupFindingsByPass } from "./findingsGroups";

function finding(id: string, passId: string): Finding {
  return {
    id,
    passId,
    promptHash: "hash",
    anchor: { quote: "very", offset: 0, state: "attached" },
    issue: "issue",
    diagnosis: "diagnosis",
    status: "open",
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

/** A model Pass at the given scope, for the working-order test. */
function modelPass(id: string, name: string, scope: Pass["scope"]): Pass {
  return { ...pass(id, name), kind: "model", scope };
}

describe("groupFindingsByPass", () => {
  it("groups Findings under their Pass, in the Passes' order", () => {
    const groups = groupFindingsByPass(
      [finding("a", "second"), finding("b", "first"), finding("c", "second")],
      [pass("first", "First"), pass("second", "Second")],
    );

    expect(groups.map((group) => group.name)).toEqual(["First", "Second"]);
    expect(groups[0].findings.map((entry) => entry.id)).toEqual(["b"]);
    expect(groups[1].findings.map((entry) => entry.id)).toEqual(["a", "c"]);
  });

  it("omits a Pass with no Findings", () => {
    const groups = groupFindingsByPass(
      [finding("a", "first")],
      [pass("first", "First"), pass("empty", "Empty")],
    );

    expect(groups.map((group) => group.id)).toEqual(["first"]);
  });

  it("orders structure before paragraph before word, whatever the input order", () => {
    const groups = groupFindingsByPass(
      [finding("w", "word"), finding("p", "paragraph"), finding("s", "structure")],
      [pass("word", "Word"), modelPass("paragraph", "Paragraph", "paragraph"), modelPass("structure", "Structure", "document")],
    );

    expect(groups.map((group) => group.id)).toEqual(["structure", "paragraph", "word"]);
  });
});
