import { describe, expect, it } from "vitest";
import { rulePassesToRun, structuralPasses, type Pass } from "./pass";
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

    // Story 41's pass ships on, story 42's off, so the set is the topic pass.
    expect(structuralPasses(passes).map((pass) => pass.id)).toEqual(["topic-strings"]);
  });

  it("excludes a document-scope rule Pass, which is free and runs on save", () => {
    const structural = structuralPasses(STARTER_PASSES);
    expect(structural.every((pass) => pass.kind === "model")).toBe(true);
    expect(structural.map((pass) => pass.id)).not.toContain("hedges");
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
