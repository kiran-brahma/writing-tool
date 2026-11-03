import { describe, expect, it } from "vitest";
import {
  PASS_SCOPES,
  paragraphModelPasses,
  rulePassesToRun,
  scopeVocab,
  soloRulePass,
  structuralPasses,
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

  it("finds no structural model Pass in the simplified pack", () => {
    // The shipped model passes are all paragraph-scope; document-scope prompts
    // remain only as harness fixtures.
    expect(structuralPasses(STARTER_PASSES)).toEqual([]);
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

describe("soloRulePass", () => {
  it("names the enabled exclusive Pass holding the others", () => {
    const passes = [rulePass("a", true), rulePass("orwell", true, true), rulePass("c", true)];

    expect(soloRulePass(passes)?.id).toBe("orwell");
  });

  it("is null when no exclusive Pass is on", () => {
    expect(soloRulePass([rulePass("a", true), rulePass("orwell", false, true)])).toBeNull();
    expect(soloRulePass([])).toBeNull();
  });
});

describe("paragraphModelPasses", () => {
  it("selects only enabled paragraph-scope findings model passes", () => {
    const passes: Pass[] = [
      rulePass("rule", true),
      modelPass("para", "paragraph", true),
      modelPass("off", "paragraph", false),
      modelPass("doc", "document", true),
    ];

    expect(paragraphModelPasses(passes).map((pass) => pass.id)).toEqual(["para"]);
  });
});

describe("scopeVocab", () => {
  it("names every scope the type allows, with no gaps", () => {
    for (const scope of PASS_SCOPES) {
      const vocab = scopeVocab(scope);
      expect(vocab.label).not.toBe("");
      expect(vocab.targetPhrase).not.toBe("");
      expect(vocab.emptyMessage).not.toBe("");
    }
  });

  it("uses the wording the Rail, the Workbench and the Run guard show", () => {
    // Written out rather than recomputed: these strings are the Writer-facing
    // contract the three surfaces used to hold separately.
    expect(scopeVocab("document")).toEqual({
      label: "Whole document",
      targetPhrase: "the whole document",
      emptyMessage: "Add some text before running a structural Pass.",
    });
    expect(scopeVocab("section").label).toBe("Section");
    expect(scopeVocab("paragraph").targetPhrase).toBe("the paragraph your cursor is in");
  });
});
