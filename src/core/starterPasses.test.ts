import { describe, expect, it } from "vitest";
import type { Pass } from "./pass";
import {
  CHARACTERS_ACTIONS_PASS,
  CLAIM_STRENGTH_PASS,
  CLICHE_PASS,
  CUT_CANDIDATES_PASS,
  PARAGRAPH_UNITY_PASS,
  STARTER_PASSES,
} from "./starterPasses";

/**
 * The Starter pack is data, but which data ships — its scope, its output
 * shape, its default enabled flag and, above all, the constitution clauses in
 * its prompts — is a requirement, not a preference. These assertions read the
 * pack directly; the behavioural test of a Run lives in `critique.test.ts`
 * through the seam.
 *
 * The three clauses here are the same ones the constitution harness checks, so
 * a new paragraph-scope pass cannot ship without them even if it never joins
 * the harness's three-pass matrix.
 */
const CONSTITUTION_CLAUSES: { name: string; pattern: RegExp }[] = [
  { name: "analyze only the target", pattern: /analyze only this paragraph/i },
  { name: "no praise", pattern: /do not praise/i },
  { name: "no replacement prose", pattern: /do not suggest replacement prose/i },
];

/**
 * The paragraph-scope Starter model passes, in pack order, with the default
 * `enabled` flag DESIGN §4 gives them. Characters and actions is the one that
 * ships off; the other four are on.
 */
const EXPECTED_MODEL_PASSES: { pass: Pass; enabled: boolean }[] = [
  { pass: CHARACTERS_ACTIONS_PASS, enabled: false },
  { pass: PARAGRAPH_UNITY_PASS, enabled: true },
  { pass: CUT_CANDIDATES_PASS, enabled: true },
  { pass: CLICHE_PASS, enabled: true },
  { pass: CLAIM_STRENGTH_PASS, enabled: true },
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

  it("gives every model Pass a unique id and the paragraph scope", () => {
    const ids = STARTER_PASSES.map((pass) => pass.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const { pass } of EXPECTED_MODEL_PASSES) {
      expect(pass).toMatchObject({
        kind: "model",
        scope: "paragraph",
        output: "findings",
        slot: "critic",
      });
    }
  });

  it("ships each Pass enabled or disabled as the spec says", () => {
    for (const { pass, enabled } of EXPECTED_MODEL_PASSES) {
      expect(STARTER_PASSES.find((entry) => entry.id === pass.id)?.enabled).toBe(enabled);
    }
  });

  it("keeps the constitution clauses in every paragraph-scope model prompt", () => {
    for (const { pass } of EXPECTED_MODEL_PASSES) {
      const prompt = pass.prompt ?? "";
      const missing = CONSTITUTION_CLAUSES.filter((clause) => !clause.pattern.test(prompt));
      expect(missing.map((clause) => clause.name)).toEqual([]);
    }
  });
});
