import { describe, expect, it } from "vitest";
import {
  rulePassesToRun,
  structuralPasses,
  workingOrder,
  type Pass,
} from "./pass";
import {
  HEDGES_PASS,
  PARAGRAPH_REORDER_PASS,
  PARAGRAPH_UNITY_PASS,
  STARTER_PASSES,
  TOPIC_STRINGS_PASS,
} from "./starterPasses";

/** A model Pass with just enough shape for the selection rule. */
function modelPass(id: string, scope: Pass["scope"], enabled: boolean): Pass {
  return {
    id,
    name: id,
    description: id,
    kind: "model",
    scope,
    output: "findings",
    slot: "critic",
    enabled,
  };
}

describe("structuralPasses", () => {
  it("selects the enabled model Passes whose scope is the whole document", () => {
    const passes: Pass[] = [
      HEDGES_PASS,
      modelPass("doc-on", "document", true),
      modelPass("doc-off", "document", false),
      modelPass("para-on", "paragraph", true),
    ];

    expect(structuralPasses(passes).map((pass) => pass.id)).toEqual(["doc-on"]);
  });

  it("keeps the document-scope model Passes in their pack order", () => {
    const passes: Pass[] = [
      PARAGRAPH_UNITY_PASS,
      TOPIC_STRINGS_PASS,
      PARAGRAPH_REORDER_PASS,
    ];

    // Stories 41 and 42 both ship on in v1.1, so both document-scope passes are
    // in the structural set, in pack order.
    expect(structuralPasses(passes).map((pass) => pass.id)).toEqual([
      "topic-strings",
      "paragraph-reorder",
    ]);
  });

  it("excludes a document-scope rule Pass, which is free and runs on save", () => {
    const structural = structuralPasses(STARTER_PASSES);
    expect(structural.every((pass) => pass.kind === "model")).toBe(true);
    expect(structural.map((pass) => pass.id)).not.toContain("hedges");
  });

  it("excludes a document-scope Pass whose output is not Findings", () => {
    const audit: Pass = { ...modelPass("audit", "document", true), output: "audit" };

    expect(structuralPasses([audit])).toEqual([]);
  });

  it("returns an empty set for an empty Pass list", () => {
    expect(structuralPasses([])).toEqual([]);
  });
});

/** A rule Pass with just enough shape for the selection rule. */
function rulePass(id: string, enabled: boolean, exclusive = false): Pass {
  return {
    id,
    name: id,
    description: id,
    kind: "rule",
    scope: "document",
    output: "findings",
    slot: "critic",
    enabled,
    exclusive,
  };
}

describe("rulePassesToRun", () => {
  it("runs every enabled rule Pass when none is exclusive", () => {
    const passes = [rulePass("a", true), rulePass("b", true), rulePass("c", false)];

    expect(rulePassesToRun(passes).map((pass) => pass.id)).toEqual(["a", "b"]);
  });

  it("runs an enabled exclusive Pass alone, holding the others", () => {
    const passes = [rulePass("a", true), rulePass("orwell", true, true), rulePass("c", true)];

    expect(rulePassesToRun(passes).map((pass) => pass.id)).toEqual(["orwell"]);
  });

  it("runs the others again once the exclusive Pass is turned off", () => {
    const passes = [rulePass("a", true), rulePass("orwell", false, true)];

    expect(rulePassesToRun(passes).map((pass) => pass.id)).toEqual(["a"]);
  });

  it("ignores model Passes", () => {
    const model: Pass = { ...rulePass("m", true), kind: "model" };

    expect(rulePassesToRun([model])).toEqual([]);
  });
});

describe("workingOrder", () => {
  it("returns the bands structure, paragraph, word", () => {
    const order = workingOrder([]);

    expect(order.groups.map((group) => group.band)).toEqual([
      "structure",
      "paragraph",
      "word",
    ]);
    expect(order.groups.map((group) => group.label)).toEqual([
      "Structure",
      "Paragraph",
      "Word",
    ]);
  });

  it("places each Pass in its band, keeping the order it was given", () => {
    const order = workingOrder([
      rulePass("word-a", true),
      modelPass("local-a", "paragraph", true),
      modelPass("structure-a", "document", true),
      modelPass("local-b", "section", true),
      modelPass("structure-b", "document", true),
    ]);

    const byBand = Object.fromEntries(
      order.groups.map((group) => [group.band, group.passes.map((pass) => pass.id)]),
    );
    expect(byBand).toEqual({
      structure: ["structure-a", "structure-b"],
      paragraph: ["local-a", "local-b"],
      word: ["word-a"],
    });
  });

  it("lists a disabled Pass, so the recommendation never hides a Pass", () => {
    const order = workingOrder([modelPass("off", "document", false)]);

    expect(order.groups[0].passes.map((pass) => pass.id)).toEqual(["off"]);
  });

  it("recommends the first enabled Pass in the sequence", () => {
    const order = workingOrder([
      modelPass("structure-off", "document", false),
      modelPass("local-on", "paragraph", true),
      modelPass("structure-on", "document", true),
    ]);

    expect(order.next?.id).toBe("structure-on");
  });

  it("recommends nothing when every Pass is off", () => {
    expect(workingOrder([rulePass("off", false)]).next).toBeNull();
    expect(workingOrder([]).next).toBeNull();
  });

  it("derives the same order for the same input", () => {
    const passes = [
      rulePass("word", true),
      modelPass("local", "paragraph", true),
      modelPass("structure", "document", true),
    ];

    // The expected sequence is written out, not recomputed by the function.
    expect(workingOrder(passes).groups.map((group) => group.passes.map((pass) => pass.id))).toEqual(
      [["structure"], ["local"], ["word"]],
    );
    // A different array with the same contents gives the same order.
    expect(
      workingOrder([...passes]).groups.map((group) => group.passes.map((pass) => pass.id)),
    ).toEqual([["structure"], ["local"], ["word"]]);
  });
});
