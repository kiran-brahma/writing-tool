import { describe, expect, it } from "vitest";
import { matchHedges, runRulePass } from "./rulePass";
import { HEDGES_PASS } from "./starterPasses";

describe("matchHedges", () => {
  it("finds every hedge in document order", () => {
    const matches = matchHedges("I very much like it. It is of course quite good.\n", [
      "very",
      "of course",
      "quite",
    ]);

    expect(matches.map((match) => match.quote)).toEqual(["very", "of course", "quite"]);
    expect(matches[0].offset).toBe(2);
  });

  it("is case-insensitive and respects word boundaries", () => {
    const matches = matchHedges("Very good. Justice is just.\n", ["very", "just"]);

    expect(matches.map((match) => match.quote)).toEqual(["Very", "just"]);
  });

  it("prefers a phrase over a word inside it", () => {
    const matches = matchHedges("This is of course fine.\n", ["of", "of course"]);

    expect(matches.map((match) => match.quote)).toEqual(["of course"]);
  });

  it("is deterministic: the same input produces the same matches", () => {
    const canonical = "It is very really quite good.\n";
    const first = matchHedges(canonical, ["very", "really", "quite"]);
    const second = matchHedges(canonical, ["very", "really", "quite"]);

    expect(second).toEqual(first);
  });

  it("finds nothing when the hedge list is empty", () => {
    expect(matchHedges("very good\n", [])).toEqual([]);
  });
});

describe("runRulePass", () => {
  const context = { at: 1_700_000_000_000, revisionId: "revision-1" };

  it("produces a Finding in the published shape", () => {
    const [finding] = runRulePass("This is very good.\n", HEDGES_PASS, context);

    expect(finding).toMatchObject({
      passId: "hedges",
      status: "open",
      issue: 'Hedge or intensifier: "very"',
      pattern: "very",
      anchor: { quote: "very", offset: 8, state: "attached" },
      provenance: {
        providerId: "local",
        model: "rule",
        at: context.at,
        revisionId: "revision-1",
      },
    });
    expect(finding.id).toEqual(expect.any(String));
    expect(finding.promptHash).toEqual(expect.any(String));
    expect(finding.declineReason).toBeUndefined();
  });

  it("is deterministic: the same canonical string yields the same Anchors", () => {
    const first = runRulePass("It is rather good.\n", HEDGES_PASS, context);
    const second = runRulePass("It is rather good.\n", HEDGES_PASS, context);

    expect(first.map((finding) => finding.anchor)).toEqual(
      second.map((finding) => finding.anchor),
    );
  });
});
