import { describe, expect, it } from "vitest";
import { BANNED_WORDS_PASS, CLICHE_PASS, HEDGES_PASS, ORWELL_RULES_PASS, STARTER_PASSES, WORN_PHRASES_PASS } from "./starterPasses";
import {
  parsePassSet,
  passProblem,
  PASS_SET_FORMAT,
  PASS_SET_FORMAT_VERSION,
  PassSetFormatError,
  serializePassSet,
} from "./passSet";

describe("Pass set round trip", () => {
  it("returns the same Passes after export and import", () => {
    const passes = [HEDGES_PASS, CLICHE_PASS];

    const imported = parsePassSet(serializePassSet(passes));

    expect(imported).toEqual(passes);
  });

  it("round-trips the whole Starter pack", () => {
    expect(parsePassSet(serializePassSet(STARTER_PASSES))).toEqual(STARTER_PASSES);
  });

  it("writes the format tag and version", () => {
    const value = JSON.parse(serializePassSet([CLICHE_PASS])) as Record<string, unknown>;
    expect(value.format).toBe(PASS_SET_FORMAT);
    expect(value.version).toBe(PASS_SET_FORMAT_VERSION);
  });
});

describe("parsePassSet refusal", () => {
  it("refuses a file that is not JSON", () => {
    expect(() => parsePassSet("not json")).toThrow(PassSetFormatError);
  });

  it("refuses a file that is not an Obelus pass set", () => {
    expect(() => parsePassSet(JSON.stringify({ format: "something-else", passes: [] }))).toThrow(
      /not an Obelus pass set/i,
    );
  });

  it("refuses a set written by a newer Obelus", () => {
    const newer = JSON.stringify({
      format: PASS_SET_FORMAT,
      version: PASS_SET_FORMAT_VERSION + 1,
      passes: [],
    });
    expect(() => parsePassSet(newer)).toThrow(/newer Obelus/i);
  });

  it("refuses a set with no passes list", () => {
    const noList = JSON.stringify({ format: PASS_SET_FORMAT, version: 1 });
    expect(() => parsePassSet(noList)).toThrow(/"passes" list/i);
  });

  it("refuses a Pass with an unknown placeholder (story 100)", () => {
    const text = JSON.stringify({
      format: PASS_SET_FORMAT,
      version: 1,
      passes: [{ ...CLICHE_PASS, prompt: "Look at {{paragraf}}" }],
    });

    expect(() => parsePassSet(text)).toThrow(/\{\{paragraf\}\}/);
  });

  it("refuses two Passes sharing one id", () => {
    const text = JSON.stringify({
      format: PASS_SET_FORMAT,
      version: 1,
      passes: [CLICHE_PASS, { ...HEDGES_PASS, id: CLICHE_PASS.id }],
    });

    expect(() => parsePassSet(text)).toThrow(/same id/i);
  });
});

describe("passProblem", () => {
  it("accepts a Starter Pass", () => {
    expect(passProblem(CLICHE_PASS)).toBeNull();
    expect(passProblem(HEDGES_PASS)).toBeNull();
    expect(passProblem(ORWELL_RULES_PASS)).toBeNull();
  });

  it("names an unreadable exclusive flag", () => {
    expect(passProblem({ ...HEDGES_PASS, exclusive: "yes" })).toMatch(/exclusive flag/i);
  });

  it("names a model Pass with no prompt", () => {
    expect(passProblem({ ...CLICHE_PASS, prompt: "" })).toMatch(/needs a prompt/i);
  });

  it("names an unknown scope and an unknown output shape", () => {
    expect(passProblem({ ...CLICHE_PASS, scope: "chapter" })).toMatch(/unknown scope/i);
    expect(passProblem({ ...CLICHE_PASS, output: "json-schema" })).toMatch(/unknown output shape/i);
  });

  it("names the removed note output shape (story 158)", () => {
    expect(passProblem({ ...CLICHE_PASS, output: "note" })).toMatch(/unknown output shape/i);
  });

  it("refuses a frame on an Audit pass (story 154)", () => {
    const audit = STARTER_PASSES.find((pass) => pass.id === "audit");
    if (audit === undefined) throw new Error("the Starter pack has no audit pass");

    // The `frame` field arrives with the frames work (#32); an Audit pass may
    // never carry one, because its method defines its stance.
    expect(passProblem({ ...audit, frame: "skimmer" })).toMatch(/may not set a frame/i);
    expect(passProblem({ ...CLICHE_PASS, frame: "skimmer" })).toBeNull();
  });

  it("refuses a Pass set carrying the removed note shape (story 158)", () => {
    const file = JSON.stringify({
      format: PASS_SET_FORMAT,
      version: PASS_SET_FORMAT_VERSION,
      passes: [{ ...CLICHE_PASS, output: "note" }],
    });

    expect(() => parsePassSet(file)).toThrow(/unknown output shape/i);
  });

  it("names an unreadable Rule config", () => {
    expect(passProblem({ ...HEDGES_PASS, ruleConfig: { hedges: [1] } })).toMatch(
      /unreadable Rule config/i,
    );
  });

  it("names an unreadable house-style list", () => {
    expect(passProblem({ ...BANNED_WORDS_PASS, ruleConfig: { bannedWords: [1] } })).toMatch(
      /unreadable Rule config/i,
    );
    expect(
      passProblem({ ...WORN_PHRASES_PASS, ruleConfig: { wornPhrases: ["a", 2] } }),
    ).toMatch(/unreadable Rule config/i);
  });

  it("names an unreadable v1.1 list", () => {
    for (const field of ["aiTells", "aiTellOpeners", "passiveVoiceAuxiliaries"] as const) {
      expect(
        passProblem({ ...HEDGES_PASS, ruleConfig: { [field]: ["a", 2] } }),
        field,
      ).toMatch(/unreadable Rule config/i);
    }
  });

  it("refuses a Rule config carrying both passive auxiliary lists", () => {
    expect(
      passProblem({
        ...HEDGES_PASS,
        ruleConfig: { passiveAuxiliaries: ["was"], passiveVoiceAuxiliaries: ["was"] },
      }),
    ).toMatch(/unreadable Rule config/i);
  });

  it("names an unreadable Orwell list", () => {
    for (const field of [
      "printedFigures",
      "longWords",
      "cuttableWords",
      "passiveAuxiliaries",
      "jargonWords",
    ] as const) {
      expect(
        passProblem({ ...ORWELL_RULES_PASS, ruleConfig: { [field]: ["a", 2] } }),
        field,
      ).toMatch(/unreadable Rule config/i);
    }
  });
});
