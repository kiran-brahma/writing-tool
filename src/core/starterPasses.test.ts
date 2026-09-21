import { describe, expect, it } from "vitest";
import type { RuleConfig } from "./pass";
import { AI_TELLS_PASS, blankModelPass, constitutionPromptClauses, STARTER_PASSES } from "./starterPasses";

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
  output: "findings" | "section-summary" | "audit";
  enabled: boolean;
  looksFor: RegExp;
}[] = [
  { id: "characters-actions", scope: "paragraph", output: "findings", enabled: true, looksFor: /actor/i },
  { id: "topic-strings", scope: "document", output: "findings", enabled: true, looksFor: /cohere|stress position/i },
  { id: "paragraph-reorder", scope: "document", output: "findings", enabled: true, looksFor: /could change/i },
  { id: "paragraph-unity", scope: "paragraph", output: "findings", enabled: true, looksFor: /more than one idea/i },
  { id: "cut-candidates", scope: "paragraph", output: "findings", enabled: true, looksFor: /cut without loss/i },
  { id: "cliche", scope: "paragraph", output: "findings", enabled: true, looksFor: /cliché/i },
  { id: "claim-strength", scope: "paragraph", output: "findings", enabled: true, looksFor: /hedge/i },
  { id: "reader", scope: "section", output: "section-summary", enabled: true, looksFor: /distracted reader/i },
  { id: "audit", scope: "document", output: "audit", enabled: true, looksFor: /reasoning holds up/i },
];

describe("Starter model passes", () => {
  it("registers every rule and model pass in the Starter pack", () => {
    expect(STARTER_PASSES.map((pass) => pass.id)).toEqual([
      "hedges",
      "nominalizations",
      "openers",
      "wordiness",
      "repetition",
      "passive",
      "ai-tells",
      "banned-words",
      "worn-phrases",
      "orwell",
      "characters-actions",
      "topic-strings",
      "paragraph-reorder",
      "paragraph-unity",
      "cut-candidates",
      "cliche",
      "claim-strength",
      "reader",
      "audit",
    ]);
  });

  it("ships the v1.1 rule passes enabled and with editable config", () => {
    const passive = STARTER_PASSES.find((pass) => pass.id === "passive");
    expect(passive).toMatchObject({
      kind: "rule",
      scope: "document",
      output: "findings",
      enabled: true,
    });
    expect(passive?.ruleConfig?.passiveVoiceAuxiliaries).toEqual(
      expect.arrayContaining(["is", "was", "were", "be"]),
    );

    const aiTells = STARTER_PASSES.find((pass) => pass.id === "ai-tells");
    expect(aiTells).toMatchObject({
      kind: "rule",
      scope: "document",
      output: "findings",
      enabled: true,
    });
    expect(aiTells?.ruleConfig?.aiTells).toEqual(expect.arrayContaining(["pivotal", "time will tell"]));
    expect(aiTells?.ruleConfig?.aiTellOpeners).toEqual(
      expect.arrayContaining(["and", "however"]),
    );
  });

  it("flips the v1.1 defaults and leaves Orwell off", () => {
    const enabled = (id: string) => STARTER_PASSES.find((pass) => pass.id === id)?.enabled;

    expect(enabled("characters-actions")).toBe(true);
    expect(enabled("paragraph-reorder")).toBe(true);
    expect(enabled("passive")).toBe(true);
    expect(enabled("ai-tells")).toBe(true);
    expect(enabled("orwell")).toBe(false);
  });

  it("folds A4 into cut candidates rather than adding a pass for it", () => {
    const cutCandidates = STARTER_PASSES.find((pass) => pass.id === "cut-candidates");
    expect(cutCandidates?.prompt).toMatch(/triad whose third item adds nothing/i);
    expect(STARTER_PASSES.some((pass) => /triad|hollow/.test(pass.id))).toBe(false);
  });

  it("gives the argumentative AI tells and honesty checks no rule pass", () => {
    // A8, A9, A12, A14 and H1-H5 belong to the Audit; an ai-tells config that
    // grew a field for them, or a pass named for them, would be the breach.
    const ruleConfigKeys = STARTER_PASSES.flatMap((pass) =>
      Object.keys(pass.ruleConfig ?? {}),
    );
    for (const field of ["fallacies", "honesty", "enthymemes", "persuasion"]) {
      expect(ruleConfigKeys).not.toContain(field);
    }
    for (const id of ["a8", "a9", "a12", "a14", "h1", "h2", "h3", "h4", "h5"]) {
      expect(STARTER_PASSES.some((pass) => pass.id === id)).toBe(false);
    }
  });

  it("gives every AI-tell term exactly one owner among the enabled rule passes", () => {
    // One span, one Finding: a term already flagged by another enabled, non-
    // exclusive rule pass must not also be seeded into the ai-tells pass, or the
    // Writer is handed two Findings for the same words. A term matched anywhere
    // can collide with any other list; a sentence-opening term can only collide
    // with another sentence-opening list.
    const others = STARTER_PASSES.filter(
      (pass) =>
        pass.kind === "rule" &&
        pass.enabled &&
        pass.exclusive !== true &&
        pass.id !== "ai-tells",
    );
    const anywhere = others.flatMap((pass) => literalTerms(pass.ruleConfig ?? {}));
    const anchored = others.flatMap((pass) => pass.ruleConfig?.openers ?? []);

    for (const term of AI_TELLS_PASS.ruleConfig?.aiTells ?? []) {
      for (const candidate of anywhere) expectNoOverlap(term, candidate);
    }
    for (const term of AI_TELLS_PASS.ruleConfig?.aiTellOpeners ?? []) {
      for (const candidate of anchored) expectNoOverlap(term, candidate);
      // An opener can also collide with a longer literal phrase that begins with
      // it, because a sentence starting that phrase starts with the opener too.
      for (const candidate of anywhere) expectNoPrefixOverlap(term, candidate);
    }
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
    expect(scopeOf("audit")).toBe("document");
    expect(STARTER_PASSES.find((pass) => pass.id === "reader")?.output).toBe("section-summary");
    expect(STARTER_PASSES.find((pass) => pass.id === "audit")?.output).toBe("audit");
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

  it("asks the Audit for the checks stories 119–129 name", () => {
    const prompt = STARTER_PASSES.find((pass) => pass.id === "audit")?.prompt ?? "";
    // The argument/observation test, deductive versus inductive, validity versus
    // soundness, the enthymeme check, the definition checks and the fallacy list.
    expect(prompt).toMatch(/argument if it asserts a conclusion/i);
    expect(prompt).toMatch(/deductive/i);
    expect(prompt).toMatch(/validity from soundness/i);
    expect(prompt).toMatch(/enthymeme/i);
    expect(prompt).toMatch(/equivocation/i);
    expect(prompt).toMatch(/persuasive definition/i);
    // Story 128: an observational piece requires an intensional definition and a
    // concrete example.
    expect(prompt).toMatch(/intensional definition/i);
    expect(prompt).toMatch(/concrete example/i);
    // Story 125: an unlabelled fault is described in plain terms.
    expect(prompt).toMatch(/fits no label/i);
  });
});

describe("blankModelPass", () => {
  it("seeds a new model Pass with the target scaffold and the constitutional clauses", () => {
    const pass = blankModelPass("new-pass");

    expect(pass).toMatchObject({
      id: "new-pass",
      kind: "model",
      scope: "paragraph",
      output: "findings",
      slot: "critic",
      enabled: true,
    });
    // Literal clauses, not the shared helper, so the template can disagree with
    // the validator about what it contains.
    expect(pass.prompt ?? "").toMatch(/analyze only this paragraph/i);
    expect(pass.prompt ?? "").toMatch(/do not praise/i);
    expect(pass.prompt ?? "").toMatch(/do not suggest replacement prose/i);
    expect(pass.prompt).toContain("{{target}}");
    expect(pass.prompt).toContain("{{context_above}}");
  });
});

/** Every literal word or phrase one rule Pass's config carries. */
function literalTerms(config: RuleConfig): string[] {
  return [
    ...(config.hedges ?? []),
    ...(config.openers ?? []),
    ...(config.wordiness ?? []).map(([wordy]) => wordy),
    ...(config.bannedWords ?? []),
    ...(config.wornPhrases ?? []),
    ...(config.aiTells ?? []),
    ...(config.aiTellOpeners ?? []),
    ...(config.passiveVoiceAuxiliaries ?? []),
  ];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expectNoOverlap(term: string, candidate: string): void {
  const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
  expect(pattern.test(candidate), `"${term}" is also owned by "${candidate}"`).toBe(false);
}

function expectNoPrefixOverlap(term: string, candidate: string): void {
  const pattern = new RegExp(`^\\b${escapeRegExp(term)}\\b`, "i");
  expect(pattern.test(candidate), `"${term}" opens the owned phrase "${candidate}"`).toBe(false);
}
