/**
 * How this works, as data. The page is a requirement, not copy: it carries Rule
 * 1 and Rule 2 in full, the three-step loop, a glossary of the words the
 * interface uses and the keys the app binds, so the method has a permanent home
 * inside the product rather than living only in the repository.
 *
 * Keeping the content out of the JSX lets `helpContent.test.ts` assert it by
 * substance with no DOM, which this project has no test layer for. The voice is
 * part of the requirement: the page talks to the reader as "you", carries no
 * first-person plural and writes "the Writer" only as a term the Glossary
 * defines, never as a way of addressing the reader. The rule-pack banned words
 * and worn phrases stay off it, and the page never praises the reader's prose,
 * because it has not read any.
 */

/** One entry in a section: a title and its body. */
export interface HelpItem {
  readonly title: string;
  readonly body: readonly string[];
}

/** One section of the page. `id` is the anchor a later panel can link to. */
export interface HelpSection {
  readonly id: string;
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly items?: readonly HelpItem[];
}

/** A term the interface uses, with its plain-language definition. */
export interface GlossaryEntry {
  readonly term: string;
  readonly definition: string;
}

/** A key the app binds, and what it does. */
export interface HelpShortcut {
  /** Every key that triggers the action, as the Writer would press it. */
  readonly keys: readonly string[];
  readonly description: string;
}

/** The section anchors, so the page's headings have stable ids. */
export const HELP_SECTION_IDS = {
  rules: "rules",
  loop: "loop",
  glossary: "glossary",
  shortcuts: "shortcuts",
} as const;

/** Every anchor How this works can open at. */
export type HelpSectionId = (typeof HELP_SECTION_IDS)[keyof typeof HELP_SECTION_IDS];

/** Story 178: the shell-wide key that opens the shortcut list. */
export const SHORTCUTS_KEY = "?";

/**
 * Rule 1, in full. The first line is the rule; the rest is what enforces it. It
 * names the structural guarantee rather than an affordance, and it never
 * suggests that a prompt is what keeps the rule.
 */
export const RULE_ONE: readonly string[] = [
  "You may not use a single word a model suggests.",
  "Model output is analysis, never prose. A model run returns Findings, each anchored to a quote from your Document, and the shape it replies in has no field for rewritten prose.",
  "There is no control in Obelus that puts model-written text into your Document. Your keyboard is the only path by which words enter it.",
  "A quarantined rewrite is shown so you can see what the model produced, and it cannot enter the Document either: no control offers it.",
  "The constraint is structural, not a matter of prompt wording: the reply shape cannot carry a rewrite, so a prompt cannot talk its way around it.",
];

/**
 * Rule 2, in full. The first line is the rule; the rest is what enforces it.
 * Praise is visible and struck through, never stripped silently.
 */
export const RULE_TWO: readonly string[] = [
  "No encouragement.",
  "Every string a model returns is scanned for praise and for rewrite-shaped content. Praise is shown struck through rather than hidden, so you can see when a prompt has drifted.",
  "You can decline a Finding, recording whether you rejected the advice or the model breached the constitution, and you can show the raw provider response whenever you want to check the linter yourself.",
  "A Verdict from the Judge compares two passages; it is not a score for your prose. A Finding is a problem to weigh, not a compliment to keep.",
];

/** The three steps of the method, in the order the Writer works them. */
export const HELP_LOOP: readonly HelpItem[] = [
  {
    title: "A model finds flaws",
    body: [
      "You run a Pass against the Document, or against part of it. The model returns Findings, each anchored to the text it concerns. Rule passes do this with no Connection and no key; model passes reach the Connection you configured.",
    ],
  },
  {
    title: "You rewrite",
    body: [
      "You edit in your own words. Nothing the model wrote can be put into the Document, and nothing in the interface offers to do it for you.",
    ],
  },
  {
    title: "A context-free Judge compares",
    body: [
      "When a passage has changed, the Judge receives the old version and the new one, labelled A and B, and nothing else. It runs twice with the labels swapped, and a flip is reported as Unstable rather than as a preference.",
    ],
  },
];

/**
 * The glossary: the words the interface uses. It follows CONTEXT.md, which
 * governs code, tests, issues and commits; here the definitions are in the
 * reader's language, so a capitalised term mid-sentence does not read as a
 * contract.
 */
export const HELP_GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: "Writer",
    definition: "You: the person writing here, and the author of everything in this Library.",
  },
  {
    term: "Document",
    definition: "One piece of writing. The only noun for a piece of work.",
  },
  {
    term: "Section",
    definition: "A heading-delimited division of a Document.",
  },
  {
    term: "Paragraph",
    definition: "A block of prose within a Section, and the unit a local Pass examines.",
  },
  {
    term: "Revision",
    definition:
      "One saved point in a Document's history. An auto-revision is taken on a debounce; a flagged revision is a milestone you mark, and it can carry a note.",
  },
  {
    term: "Library",
    definition: "Every Document held in this browser.",
  },
  {
    term: "Backup",
    definition:
      "One file holding the whole Library, so an eviction is survivable. It leaves API keys out unless you opt in.",
  },
  {
    term: "Restore",
    definition: "Replacing this browser's Library with a Backup, behind a confirmation.",
  },
  {
    term: "Bundle",
    definition:
      "One Document as a single file, carrying its Revisions, Findings, run results and accounts.",
  },
  {
    term: "Pass",
    definition: "A configured analysis of a Document, with a scope and an output shape.",
  },
  {
    term: "Rule pass",
    definition:
      "A Pass implemented as deterministic rules over text, so it can neither praise nor rewrite. It costs nothing and needs no Connection.",
  },
  {
    term: "Model pass",
    definition:
      "A Pass implemented as a call to a model. It returns Findings or an account, anchored to the text it concerns.",
  },
  {
    term: "Run",
    definition: "One execution of a Pass against a Revision, producing Findings.",
  },
  {
    term: "Finding",
    definition:
      "One problem a run reports about the prose, anchored to the text it concerns.",
  },
  {
    term: "Current Finding",
    definition:
      "The one open Finding the queue's selection is on. Its Highlight is distinguished, and the Editor scrolls to it.",
  },
  {
    term: "Anchor",
    definition: "The data tying a Finding to its text: the quoted span, with an offset as a hint.",
  },
  {
    term: "Highlight",
    definition:
      "The visual rendering of an Anchor. The Current Finding's Highlight is distinguished from the rest.",
  },
  {
    term: "Target",
    definition: "The text a run is asked about.",
  },
  {
    term: "Containment",
    definition:
      "The rule that a Finding anchored outside the Target is discarded, with the count reported.",
  },
  {
    term: "Voice list",
    definition: "The words and phrases you have declared as yours. No Pass may flag one as a problem.",
  },
  {
    term: "Working order",
    definition:
      "The recommended sequence for the Passes: structure, then paragraph, then word. A recommendation, never a gate.",
  },
  {
    term: "Band",
    definition:
      "One of the three divisions of the Working order: Structure, Paragraph and Word. You move the rail by Band, and every Band is one click from every other.",
  },
  {
    term: "Rail",
    definition:
      "The surface where you move by Band, run Passes, work the queue, and reach the Judge, milestones and Revisions.",
  },
  {
    term: "Screening frame",
    definition:
      "The Critic's standing instruction to read the piece as an editor screening a submission. It applies to the Critic only.",
  },
  {
    term: "Connection",
    definition:
      "A configured route to a model provider: a Protocol, a base URL, a key and a concurrency cap.",
  },
  {
    term: "Slot",
    definition:
      "A named place a Connection and a model are assigned. There are two: critic and judge.",
  },
  {
    term: "Critic",
    definition: "The Slot that runs model passes and finds problems.",
  },
  {
    term: "Judge",
    definition:
      "The Slot that compares two versions of a passage and answers which is clearer, receiving the two passages and nothing else.",
  },
  {
    term: "Verdict",
    definition:
      "The Judge's answer: which passage is clearer, how confident it is, and its reasons with quoted evidence.",
  },
  {
    term: "Unstable",
    definition:
      "The condition of a Verdict that changes when the passage labels are swapped. It is reported as unstable rather than as a preference.",
  },
  {
    term: "Reader pass",
    definition: "The model pass that reconstructs what a reader takes away from a Section.",
  },
  {
    term: "Reader account",
    definition:
      "A Reader pass's output: what a Section says, what a distracted reader would miss, and the gap between the two.",
  },
  {
    term: "Audit pass",
    definition: "The model pass that examines whether a piece's reasoning holds up.",
  },
  {
    term: "Audit account",
    definition:
      "An Audit pass's output: the argument map, any fallacies or definition gaps, and the Findings that matter most.",
  },
  {
    term: "Violation",
    definition:
      "Praise or rewrite-shaped content caught in model output. It is about the model misbehaving, never about your prose.",
  },
  {
    term: "Praise",
    definition:
      "Encouragement in model output. Rule 2 forbids it, and the linter is the check for it.",
  },
  {
    term: "Quarantined rewrite",
    definition: "Model-written prose that is displayed but can never enter a Document.",
  },
  {
    term: "Lard Factor",
    definition:
      "The share of an earlier Revision's words that a later Revision removes. A signal, not a verdict: it gates nothing.",
  },
  {
    term: "Prediction",
    definition:
      "Your own call, recorded before a Judge run, of which passage is clearer. It stays in this session, is never sent to a model, and gates nothing.",
  },
];

/**
 * The keys the app binds for the queue, as data. It must match what the app
 * actually binds; `queueKeys.ts` is the authority, and `helpContent.test.ts`
 * compares the two, so adding or removing a binding without moving this list
 * fails the build.
 */
export const HELP_SHORTCUTS: readonly HelpShortcut[] = [
  { keys: ["j"], description: "Move to the next open Finding in the queue." },
  { keys: ["k"], description: "Move to the previous open Finding." },
  { keys: ["a"], description: "Mark the Current Finding addressed." },
  { keys: ["x"], description: "Decline the Current Finding." },
  {
    keys: ["v"],
    description: "Decline the Current Finding as a violation, when it carries one.",
  },
  {
    keys: ["Alt", "↓"],
    description: "Move to the next open Finding even while the cursor is in the prose.",
  },
  {
    keys: ["Alt", "↑"],
    description: "Move to the previous open Finding even while the cursor is in the prose.",
  },
  { keys: [SHORTCUTS_KEY], description: "Open these shortcuts." },
];

/**
 * Story 177: the rail's hint bar. It states the condition under which the plain
 * keys are live and names the modifier shortcut that works anywhere, rather than
 * advertising `j`/`k`/`a`/`x`/`v` unconditionally into the prose.
 */
export const QUEUE_HINT =
  "j / k move · a address · x decline · v decline as a violation · ? shows every shortcut. These work when you are not typing, because in the Editor they belong to the prose. Alt + ↓ / Alt + ↑ step the queue from anywhere.";

/**
 * Story 168: the first-run note in the Editor body. It is not a modal; it sits
 * in the writing surface, says the rule passes have already run, points at the
 * rail and links to How this works. `helpLabel` is the link and `dismissLabel`
 * the control that stores the dismissal.
 */
export const FIRST_RUN_NOTE = {
  heading: "The rule passes have already run",
  body: [
    "Their Findings are in the rail on the right, under Word and Paragraph.",
    "Nothing leaves your browser until you run a model pass through a Connection you configured.",
  ],
  helpLabel: "How this works",
  dismissLabel: "Dismiss",
} as const;

/**
 * Story 170: what an empty Scratchpad says instead of showing an empty box.
 * `libraryLabel` opens the Library, where the Writer can begin their own
 * Document.
 */
export const SCRATCHPAD_EMPTY_STATE = {
  heading: "This is your Scratchpad",
  body: [
    "Start writing here, or open the Library to begin a Document of your own.",
    "The rule passes mark problems as you save, and they need no Connection and no key.",
  ],
  libraryLabel: "Open the Library",
} as const;

/**
 * A plain-language gloss explaining a panel's own nouns once, with a link
 * target in How this works.
 */
export interface PanelGloss {
  readonly text: string;
  readonly sectionId: HelpSectionId;
}

/**
 * Story 183–184: the plain-language glosses for every panel. Each panel
 * explains its own nouns once in plain language, using ordinary case, and
 * links to a section in How this works.
 */
export const PANEL_GLOSSES = {
  band: {
    text: "A band groups passes by scope: structure, paragraph, or word. Each pass looks for problems in your text without rewriting it.",
    sectionId: HELP_SECTION_IDS.glossary,
  },
  allFindings: {
    text: "All findings from your passes, anchored to your prose. Step through each problem or decline advice you disagree with.",
    sectionId: HELP_SECTION_IDS.glossary,
  },
  judge: {
    text: "The judge compares two revisions of a passage blind to see which is clearer, receiving the two texts and nothing else.",
    sectionId: HELP_SECTION_IDS.glossary,
  },
  revisions: {
    text: "Revisions are saved points in your document history; a milestone is a revision you flag with a note.",
    sectionId: HELP_SECTION_IDS.glossary,
  },
  metrics: {
    text: "Measurements of rhythm and sentence structure across your document. A metric is a diagnostic signal, never a score.",
    sectionId: HELP_SECTION_IDS.glossary,
  },
  outline: {
    text: "The structure of your document, drawn from its headings. Click any section to jump your cursor to it.",
    sectionId: HELP_SECTION_IDS.glossary,
  },
  rulePasses: {
    text: "Rule passes check for mechanical habits using deterministic rules in your browser, without an AI model.",
    sectionId: HELP_SECTION_IDS.glossary,
  },
  connections: {
    text: "A connection is a route to an AI provider. Your keys stay in this browser, sent only to the provider you configure.",
    sectionId: HELP_SECTION_IDS.glossary,
  },
  slots: {
    text: "Slots assign connections and models to roles: the critic finds flaws, and the judge compares revisions.",
    sectionId: HELP_SECTION_IDS.glossary,
  },
  runSettings: {
    text: "Run settings govern model calls: the screening frame sets editorial stance, and the voice list protects your phrasing.",
    sectionId: HELP_SECTION_IDS.glossary,
  },
  workbench: {
    text: "A pass is an editorial instruction with a scope and an output shape. The workbench is where you create and edit passes.",
    sectionId: HELP_SECTION_IDS.glossary,
  },
  library: {
    text: "The library holds all documents saved in this browser. Everything stays local until you export or back up.",
    sectionId: HELP_SECTION_IDS.glossary,
  },
  backup: {
    text: "A backup saves your whole library to one file; a bundle exports a single document with its revisions and findings.",
    sectionId: HELP_SECTION_IDS.glossary,
  },
} as const satisfies Record<string, PanelGloss>;

/** Every section of the page, in reading order. */
export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    id: HELP_SECTION_IDS.rules,
    heading: "The two rules",
    paragraphs: [
      "Rule 1 and Rule 2 are the reason Obelus exists. Everything else in the tool follows from them.",
    ],
    items: [
      { title: "Rule 1", body: RULE_ONE },
      { title: "Rule 2", body: RULE_TWO },
    ],
  },
  {
    id: HELP_SECTION_IDS.loop,
    heading: "The loop",
    paragraphs: ["The method has three steps, and they all happen here."],
    items: HELP_LOOP,
  },
  {
    id: HELP_SECTION_IDS.glossary,
    heading: "Glossary",
    paragraphs: ["The words the interface uses, in plain language."],
    items: HELP_GLOSSARY.map((entry) => ({ title: entry.term, body: [entry.definition] })),
  },
  {
    id: HELP_SECTION_IDS.shortcuts,
    heading: "Shortcuts",
    paragraphs: [
      "The plain queue keys are live when you are not typing. While the Editor or a field has focus they stand down, because j, k, a, x and v are ordinary letters that must reach the prose. The Alt shortcut works anywhere, including the prose.",
    ],
    items: HELP_SHORTCUTS.map((shortcut) => ({
      title: shortcut.keys.join(" / "),
      body: [shortcut.description],
    })),
  },
];

/** Every key the page lists, flattened, so a test can compare the whole set. */
export function helpShortcutKeys(): readonly string[] {
  return HELP_SHORTCUTS.flatMap((shortcut) => shortcut.keys);
}

/**
 * Every string the page carries — section headings and paragraphs, item titles
 * and bodies, the first-run note and the Scratchpad empty state — flattened so a
 * test can assert what it says and how it reads. The view's own chrome (the page
 * title) is not included.
 */
export function helpProse(): string {
  const sections = HELP_SECTIONS.flatMap((section) => [
    section.heading,
    ...section.paragraphs,
    ...(section.items ?? []).flatMap((item) => [item.title, ...item.body]),
  ]);
  const note = [
    FIRST_RUN_NOTE.heading,
    ...FIRST_RUN_NOTE.body,
    FIRST_RUN_NOTE.helpLabel,
    FIRST_RUN_NOTE.dismissLabel,
  ];
  const scratchpad = [
    SCRATCHPAD_EMPTY_STATE.heading,
    ...SCRATCHPAD_EMPTY_STATE.body,
    SCRATCHPAD_EMPTY_STATE.libraryLabel,
  ];
  const glosses = Object.values(PANEL_GLOSSES).map((gloss) => gloss.text);
  return [...sections, ...note, ...scratchpad, ...glosses].join("\n");
}
