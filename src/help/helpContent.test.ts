import { describe, expect, it } from "vitest";
import railSource from "../editor/WorkingOrderRail.tsx?raw";
import { ruleMatches } from "../core/rulePass";
import { BANNED_WORDS_PASS, WORN_PHRASES_PASS } from "../core/starterPasses";
import { QUEUE_SHORTCUTS, queueShortcutKeys } from "../editor/queueKeys";
import {
  FIRST_RUN_NOTE,
  HELP_GLOSSARY,
  HELP_LOOP,
  HELP_SECTION_IDS,
  HELP_SECTIONS,
  HELP_SHORTCUTS,
  PANEL_GLOSSES,
  QUEUE_HINT,
  RULE_ONE,
  RULE_TWO,
  SCRATCHPAD_EMPTY_STATE,
  SHORTCUTS_KEY,
  helpProse,
  helpShortcutKeys,
} from "./helpContent";

/**
 * How this works is a requirement, not copy. These assertions read the page's
 * content as data, with no DOM, which this project has no test layer for, and
 * check the things the ticket names: Rule 1 and Rule 2 by their substance, the
 * three-step loop, the glossary, and a shortcut list that matches the keys the
 * app binds.
 */
const prose = helpProse().toLowerCase();

describe("the two rules", () => {
  it("states Rule 1 by its substance and what enforces it", () => {
    expect(RULE_ONE[0]?.toLowerCase()).toContain("may not use a single word a model suggests");
    expect(prose).toContain("model output is analysis, never prose");
    expect(prose).toContain("no field for rewritten prose");
    expect(prose).toContain("there is no control in obelus that puts model-written text");
    expect(prose).toContain("your keyboard is the only path by which words enter it");
  });

  it("states Rule 2 by its substance and what enforces it", () => {
    expect(RULE_TWO[0]?.toLowerCase()).toContain("no encouragement");
    expect(prose).toContain("scanned for praise");
    expect(prose).toContain("shown struck through rather than hidden");
    expect(prose).toContain("decline a finding");
    expect(prose).toContain("show the raw provider response");
  });

  it("gives both rules a home in one section", () => {
    const rules = HELP_SECTIONS.find((section) => section.id === HELP_SECTION_IDS.rules);
    expect(rules?.items?.map((item) => item.title)).toEqual(["Rule 1", "Rule 2"]);
  });
});

describe("the loop", () => {
  it("is the three steps of the method, in order", () => {
    expect(HELP_LOOP.map((step) => step.title)).toEqual([
      "A model finds flaws",
      "You rewrite",
      "A context-free Judge compares",
    ]);
  });

  it("says the Judge receives the two passages and nothing else, and can report Unstable", () => {
    expect(prose).toContain("labelled a and b, and nothing else");
    expect(prose).toContain("reported as unstable rather than as a preference");
  });
});

describe("the glossary", () => {
  it("defines the words the interface uses", () => {
    const terms = HELP_GLOSSARY.map((entry) => entry.term);
    for (const term of [
      "Pass",
      "Finding",
      "Current Finding",
      "Anchor",
      "Highlight",
      "Containment",
      "Screening frame",
      "Connection",
      "Slot",
      "Critic",
      "Judge",
      "Band",
      "Rail",
      "Revision",
      "Reader account",
      "Audit account",
      "Violation",
    ]) {
      expect(terms, term).toContain(term);
    }
    // The two rules are items in the section, not glossary terms, but the page states them.
    expect(prose).toContain("rule 1");
    expect(prose).toContain("rule 2");
  });

  it("gives every term a non-empty definition and no duplicates", () => {
    const terms = HELP_GLOSSARY.map((entry) => entry.term);
    expect(new Set(terms).size).toBe(terms.length);
    for (const entry of HELP_GLOSSARY) {
      expect(entry.term.trim(), entry.term).not.toBe("");
      expect(entry.definition.trim(), entry.term).not.toBe("");
    }
  });
});

describe("the shortcuts", () => {
  /**
   * `QUEUE_SHORTCUTS` in `queueKeys.ts` is the authority for the queue keys, and
   * `SHORTCUTS_KEY` the shell's app-wide one. A page that advertises a key the
   * app does not bind, or omits one it does, is a lie about the interface.
   */
  it("lists exactly the queue keys and the shell-wide ?", () => {
    const railKeys = QUEUE_SHORTCUTS.flatMap((shortcut) => queueShortcutKeys(shortcut));
    expect(helpShortcutKeys()).toEqual([...railKeys, SHORTCUTS_KEY]);
  });

  /**
   * The rail must dispatch only through the published table; an ad-hoc
   * `event.key === "…"` in the effect would never reach the page's list.
   */
  it("binds no key in the rail outside the published table", () => {
    expect(railSource).not.toMatch(/event\.key\s*===/);
  });

  it("describes every shortcut", () => {
    for (const shortcut of HELP_SHORTCUTS) {
      expect(shortcut.keys.length, JSON.stringify(shortcut)).toBeGreaterThan(0);
      expect(shortcut.description.trim(), JSON.stringify(shortcut)).not.toBe("");
    }
  });
});

describe("the hint bar", () => {
  it("states when the plain keys are live rather than advertising them unconditionally", () => {
    expect(QUEUE_HINT).toContain("not typing");
    expect(QUEUE_HINT.toLowerCase()).toContain("editor");
  });

  it("names the modifier shortcut that works anywhere", () => {
    expect(QUEUE_HINT).toContain("Alt");
    expect(QUEUE_HINT).toContain("anywhere");
  });

  it("names every plain shortcut the page lists", () => {
    for (const shortcut of HELP_SHORTCUTS.filter(
      (entry) => !entry.keys.includes("Alt"),
    )) {
      expect(QUEUE_HINT, shortcut.keys.join(" / ")).toContain(shortcut.keys.join(" / "));
    }
  });
});

describe("the first-run note", () => {
  it("says the rule passes have already run and where to look", () => {
    expect(FIRST_RUN_NOTE.heading.toLowerCase()).toContain("rule passes have already run");
    expect(FIRST_RUN_NOTE.body.join(" ").toLowerCase()).toContain("rail on the right");
  });

  it("points at How this works and is dismissible", () => {
    expect(FIRST_RUN_NOTE.helpLabel).toBe("How this works");
    expect(FIRST_RUN_NOTE.dismissLabel.trim()).not.toBe("");
  });
});

describe("the empty Scratchpad", () => {
  it("says what to do rather than leaving an empty box", () => {
    expect(SCRATCHPAD_EMPTY_STATE.heading.toLowerCase()).toContain("scratchpad");
    expect(SCRATCHPAD_EMPTY_STATE.body.join(" ").toLowerCase()).toContain("start writing here");
    expect(SCRATCHPAD_EMPTY_STATE.libraryLabel).toBe("Open the Library");
  });
});

describe("section anchors", () => {
  it("are the stable ids a panel can link to", () => {
    expect(HELP_SECTIONS.map((section) => section.id)).toEqual([
      "rules",
      "loop",
      "glossary",
      "shortcuts",
    ]);
  });
});

/**
 * The voice, held to the same standard as the privacy page. The page talks to
 * the reader as "you"; it is not the app's first-person plural and it is not a
 * third-person report about "the Writer". It never praises the reader's prose,
 * because it has not read any.
 */
describe("voice", () => {
  it("addresses the reader as you", () => {
    expect(prose).toMatch(/\byou\b/);
    expect(prose).toMatch(/\byour\b/);
  });

  it("carries no first-person pronoun", () => {
    for (const pronoun of ["i", "we", "our", "ours", "us"]) {
      expect(prose, `first person "${pronoun}"`).not.toMatch(new RegExp(`\\b${pronoun}\\b`));
    }
  });

  it("does not call the reader the Writer", () => {
    expect(prose).not.toContain("the writer");
  });

  it("keeps the Starter pack's banned words and worn phrases off the page", () => {
    expect(ruleMatches(helpProse(), BANNED_WORDS_PASS)).toEqual([]);
    expect(ruleMatches(helpProse(), WORN_PHRASES_PASS)).toEqual([]);
  });

  it("uses no em dash", () => {
    expect(helpProse()).not.toContain("—");
  });
});

describe("panel glosses", () => {
  it("resolves every gloss link to a section id that exists", () => {
    const validSectionIds = new Set(HELP_SECTIONS.map((section) => section.id));
    for (const [panel, gloss] of Object.entries(PANEL_GLOSSES)) {
      expect(validSectionIds.has(gloss.sectionId), `${panel} targets valid section`).toBe(true);
    }
  });

  it("covers every panel required by ticket #41", () => {
    const expectedPanels = [
      "band",
      "allFindings",
      "judge",
      "revisions",
      "metrics",
      "outline",
      "rulePasses",
      "connections",
      "slots",
      "runSettings",
      "workbench",
      "library",
      "backup",
    ];
    for (const panel of expectedPanels) {
      expect(panel in PANEL_GLOSSES, `missing gloss for ${panel}`).toBe(true);
    }
  });

  it("uses ordinary case without capitalized domain terms mid-sentence", () => {
    // UI sentences use ordinary case; glossary terms mid-sentence should not be capitalized contracts.
    const domainTerms = [
      "Document",
      "Documents",
      "Pass",
      "Passes",
      "Finding",
      "Findings",
      "Revision",
      "Revisions",
      "Section",
      "Sections",
      "Anchor",
      "Anchors",
      "Slot",
      "Slots",
      "Connection",
      "Connections",
    ];
    for (const [panel, gloss] of Object.entries(PANEL_GLOSSES)) {
      for (const term of domainTerms) {
        // Must not appear after a lowercase letter, number, or punctuation mid-sentence
        const midSentenceRegex = new RegExp(`[a-zA-Z0-9,;:]\\s+${term}\\b`);
        expect(
          gloss.text,
          `${panel} gloss should not contain capitalized mid-sentence contract: ${term}`,
        ).not.toMatch(midSentenceRegex);
      }
    }
  });

  it("says in the metrics gloss that a number and a period opening a paragraph is one sentence", () => {
    // Issue #51: the segmentation cannot tell "1984. The year" from an escaped
    // list marker, and the Writer chose to state that where the metrics are.
    const text = PANEL_GLOSSES.metrics.text;
    expect(text).toMatch(/paragraph that opens with a number and a period/);
    expect(text).toContain("1984.");
    expect(text).toMatch(/counted as one sentence/);
  });

  it("never praises the prose or characterises skill", () => {
    const praiseWords = ["great", "good", "well done", "excellent", "impressive", "better writer", "improve your skill"];
    for (const [panel, gloss] of Object.entries(PANEL_GLOSSES)) {
      const lower = gloss.text.toLowerCase();
      for (const word of praiseWords) {
        expect(lower, `${panel} should not contain praise "${word}"`).not.toContain(word);
      }
    }
  });
});
