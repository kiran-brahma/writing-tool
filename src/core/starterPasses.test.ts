import { describe, expect, it } from "vitest";
import { CONSTITUTION_PROMPT_CLAUSES, STARTER_PASSES } from "./starterPasses";

/**
 * The Starter pack is data, but which data ships — its scope, its output shape,
 * its default enabled flag and, above all, the constitution clauses in its
 * prompts — is a requirement, not a preference. These assertions read the pack
 * as registered, against literal expectations; the behavioural test of a Run
 * lives in `critique.test.ts` through the seam.
 */

/**
 * The paragraph-scope Starter model passes, in pack order, with the default
 * `enabled` flag DESIGN §4 gives them and a phrase each prompt must carry so a
 * prompt cannot be swapped for another pass's. Characters and actions is the
 * one that ships off; the other four are on.
 */
const EXPECTED_MODEL_PASSES: { id: string; enabled: boolean; looksFor: RegExp }[] = [
  { id: "characters-actions", enabled: false, looksFor: /actor/i },
  { id: "paragraph-unity", enabled: true, looksFor: /more than one idea/i },
  { id: "cut-candidates", enabled: true, looksFor: /cut without loss/i },
  { id: "cliche", enabled: true, looksFor: /cliché/i },
  { id: "claim-strength", enabled: true, looksFor: /hedge/i },
];

describe("Starter model passes", () => {
  it("registers the five paragraph-scope model passes in the Starter pack", () => {
    expect(STARTER_PASSES.map((pass) => pass.id)).toEqual([
      "hedges",
      "nominalizations",
      "openers",
      "wordiness",
      "repetition",
      "characters-actions",
      "paragraph-unity",
      "cut-candidates",
      "cliche",
      "claim-strength",
    ]);
  });

  it("gives every registered model Pass a unique id and the paragraph scope", () => {
    const ids = STARTER_PASSES.map((pass) => pass.id);
    expect(new Set(ids).size).toBe(ids.length);

    const modelIds = STARTER_PASSES.filter((pass) => pass.kind === "model").map((pass) => pass.id);
    expect(modelIds).toEqual(EXPECTED_MODEL_PASSES.map((entry) => entry.id));

    for (const { id, enabled } of EXPECTED_MODEL_PASSES) {
      expect(STARTER_PASSES.find((pass) => pass.id === id)).toMatchObject({
        kind: "model",
        scope: "paragraph",
        output: "findings",
        slot: "critic",
        enabled,
      });
    }
  });

  it("checks every paragraph-scope model prompt for the constitution clauses", () => {
    const modelPasses = STARTER_PASSES.filter((pass) => pass.kind === "model");
    expect(modelPasses).toHaveLength(EXPECTED_MODEL_PASSES.length);

    for (const pass of modelPasses) {
      const prompt = pass.prompt ?? "";
      for (const clause of CONSTITUTION_PROMPT_CLAUSES) {
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
