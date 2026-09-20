import { describe, expect, it } from "vitest";
import { constitutionPromptClauses, STARTER_PASSES } from "./starterPasses";

/**
 * The Starter pack is data, but which data ships — its scope, its output shape,
 * its default enabled flag and, above all, the constitution clauses in its
 * prompts — is a requirement, not a preference. These assertions read the pack
 * as registered, against literal expectations; the behavioural test of a Run
 * lives in `critique.test.ts` through the seam.
 */

/**
 * The Starter model passes, in pack (DESIGN §4 numeric) order, with the scope
 * and default `enabled` flag DESIGN §4 gives them and a phrase each prompt must
 * carry so a prompt cannot be swapped for another pass's. Characters and actions
 * and paragraphs that could move both ship off; the rest are on.
 */
const EXPECTED_MODEL_PASSES: {
  id: string;
  scope: "paragraph" | "section" | "document";
  output: "findings" | "section-summary";
  enabled: boolean;
  looksFor: RegExp;
}[] = [
  { id: "characters-actions", scope: "paragraph", output: "findings", enabled: false, looksFor: /actor/i },
  { id: "topic-strings", scope: "document", output: "findings", enabled: true, looksFor: /cohere|stress position/i },
  { id: "paragraph-reorder", scope: "document", output: "findings", enabled: false, looksFor: /could change/i },
  { id: "paragraph-unity", scope: "paragraph", output: "findings", enabled: true, looksFor: /more than one idea/i },
  { id: "cut-candidates", scope: "paragraph", output: "findings", enabled: true, looksFor: /cut without loss/i },
  { id: "cliche", scope: "paragraph", output: "findings", enabled: true, looksFor: /cliché/i },
  { id: "claim-strength", scope: "paragraph", output: "findings", enabled: true, looksFor: /hedge/i },
  { id: "reader", scope: "section", output: "section-summary", enabled: true, looksFor: /distracted reader/i },
];

describe("Starter model passes", () => {
  it("registers every rule and model pass in the Starter pack", () => {
    expect(STARTER_PASSES.map((pass) => pass.id)).toEqual([
      "hedges",
      "nominalizations",
      "openers",
      "wordiness",
      "repetition",
      "characters-actions",
      "topic-strings",
      "paragraph-reorder",
      "paragraph-unity",
      "cut-candidates",
      "cliche",
      "claim-strength",
      "reader",
    ]);
  });

  it("gives every registered model Pass a unique id, its scope and its output shape", () => {
    const ids = STARTER_PASSES.map((pass) => pass.id);
    expect(new Set(ids).size).toBe(ids.length);

    const modelIds = STARTER_PASSES.filter((pass) => pass.kind === "model").map((pass) => pass.id);
    expect(modelIds).toEqual(EXPECTED_MODEL_PASSES.map((entry) => entry.id));

    for (const { id, scope, output, enabled } of EXPECTED_MODEL_PASSES) {
      expect(STARTER_PASSES.find((pass) => pass.id === id)).toMatchObject({
        kind: "model",
        scope,
        output,
        slot: "critic",
        enabled,
      });
    }
  });

  it("ships the structural passes at document scope, the local passes at paragraph scope, and the Reader at section scope", () => {
    const scopeOf = (id: string) => STARTER_PASSES.find((pass) => pass.id === id)?.scope;

    expect(scopeOf("topic-strings")).toBe("document");
    expect(scopeOf("paragraph-reorder")).toBe("document");
    expect(scopeOf("cliche")).toBe("paragraph");
    expect(scopeOf("reader")).toBe("section");
    expect(STARTER_PASSES.find((pass) => pass.id === "reader")?.output).toBe("section-summary");
  });

  it("checks every model prompt for the clauses its scope requires", () => {
    const modelPasses = STARTER_PASSES.filter((pass) => pass.kind === "model");
    expect(modelPasses).toHaveLength(EXPECTED_MODEL_PASSES.length);

    for (const pass of modelPasses) {
      const prompt = pass.prompt ?? "";
      for (const clause of constitutionPromptClauses(pass.scope)) {
        expect(prompt, `${pass.id} is missing "${clause.name}"`).toMatch(clause.pattern);
      }
    }
  });

  it("keeps each prompt about the problem its story names", () => {
    for (const { id, looksFor } of EXPECTED_MODEL_PASSES) {
      const pass = STARTER_PASSES.find((entry) => entry.id === id);
      expect(pass?.prompt).toMatch(looksFor);
    }
  });
});
