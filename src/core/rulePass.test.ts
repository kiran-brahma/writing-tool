import { describe, expect, it } from "vitest";
import type { Finding } from "./finding";
import type { Pass, RuleConfig } from "./pass";
import { ruleMatches, runRulePass } from "./rulePass";
import { HEDGES_PASS, STARTER_PASSES, WORDINESS_PASS } from "./starterPasses";

/** A rule Pass carrying only the config under test. */
function passWith(ruleConfig: RuleConfig): Pass {
  return { ...HEDGES_PASS, id: "test", ruleConfig };
}

describe("ruleMatches", () => {
  it("finds every hedge in document order", () => {
    const matches = ruleMatches(
      "I very much like it. It is of course quite good.\n",
      passWith({ hedges: ["very", "of course", "quite"] }),
    );

    expect(matches.map((match) => match.quote)).toEqual(["very", "of course", "quite"]);
    expect(matches[0].offset).toBe(2);
  });

  it("is case-insensitive and respects word boundaries", () => {
    const matches = ruleMatches("Very good. Justice is just.\n", passWith({ hedges: ["very", "just"] }));

    expect(matches.map((match) => match.quote)).toEqual(["Very", "just"]);
  });

  it("prefers a phrase over a word inside it", () => {
    const matches = ruleMatches(
      "This is of course fine.\n",
      passWith({ hedges: ["of", "of course"] }),
    );

    expect(matches.map((match) => match.quote)).toEqual(["of course"]);
  });

  it("finds nothing when the hedge list is empty", () => {
    expect(ruleMatches("very good\n", passWith({ hedges: [] }))).toEqual([]);
  });

  it("flags a nominalization that ends in a configured suffix", () => {
    const matches = ruleMatches(
      "The implementation of the decision.\n",
      passWith({ nominalizationSuffixes: ["tion", "sion", "ment"] }),
    );

    expect(matches.map((match) => match.quote)).toEqual(["implementation", "decision"]);
    expect(matches[0].pattern).toBe("tion");
  });

  it("does not flag a short word that merely ends in a suffix", () => {
    expect(ruleMatches("A nation at home.\n", passWith({ nominalizationSuffixes: ["tion"] }))).toEqual(
      [],
    );
  });

  it("flags a wordy phrase and reports the configured replacement", () => {
    const matches = ruleMatches(
      "In order to go, we left.\n",
      passWith({ wordiness: [["in order to", "to"]] }),
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].quote).toBe("In order to");
    expect(matches[0].diagnosis).toContain('"to"');
  });

  it("prefers the longest matching wordy phrase", () => {
    const matches = ruleMatches(
      "In spite of the fact that we tried.\n",
      passWith({
        wordiness: [
          ["the fact that", "that"],
          ["in spite of the fact that", "although"],
        ],
      }),
    );

    expect(matches.map((match) => match.quote)).toEqual(["In spite of the fact that"]);
  });

  it("flags a configured opener at a sentence start", () => {
    const matches = ruleMatches(
      "There is a problem. It was fine.\n",
      passWith({ openers: ["there is", "it was"] }),
    );

    expect(matches.map((match) => match.quote)).toEqual(["There is", "It was"]);
  });

  it("does not flag an opener inside a sentence", () => {
    expect(ruleMatches("A place where there is hope.\n", passWith({ openers: ["there is"] }))).toEqual(
      [],
    );
  });

  it("ignores leading emphasis markers before measuring an opener's offset", () => {
    const matches = ruleMatches("**There is** a problem.\n", passWith({ openers: ["there is"] }));

    expect(matches[0].quote).toBe("There is");
    expect(matches[0].offset).toBe(2);
  });

  it("flags a word repeated within the window", () => {
    const matches = ruleMatches("Alpha went home. Beta went away.\n", passWith({ repetitionWindow: 2 }));

    expect(matches).toHaveLength(1);
    expect(matches[0].issue).toBe('Repeated word: "went"');
    expect(matches[0].pattern).toBe("went");
  });

  it("flags a short content word repeated within the window", () => {
    const matches = ruleMatches("Alpha ran home. Beta also ran away.\n", passWith({ repetitionWindow: 2 }));

    expect(matches).toHaveLength(1);
    expect(matches[0].issue).toBe('Repeated word: "ran"');
  });

  it("does not flag a repeat outside the window", () => {
    const matches = ruleMatches(
      "Alpha went. Beta ran. Gamma saw. Delta went.\n",
      passWith({ repetitionWindow: 1 }),
    );

    expect(matches).toEqual([]);
  });

  it("flags a repeated sentence opener rather than the same token twice", () => {
    const matches = ruleMatches("Writing is hard. Writing is slow.\n", passWith({ repetitionWindow: 3 }));

    expect(matches).toHaveLength(1);
    expect(matches[0].issue).toBe('Repeated sentence opener: "Writing"');
  });

  it("ignores repetition of stopwords", () => {
    expect(ruleMatches("The cat and the dog and the fox.\n", passWith({ repetitionWindow: 3 }))).toEqual(
      [],
    );
  });

  it("keeps a curly apostrophe inside the token rather than splitting the word", () => {
    // With `’` outside the token class this would tokenize as "doesn" and "t",
    // and the repeated "doesn" would be a fragment quoted as a word.
    expect(
      ruleMatches("It doesn’t matter. It doesn’t help.\n", passWith({ repetitionWindow: 2 })),
    ).toEqual([]);
  });

  it("runs the rule its config selects", () => {
    const matches = ruleMatches("In order to go.\n", WORDINESS_PASS);

    expect(matches.map((match) => match.pattern)).toEqual(["in order to"]);
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

/**
 * The ticket's determinism criterion, exercised across the whole Starter pack
 * rather than one pass: a rule Pass is a pure function of the canonical string
 * and its Rule config. Finding ids are minted per Run and are therefore the one
 * field that differs — identity across Runs is reconciled in Core, by resolved
 * interval, not claimed here.
 */
describe("the Starter pack is deterministic", () => {
  const canonical =
    "There is a very good implementation. In order to decide, we decide again and again. " +
    "Writing is hard. Writing is slow.\n";
  const context = { at: 1_700_000_000_000, revisionId: "revision-1" };

  it("produces the same Finding content on a second run of every pass", () => {
    for (const pass of STARTER_PASSES) {
      const first = runRulePass(canonical, pass, context).map(stripId);
      const second = runRulePass(canonical, pass, context).map(stripId);

      expect(second).toEqual(first);
    }
  });

  it("anchors every Finding inside the canonical string", () => {
    for (const pass of STARTER_PASSES) {
      for (const finding of runRulePass(canonical, pass, context)) {
        expect(finding.anchor.state).toBe("attached");
        expect(
          canonical.slice(
            finding.anchor.offset,
            finding.anchor.offset + finding.anchor.quote.length,
          ),
        ).toBe(finding.anchor.quote);
      }
    }
  });
});

function stripId({ id: _id, ...finding }: Finding): Omit<Finding, "id"> {
  return finding;
}
