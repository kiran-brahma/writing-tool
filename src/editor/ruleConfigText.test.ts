import { describe, expect, it } from "vitest";
import type { RuleConfig } from "../core/pass";
import { applyFieldText, fieldText, ruleFields } from "./ruleConfigText";

describe("ruleFields", () => {
  it("shows only the fields a Pass carries", () => {
    expect(ruleFields({ hedges: ["very"] }).map((field) => field.key)).toEqual(["hedges"]);
    expect(ruleFields({ repetitionWindow: 3 }).map((field) => field.key)).toEqual([
      "repetitionWindow",
    ]);
  });

  it("keeps a stable, meaningful order when a Pass carries several fields", () => {
    const fields = ruleFields({ openers: ["there is"], hedges: ["very"], wordiness: [["a", "b"]] });

    expect(fields.map((field) => field.key)).toEqual(["hedges", "openers", "wordiness"]);
  });
});

describe("fieldText and applyFieldText", () => {
  it("round-trips a list, one entry per line", () => {
    const config: RuleConfig = { hedges: ["very", "of course"] };

    const text = fieldText(config, "hedges");
    expect(text).toBe("very\nof course");
    expect(applyFieldText(config, "hedges", text)).toEqual(config);
  });

  it("round-trips the house-style lists", () => {
    const config: RuleConfig = {
      bannedWords: ["leverage", "deep dive"],
      wornPhrases: ["perfect storm", "wake-up call"],
      aiTells: ["pivotal", "time will tell"],
      aiTellOpeners: ["and", "however"],
      printedFigures: ["silver bullet"],
      longWords: ["utilize"],
      cuttableWords: ["very"],
      passiveAuxiliaries: ["was"],
      passiveVoiceAuxiliaries: ["were"],
      jargonWords: ["synergy"],
    };

    for (const key of [
      "bannedWords",
      "wornPhrases",
      "aiTells",
      "aiTellOpeners",
      "printedFigures",
      "longWords",
      "cuttableWords",
      "passiveAuxiliaries",
      "passiveVoiceAuxiliaries",
      "jargonWords",
    ] as const) {
      expect(applyFieldText(config, key, fieldText(config, key)), key).toEqual(config);
    }
  });

  it("drops blank lines and trims a list", () => {
    const config: RuleConfig = { hedges: ["very"] };

    expect(applyFieldText(config, "hedges", "  very \n\n quite \n")).toEqual({
      hedges: ["very", "quite"],
    });
  });

  it("round-trips wordiness pairs", () => {
    const config: RuleConfig = { wordiness: [["in order to", "to"], ["the fact that", "that"]] };

    const text = fieldText(config, "wordiness");
    expect(text).toBe("in order to => to\nthe fact that => that");
    expect(applyFieldText(config, "wordiness", text)).toEqual(config);
  });

  it("drops a wordiness line with no replacement rather than guessing", () => {
    const config: RuleConfig = { wordiness: [] };

    expect(applyFieldText(config, "wordiness", "in order to\nat this point in time => now")).toEqual({
      wordiness: [["at this point in time", "now"]],
    });
  });

  it("clamps an unreadable repetition window to one", () => {
    const config: RuleConfig = { repetitionWindow: 3 };

    expect(applyFieldText(config, "repetitionWindow", "0").repetitionWindow).toBe(1);
    expect(applyFieldText(config, "repetitionWindow", "not a number").repetitionWindow).toBe(1);
    expect(applyFieldText(config, "repetitionWindow", "5").repetitionWindow).toBe(5);
  });
});
