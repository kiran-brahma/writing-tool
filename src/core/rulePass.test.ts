import { describe, expect, it } from "vitest";
import type { Finding } from "./finding";
import type { Pass, RuleConfig } from "./pass";
import { ruleMatches, runRulePass } from "./rulePass";
import { HEDGES_PASS, STARTER_PASSES, WORDINESS_PASS, BANNED_WORDS_PASS, WORN_PHRASES_PASS, ORWELL_RULES_PASS, PASSIVE_PASS, AI_TELLS_PASS } from "./starterPasses";

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

  it("flags a banned word and names the problem without a replacement", () => {
    const matches = ruleMatches(
      "We should leverage our ecosystem.\n",
      passWith({ bannedWords: ["leverage", "ecosystem"] }),
    );

    expect(matches.map((match) => match.quote)).toEqual(["leverage", "ecosystem"]);
    expect(matches[0].issue).toBe('Banned word: "leverage"');
    expect(matches[0].diagnosis).not.toContain('"');
  });

  it("flags a worn phrase and prefers the longer configured phrase", () => {
    const matches = ruleMatches(
      "It is a perfect storm.\n",
      passWith({ wornPhrases: ["storm", "perfect storm"] }),
    );

    expect(matches.map((match) => match.quote)).toEqual(["perfect storm"]);
    expect(matches[0].issue).toBe('Worn phrase: "perfect storm"');
  });

  it("flags the Reduction List and the Anglo-Saxon preference from the guide", () => {
    const matches = ruleMatches(
      "We sold off the track record. We purchase a drone.\n",
      WORDINESS_PASS,
    );

    expect(matches.map((match) => match.quote)).toEqual([
      "sold off",
      "track record",
      "purchase",
    ]);
    expect(matches[1].diagnosis).toContain('"record"');
  });

  it("ships the doc-derived house-style lists in the Starter pack", () => {
    expect(
      ruleMatches("We leverage synergy.\n", BANNED_WORDS_PASS).map((match) => match.pattern),
    ).toEqual(["leverage", "synergy"]);
    expect(
      ruleMatches("It is a perfect storm.\n", WORN_PHRASES_PASS).map((match) => match.pattern),
    ).toEqual(["perfect storm"]);
  });

  it("flags every one of Orwell's rules and names the rule that failed", () => {
    const pass = passWith({
      printedFigures: ["perfect storm"],
      longWords: ["utilize"],
      cuttableWords: ["very"],
      jargonWords: ["leverage"],
    });

    const matches = ruleMatches("It was a perfect storm. We utilize very good leverage.\n", pass);

    expect(matches.map((match) => match.issue)).toEqual([
      'Orwell 1: figure of speech seen in print: "perfect storm"',
      'Orwell 2: long word: "utilize"',
      'Orwell 3: word that can be cut: "very"',
      'Orwell 5: jargon or foreign word: "leverage"',
    ]);
  });

  it("reads Orwell's passive as an auxiliary and an -ed or irregular participle", () => {
    const pass = passWith({ passiveAuxiliaries: ["is", "was", "were", "be"] });

    const matches = ruleMatches("The report was completed. The keys were taken.\n", pass);

    expect(matches.map((match) => match.quote)).toEqual(["was completed", "were taken"]);
    expect(matches[0].issue).toBe('Orwell 4: passive construction: "was completed"');
    expect(matches[1].pattern).toBe("were taken");
  });

  it("reports what fails without saying what to write", () => {
    const pass = passWith({
      printedFigures: ["perfect storm"],
      longWords: ["utilize"],
      cuttableWords: ["very"],
      passiveAuxiliaries: ["was"],
      jargonWords: ["leverage"],
    });

    const matches = ruleMatches(
      "It was a perfect storm. The report was completed. We utilize very good leverage.\n",
      pass,
    );

    expect(matches).toHaveLength(5);
    for (const match of matches) {
      expect(match.diagnosis).not.toMatch(/instead|replace|rewrite/i);
    }
  });

  it("ships Orwell's pass in the Starter pack, off by default and exclusive", () => {
    expect(ORWELL_RULES_PASS.enabled).toBe(false);
    expect(ORWELL_RULES_PASS.exclusive).toBe(true);
    expect(ruleMatches("It was a perfect storm.\n", ORWELL_RULES_PASS).length).toBeGreaterThan(0);
  });

  it("flags a passive construction and states the Williams exception as a note", () => {
    const matches = ruleMatches(
      "The report was completed. The keys were taken.\n",
      PASSIVE_PASS,
    );

    expect(matches.map((match) => match.quote)).toEqual(["was completed", "were taken"]);
    expect(matches[0].issue).toBe('Passive construction: "was completed"');
    expect(matches[0].diagnosis).toMatch(/note, not an error/i);
    expect(matches[0].diagnosis).toMatch(/agent is unknown or irrelevant/i);
    expect(matches[0].diagnosis).toMatch(/patient is the topic/i);
    // Its own rule, not Orwell 4: the two passes report the same span differently.
    expect(matches[0].issue).not.toMatch(/Orwell/);
  });

  it("reports the same passive span through Orwell's pass at its own severity", () => {
    const orwell = ruleMatches("The report was completed.\n", ORWELL_RULES_PASS);
    const passive = ruleMatches("The report was completed.\n", PASSIVE_PASS);

    expect(orwell[0].quote).toBe(passive[0].quote);
    expect(orwell[0].diagnosis).not.toBe(passive[0].diagnosis);
  });

  it("takes the passive auxiliaries from editable Rule config", () => {
    const matches = ruleMatches(
      "The report got completed.\n",
      passWith({ passiveVoiceAuxiliaries: ["got"] }),
    );

    expect(matches.map((match) => match.quote)).toEqual(["got completed"]);
    expect(ruleMatches("The report was completed.\n", passWith({ passiveVoiceAuxiliaries: ["got"] }))).toEqual(
      [],
    );
  });

  it("does not read a passive across a sentence or block boundary", () => {
    expect(ruleMatches("The report was. Completed.\n", PASSIVE_PASS)).toEqual([]);
    expect(ruleMatches("The report was.\n\nCompleted.\n", PASSIVE_PASS)).toEqual([]);
    // A tab still joins the two words in one running line.
    expect(ruleMatches("The report was\tcompleted.\n", PASSIVE_PASS).map((match) => match.quote)).toEqual(
      ["was\tcompleted"],
    );
  });

  it("flags each lexical AI tell from the editable list", () => {
    const matches = ruleMatches(
      "It is pivotal. Experts say so. At its core it is deep. Time will tell. Great question.\n",
      AI_TELLS_PASS,
    );

    expect(matches.map((match) => match.quote)).toEqual([
      "pivotal",
      "Experts say",
      "At its core",
      "Time will tell",
      "Great question",
    ]);
    expect(matches[0].issue).toBe('AI tell: "pivotal"');
    expect(matches[0].diagnosis).not.toMatch(/instead|replace|rewrite/i);
  });

  it("flags a crowd opening and a sentence-initial conjunction as AI tells", () => {
    const matches = ruleMatches(
      "Many of us ship. Most operators wait. And so it goes. But not today.\n",
      AI_TELLS_PASS,
    );

    expect(matches.map((match) => match.quote)).toEqual(["Many of us", "Most operators", "And", "But"]);
    expect(matches[2].issue).toBe('AI tell opener: "And"');
  });

  it("does not flag a conjunction or a category word inside a sentence", () => {
    expect(
      ruleMatches("Cats and dogs, however friendly, are a handful.\n", AI_TELLS_PASS),
    ).toEqual([]);
  });

  it("takes the AI tells from the editable word list", () => {
    const matches = ruleMatches(
      "This is bespoke.\n",
      passWith({ aiTells: ["bespoke"] }),
    );

    expect(matches.map((match) => match.quote)).toEqual(["bespoke"]);
    expect(ruleMatches("This is bespoke.\n", AI_TELLS_PASS)).toEqual([]);
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
