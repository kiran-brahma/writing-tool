import { describe, expect, it } from "vitest";
import {
  blankModelPass,
  constitutionPromptClauses,
  STARTER_PASSES,
} from "./starterPasses";

/**
 * The Starter pack is deliberately small: three rule passes that run on save
 * and three paragraph-scope model passes that run only from Review. These
 * assertions read the pack as registered; the behavioural test of a Run lives
 * in `critique.test.ts` through the seam.
 */

const RULE_IDS = ["hedges", "wordiness", "repetition"];
const MODEL_IDS = ["paragraph-unity", "cut-candidates", "claim-strength"];

describe("Starter pack", () => {
  it("registers exactly three rule passes and three model passes", () => {
    expect(STARTER_PASSES.map((pass) => pass.id)).toEqual([...RULE_IDS, ...MODEL_IDS]);
    expect(STARTER_PASSES.filter((pass) => pass.kind === "rule")).toHaveLength(3);
    expect(STARTER_PASSES.filter((pass) => pass.kind === "model")).toHaveLength(3);
  });

  it("keeps the removed rule and model passes out of the pack", () => {
    const removed = [
      "nominalizations",
      "openers",
      "passive",
      "ai-tells",
      "banned-words",
      "worn-phrases",
      "orwell",
      "characters-actions",
      "topic-strings",
      "paragraph-reorder",
      "cliche",
      "reader",
      "audit",
    ];
    for (const id of removed) {
      expect(STARTER_PASSES.some((pass) => pass.id === id), id).toBe(false);
    }
  });

  it("ships the rule passes document-scope, enabled and editable", () => {
    for (const id of RULE_IDS) {
      const pass = STARTER_PASSES.find((entry) => entry.id === id);
      expect(pass, id).toMatchObject({
        kind: "rule",
        scope: "document",
        output: "findings",
        slot: "critic",
        enabled: true,
      });
      expect(pass?.ruleConfig, id).toBeDefined();
    }
  });

  it("ships the model passes paragraph-scope, enabled and prompted", () => {
    for (const id of MODEL_IDS) {
      const pass = STARTER_PASSES.find((entry) => entry.id === id);
      expect(pass, id).toMatchObject({
        kind: "model",
        scope: "paragraph",
        output: "findings",
        slot: "critic",
        enabled: true,
      });
      expect(pass?.prompt, id).toBeTypeOf("string");
      expect(pass?.prompt?.length, id).toBeGreaterThan(0);
    }
  });

  it("keeps every model prompt's scope and constitution clauses", () => {
    for (const pass of STARTER_PASSES.filter((entry) => entry.kind === "model")) {
      const prompt = pass.prompt ?? "";
      // The literal clauses, independent of the table the builder uses, so a
      // change to both the builder and its table cannot hide a drift.
      expect(prompt, pass.id).toContain(
        "Do not praise the writing and do not suggest replacement prose.",
      );
      expect(prompt, pass.id).toMatch(/analyze only this paragraph/i);
      for (const clause of constitutionPromptClauses(pass.scope)) {
        expect(prompt, `${pass.id}: ${clause.name}`).toMatch(clause.pattern);
      }
    }
  });

  it("gives every pass a unique id", () => {
    const ids = STARTER_PASSES.map((pass) => pass.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives a new draft the paragraph scaffold and the two clauses", () => {
    const draft = blankModelPass("my-pass");

    expect(draft.scope).toBe("paragraph");
    expect(draft.prompt).toContain("TARGET PARAGRAPH");
    for (const clause of constitutionPromptClauses("paragraph")) {
      expect(draft.prompt, clause.name).toMatch(clause.pattern);
    }
  });
});
