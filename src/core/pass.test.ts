import { describe, expect, it } from "vitest";
import type { Finding } from "./finding";
import {
  PASS_SCOPES,
  rulePassesToRun,
  scopeVocab,
  soloRulePass,
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

/** A Finding with just enough shape to sit in a band. */
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

describe("workingOrder and the Findings queue (ADR 0010)", () => {
  const PASSES: Pass[] = [
    modelPass("structure", "document", true),
    modelPass("local", "paragraph", true),
    rulePass("word", true),
  ];

  it("partitions the Findings queue by the band of the Pass that produced each", () => {
    const order = workingOrder(PASSES, [
      finding("w", "word"),
      finding("s", "structure"),
      finding("p", "local"),
    ]);

    const byBand = Object.fromEntries(
      order.groups.map((group) => [group.band, group.findings.map((entry) => entry.id)]),
    );
    expect(byBand).toEqual({
      structure: ["s"],
      paragraph: ["p"],
      word: ["w"],
    });
  });

  it("keeps a rule Pass in the word band whatever its stored scope", () => {
    const documentRule: Pass = { ...rulePass("rule-doc", true), scope: "document" };

    const order = workingOrder([documentRule], [finding("r", "rule-doc")]);

    expect(order.groups.find((group) => group.band === "word")?.findings.map((f) => f.id)).toEqual(
      ["r"],
    );
  });

  it("puts a document-scope Audit pass in structure and a section-scope Reader pass in paragraph", () => {
    const audit: Pass = { ...modelPass("audit", "document", true), output: "audit" };
    const reader: Pass = { ...modelPass("reader", "section", true), output: "section-summary" };

    const order = workingOrder(
      [audit, reader],
      [finding("a", "audit"), finding("r", "reader")],
    );

    const byBand = Object.fromEntries(
      order.groups.map((group) => [group.band, group.findings.map((entry) => entry.id)]),
    );
    expect(byBand).toEqual({ structure: ["a"], paragraph: ["r"], word: [] });
  });

  it("keeps every Band present whatever the Pass set", () => {
    expect(workingOrder([]).groups.map((group) => group.band)).toEqual([
      "structure",
      "paragraph",
      "word",
    ]);
    expect(workingOrder([rulePass("only-word", true)]).groups.map((group) => group.band)).toEqual([
      "structure",
      "paragraph",
      "word",
    ]);
  });

  it("is never empty of a Finding that exists: All holds every one", () => {
    const findings = [
      finding("w", "word"),
      finding("s", "structure"),
      finding("p", "local"),
      finding("s2", "structure"),
    ];

    const order = workingOrder(PASSES, findings);

    expect(order.all.map((entry) => entry.id)).toEqual(["s", "s2", "p", "w"]);
    expect(new Set(order.all.map((entry) => entry.id))).toEqual(
      new Set(findings.map((entry) => entry.id)),
    );
  });

  it("carries a Finding whose Pass is gone in All, without inventing a Band", () => {
    const orphan = finding("gone", "deleted-pass");
    const order = workingOrder(PASSES, [orphan]);

    expect(order.groups.flatMap((group) => group.findings)).toEqual([]);
    expect(order.all).toEqual([orphan]);
  });

  it("derives the same partition for the same input", () => {
    const findings = [finding("a", "structure"), finding("b", "word")];

    const order = workingOrder(PASSES, findings);

    // The expected partition is written out, not recomputed by the function.
    expect(order.groups.map((group) => group.findings.map((entry) => entry.id))).toEqual([
      ["a"],
      [],
      ["b"],
    ]);
    expect(order.all.map((entry) => entry.id)).toEqual(["a", "b"]);
    // An equal array with the same contents gives the same result.
    expect(workingOrder([...PASSES], [...findings]).all.map((entry) => entry.id)).toEqual([
      "a",
      "b",
    ]);
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
