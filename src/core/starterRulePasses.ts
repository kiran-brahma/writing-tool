import type { Pass } from "./pass";

/**
 * The rule Passes that ship with Obelus. Each carries one `RuleConfig` field,
 * and that field is the whole rule: the engine runs the rules a pass configures,
 * so adding a pass here is adding data, not code. The Starter pack is the
 * read-only default; the Writer edits these lists and patterns in the app, and
 * the edits are persisted, so #10's restore action has a known-good pack to
 * restore to.
 *
 * ADR-0003 makes the mechanical tier free and offline, and the Writer's
 * overused words are the Writer's to name.
 */
export const HEDGES_PASS: Pass = {
  id: "hedges",
  name: "Hedges and intensifiers",
  description: "Flags words that soften a claim instead of making it.",
  kind: "rule",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: true,
  ruleConfig: {
    hedges: [
      "very",
      "really",
      "actually",
      "quite",
      "rather",
      "somewhat",
      "basically",
      "literally",
      "simply",
      "just",
      "of course",
      "unfortunately",
      "arguably",
      "I think",
    ],
  },
};

export const NOMINALIZATIONS_PASS: Pass = {
  id: "nominalizations",
  name: "Nominalizations",
  description: "Flags actions buried inside nouns.",
  kind: "rule",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: true,
  ruleConfig: {
    nominalizationSuffixes: [
      "tion",
      "sion",
      "ment",
      "ance",
      "ence",
      "ency",
      "ancy",
      "ity",
      "ness",
    ],
  },
};

export const OPENERS_PASS: Pass = {
  id: "openers",
  name: "Expletive and throat-clearing openers",
  description: "Flags sentences that clear their throat before they start.",
  kind: "rule",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: true,
  ruleConfig: {
    openers: [
      "there is",
      "there are",
      "there was",
      "there were",
      "it is",
      "it was",
      "it is worth noting",
      "it's worth noting",
      "as i mentioned",
      "as a matter of fact",
      "needless to say",
      "to be honest",
      "in my opinion",
    ],
  },
};

export const WORDINESS_PASS: Pass = {
  id: "wordiness",
  name: "Wordy constructions",
  description: "Flags phrases with a shorter equivalent.",
  kind: "rule",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: true,
  ruleConfig: {
    wordiness: [
      // Constructions the starter pack has always carried.
      ["in order to", "to"],
      ["due to the fact that", "because"],
      ["at this point in time", "now"],
      ["in the event that", "if"],
      ["for the purpose of", "to"],
      ["with regard to", "about"],
      ["a large number of", "many"],
      ["in spite of the fact that", "although"],
      ["the fact that", "that"],
      ["in the near future", "soon"],
      // The Economist guide's Reduction List: a long phrase and the short one it
      // replaces. The replacement is the Writer's own config data, never model
      // output, and it appears in the diagnosis only (DESIGN §4).
      ["absolute certainty", "certainty"],
      ["pilotless drone", "drone"],
      ["razed to the ground", "razed"],
      ["track record", "record"],
      ["wilderness area", "wilderness"],
      ["policymaking process", "policymaking"],
      ["large-scale", "large"],
      ["weather conditions", "weather"],
      ["bought up", "bought"],
      ["sold off", "sold"],
      ["headed up by", "headed by"],
      ["cut back", "cut"],
      ["cutbacks", "cuts"],
      ["end result", "result"],
      ["for free", "free"],
      ["from whence", "whence"],
      ["final outcome", "outcome"],
      ["nod your head", "nod"],
      ["shrug your shoulders", "shrug"],
      ["top priority", "priority"],
      ["major speech", "a speech"],
      ["role model", "model"],
      ["past experience", "experience"],
      ["lived experience", "experience"],
      ["personal experience", "experience"],
      ["empirical research", "research"],
      ["safe haven", "haven"],
      ["located in", "in"],
      ["pre-prepared", "prepared"],
      ["pre-planned", "planned"],
      ["in close proximity to", "close to"],
      // The guide's "prefer an Anglo-Saxon word" list, kept to the substitutions
      // that do not need a part-of-speech judgment to apply.
      ["purchase", "buy"],
      ["approximately", "about"],
      ["sufficient", "enough"],
      ["donate", "give"],
      ["obtain", "get"],
      ["establish", "set up"],
      ["demonstrate", "show"],
      ["expenditure", "spending"],
      ["relinquish", "give up"],
      ["violate", "break"],
      ["distribute", "hand out"],
      ["wealthy", "rich"],
      ["persons", "people"],
      ["workforce", "workers"],
      ["compensation", "pay"],
      ["revenue", "sales"],
      ["mortality", "death"],
      ["redundancies", "lay-offs"],
      ["kinetic action", "battle"],
      ["demonstrates an unwillingness to", "refuses to"],
      ["manifests avoidance behaviour", "avoids"],
    ],
  },
};

export const REPETITION_PASS: Pass = {
  id: "repetition",
  name: "Repeated words and openers",
  description: "Flags words and sentence openings that keep coming back.",
  kind: "rule",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: true,
  ruleConfig: {
    repetitionWindow: 3,
  },
};

/**
 * The auxiliaries a passive construction is built on. Shared by the first-class
 * `passive` pass and George Orwell's rule 4, so the two cannot disagree about
 * what a passive is.
 */
const PASSIVE_AUXILIARIES: string[] = ["am", "is", "are", "was", "were", "be", "been", "being"];

/**
 * Stories 137–138: passive voice, first-class rather than hidden inside the
 * off-by-default Orwell pass. It ships enabled and reports at note severity: the
 * diagnosis states the Williams exception — a passive is right when the agent is
 * unknown or irrelevant and the patient is the topic — rather than trying to
 * detect that condition, which regex cannot do. The auxiliary list is editable
 * Rule config, and the rule reports; the Writer decides.
 */
export const PASSIVE_PASS: Pass = {
  id: "passive",
  name: "Passive voice",
  description: "Flags passive constructions as a note, with the Williams exception stated.",
  kind: "rule",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: true,
  ruleConfig: {
    passiveVoiceAuxiliaries: PASSIVE_AUXILIARIES,
  },
};

/**
 * Story 139: the lexical AI tells from `Prose Linter.md`'s A1–A14 table — the
 * subset a regex can name with confidence. A1 manufactured significance, A2
 * vague authority, A5 false depth, A6 generic ending, A7 chatbot residue, A10
 * crowd openers, A11 category labels where a specific belongs, and A13
 * conjunctions doing a full stop's work. It ships enabled so the cheapest tells
 * are caught on every save, and its lists are editable Rule config. The
 * argumentative tells A8, A9, A12 and A14 and the H1–H5 honesty checks belong to
 * the Audit (#27), and A3 and A4 are a metric and a fold into an existing pass,
 * never a pass here.
 */
export const AI_TELLS_PASS: Pass = {
  id: "ai-tells",
  name: "AI tells",
  description: "Flags the lexical AI tells readers recognise as machine-written.",
  kind: "rule",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: true,
  ruleConfig: {
    aiTells: [
      // A1 manufactured significance.
      "pivotal",
      "broader shift",
      "testament",
      "landscape",
      // A2 vague authority.
      "experts say",
      "industry reports",
      "best practices",
      // A5 false depth.
      "at its core",
      "the real question is",
      // A6 generic ending.
      "the future looks bright",
      "time will tell",
      // A7 chatbot residue.
      "great question",
      "hope this helps",
      "let me know",
      // A11 a category label standing where a specific person, moment or number
      // belongs. A rule cannot tell a useful general claim from a vague one, so
      // it reports and the Writer decides; the list is the Writer's to edit.
      "many people",
      "most people",
      "society",
      "everyone",
      "everybody",
      "entrepreneurs",
      "founders",
      "leaders",
      "creators",
    ],
    aiTellOpeners: [
      // A10 a sentence opening with a crowd.
      "many of us",
      "most operators",
      // A13 a conjunction used as a joiner where a full stop works.
      "and",
      "but",
      "so",
      "however",
    ],
  },
};

/**
 * The house avoid list: the Prose Linter's deduplicated banned-words list and
 * the Economist guide's jargon. It is the list the Writer edits, not a
 * judgment a rule cannot make; anything whose meaning depends on the part of
 * speech (the guide's "address" as a transitive verb, "key" as an adjective)
 * is left out, because a literal sweep would flag the innocent use too. The
 * Prose Linter's own "Still mine to decide" note concedes that ensure, obtain,
 * demonstrate, regarding, additionally, drive and solutions are ordinary words
 * whose zero-tolerance flagging invites circumlocution, so they are left off a
 * pass that runs on every save; the Writer may add them back. "Obtain" and
 * "demonstrate" are also paired with a shorter word by the wordiness pass. The
 * diagnosis reports and never supplies a replacement, so the pass is
 * constitution-safe by construction (ADR-0003). "Leverage" and "platform"
 * stay on the list; a sense the source carves out (financial leverage, a named
 * product) is a judgment for the Writer to decline, not for a regex to make.
 *
 * `landscape` and `testament` are absent because they are A1 AI tells now owned
 * by the `ai-tells` pass; leaving them here as well would report one span twice.
 */
export const BANNED_WORDS_PASS: Pass = {
  id: "banned-words",
  name: "Banned words and jargon",
  description: "Flags words on the house avoid list.",
  kind: "rule",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: true,
  ruleConfig: {
    bannedWords: [
      // Prose Linter W1, deduplicated there, minus the ordinary words its own
      // "Still mine to decide" note pulls back from.
      "align",
      "catalyst",
      "crushing it",
      "deep dive",
      "delve",
      "democratize",
      "disruptive",
      "ecosystem",
      "elevate",
      "empower",
      "facilitate",
      "flywheel",
      "foster",
      "furthermore",
      "game-changer",
      "garner",
      "guru",
      "growth hack",
      "harness",
      "human capital",
      "hustle",
      "innovative",
      "journey",
      "leverage",
      "moreover",
      "ninja",
      "north star",
      "optimize",
      "paradigm",
      "platform",
      "prior to",
      "realm",
      "reimagine",
      "robust",
      "rockstar",
      "scalable",
      "seamless",
      "strategic",
      "streamline",
      "subsequent to",
      "synergy",
      "tapestry",
      "10x",
      "unlock",
      "unleash",
      "unparalleled",
      "utilize",
      "world-class",
      // The Economist guide's "Words to Avoid", minus the parts of speech a
      // literal sweep cannot tell apart. "Obtain" and "demonstrate" are absent
      // because the wordiness pass already pairs them with a shorter word.
      "aspirational",
      "famously",
      "high-profile",
      "iconic",
      "implode",
      "participate in",
      "passionate",
      "proactive",
      "prestigious",
      "reputational",
      "savvy",
      "segue",
      "stakeholders",
      "supportive",
      "surreal",
      "trajectory",
      "transformative",
    ],
  },
};

/**
 * Worn phrases: the guide's replace list, its jargon metaphors, and the Prose
 * Linter's banned openers and analytical phrases. Like the banned-word pass it
 * marks and does not rewrite, and it is shipped enabled because a cliché is the
 * one thing a rule can name with as much confidence as a model can.
 *
 * `time will tell` (A6) and `best practices suggest` (A2) are absent because
 * the `ai-tells` pass owns those tells; keeping both would report one span twice.
 */
export const WORN_PHRASES_PASS: Pass = {
  id: "worn-phrases",
  name: "Worn phrases and clichés",
  description: "Flags clichés and jargon metaphors.",
  kind: "rule",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: true,
  ruleConfig: {
    wornPhrases: [
      // The guide's "Replace" list.
      "accident waiting to happen",
      "chattering classes",
      "deer in the headlights",
      "eye-watering sums",
      "fit for purpose",
      "going forward",
      "the green light",
      "grinding to a halt",
      "heavy lifting",
      "honeymoon period",
      "level playing-field",
      "perfect storm",
      "poster child",
      "pulling teeth",
      "rack up",
      "ramping up",
      "tipping point",
      "too close to call",
      "wake-up call",
      "whopping bills",
      "quantum leap",
      "begging the question",
      "exponential growth",
      "inflection point",
      // The guide's jargon metaphors.
      "blue-sky thinking",
      "thinking out of the box",
      "at the end of the day",
      "elephant in the room",
      "800-pound gorilla",
      "big beast",
      "low-hanging fruit",
      "quick wins",
      "take this offline",
      "put a pin in it",
      "circle back",
      "reach out",
      "limited bandwidth",
      "joining the dots",
      "walking the walk",
      "from soup to nuts",
      "suck it and see",
      "let a thousand flowers bloom",
      "strategic shoots",
      "early innings",
      "sea change",
      "flesh wound",
      "constantly evolving palates",
      "bubbling under the radar",
      "hit some turbulence",
      // Prose Linter W2 and W3: banned openers and analytical phrases.
      "in a world where",
      "in today's fast-paced",
      "it remains to be seen",
      "there are many factors",
      "industry benchmarks indicate",
      "experts believe",
    ],
  },
};

/**
 * Orwell rule 2: long words to flag where a short one may do. The list is the
 * Writer's; the diagnosis never supplies the short one.
 */
const ORWELL_LONG_WORDS: string[] = [
  "utilize",
  "utilise",
  "commence",
  "commencement",
  "terminate",
  "endeavour",
  "endeavor",
  "facilitate",
  "approximately",
  "sufficient",
  "demonstrate",
  "manufacture",
  "expenditure",
  "relinquish",
  "compensation",
  "redundancies",
  "assistance",
  "necessitate",
  "subsequently",
  "previously",
  "additionally",
  "consequently",
  "nevertheless",
  "notwithstanding",
  "aforementioned",
  "ascertain",
  "magnitude",
  "proximity",
  "utilization",
  "individuals",
];

/** Orwell rule 3: words and phrases that add length but no meaning. */
const ORWELL_CUTTABLE_WORDS: string[] = [
  "very",
  "really",
  "quite",
  "rather",
  "actually",
  "basically",
  "literally",
  "simply",
  "just",
  "somewhat",
  "sort of",
  "kind of",
  "in fact",
  "of course",
  "to be honest",
  "I think",
  "in my opinion",
  "needless to say",
  "as a matter of fact",
  "at the end of the day",
  "it is worth noting",
  "it should be noted",
];

/**
 * George Orwell's five rules, from "Politics and the English Language". A rule
 * cannot judge a metaphor, but it can mark the printed figures, long words,
 * cuttable words, passive constructions and jargon the rules name — and it
 * reports each failure without supplying the replacement, which is the rules'
 * own demand.
 *
 * Shipped disabled and exclusive: turning it on runs it alone, holding the other
 * rule Passes so its report is not buried under the Passes it overlaps. Turn it
 * off and they return exactly as the Writer left them.
 *
 * The lists for rules 1 and 5 are the same lists the worn-phrase and banned-word
 * passes carry, shared by reference so the two can never drift apart.
 */
export const ORWELL_RULES_PASS: Pass = {
  id: "orwell",
  name: "George Orwell's rules",
  description:
    "Flags the five rules in \"Politics and the English Language\", and names what fails without saying what to write. Runs on its own.",
  kind: "rule",
  scope: "document",
  output: "findings",
  slot: "critic",
  enabled: false,
  exclusive: true,
  ruleConfig: {
    printedFigures: WORN_PHRASES_PASS.ruleConfig?.wornPhrases ?? [],
    longWords: ORWELL_LONG_WORDS,
    cuttableWords: ORWELL_CUTTABLE_WORDS,
    passiveAuxiliaries: PASSIVE_AUXILIARIES,
    jargonWords: BANNED_WORDS_PASS.ruleConfig?.bannedWords ?? [],
  },
};

