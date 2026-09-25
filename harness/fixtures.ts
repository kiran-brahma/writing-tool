import type { BlockNode, DocTree } from "../src/core/docTree";
import type { Pass } from "../src/core/pass";
import {
  AUDIT_PASS,
  CLAIM_STRENGTH_PASS,
  CLICHE_PASS,
  CUT_CANDIDATES_PASS,
  PARAGRAPH_REORDER_PASS,
  READER_PASS,
  TOPIC_STRINGS_PASS,
} from "../src/core/starterPasses";
import type { Target } from "../src/core/critique";

/**
 * The harness fixtures. Three fixture Documents × three model Passes, run
 * through the real `critique` entry point with a fixture transport that returns
 * a deliberately misbehaving model response. The response is adversarial on
 * purpose: a compliant model proves nothing, and the constitution exists for
 * the moments the model ignores it.
 *
 * The Passes are real Starter passes, not fixtures: #19 shipped the paragraph-
 * scope pack this harness was built around, so an edit to a real prompt is
 * caught here rather than against a stand-in. Three is the matrix #18 set; the
 * paragraph-scope prompts the matrix does not carry are checked clause by
 * clause in `starterPasses.test.ts`.
 */

export interface HarnessDocument {
  id: string;
  title: string;
  tree: DocTree;
  /** The top-level block index of the Target Paragraph. */
  targetBlockIndex: number;
}

/** The praise the fixture response plants; the linter must flag exactly this. */
export const FIXTURE_PRAISE = "great writing";
/** The rewrite the fixture response smuggles; it must be quarantined, never a field. */
export const FIXTURE_REWRITE = "A much cleaner sentence.";
/** The fixture response anchors one Finding outside the Target; Containment must drop it. */
export const FIXTURE_DROPPED = 1;
/**
 * The Findings the fixture anchors inside the Target, by their `issue` label.
 * Written down here rather than recomputed, so the harness asserts the fixture's
 * own expectation rather than the containment path's answer about itself.
 */
export const FIXTURE_IN_TARGET_ISSUES = ["Cliché", "Smuggled prose"];
/** The Finding the fixture anchors in the context above a paragraph Target. */
export const FIXTURE_OUT_OF_TARGET_ISSUES = ["Out of scope"];

/** The praise the Judge fixture plants; the linter must flag exactly this. */
export const FIXTURE_JUDGE_PRAISE = "excellent prose";
/** The rewrite phrase the Judge fixture plants in a problem list. */
export const FIXTURE_JUDGE_REWRITE = "Consider rewriting";

function doc(...content: BlockNode[]): DocTree {
  return { type: "doc", content };
}

function heading(text: string): BlockNode {
  return { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text }] };
}

function paragraph(text: string): BlockNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

/**
 * The three fixture Documents. Each is a heading plus five Paragraphs, with the
 * third Paragraph as the Target, so every cell has one Paragraph of context
 * above and below — the shape a paragraph-scope Pass is built for.
 */
export const HARNESS_DOCUMENTS: HarnessDocument[] = [
  {
    id: "sunday-reset",
    title: "The Sunday reset",
    targetBlockIndex: 3,
    tree: doc(
      heading("The Sunday reset"),
      paragraph(
        "Every Sunday I sit down with a cup of coffee and a blank page. The week ahead is a fresh start, and I want to make the most of it.",
      ),
      paragraph(
        "For years I treated planning as a chore. I would write a long list, feel briefly virtuous, and then ignore all of it by Tuesday.",
      ),
      paragraph(
        "At the end of the day, a plan is only as good as the habits underneath it. I think we should really focus on the things that move the needle, because the low-hanging fruit is usually the first thing to rot.",
      ),
      paragraph(
        "So now I keep the list short. Three items, no more, and I write them the night before.",
      ),
      paragraph(
        "It is not a system anyone would sell you. It is just enough structure to keep the week from running me over.",
      ),
    ),
  },
  {
    id: "migration-slipped",
    title: "Why the migration slipped",
    targetBlockIndex: 3,
    tree: doc(
      heading("Why the migration slipped"),
      paragraph(
        "We told the team the migration would take two weeks. It took six, and the reasons were almost entirely in our control.",
      ),
      paragraph(
        "The first week went to discovery. We inventoried every table, argued about ownership, and wrote a document nobody read.",
      ),
      paragraph(
        "In order to move forward, we made the decision to delay the cutover. There was a feeling on the team that the data was not quite ready, and honestly the whole thing was a bit of a nightmare from the beginning.",
      ),
      paragraph(
        "The second week we found the real problem: the legacy ids were not unique across shards.",
      ),
      paragraph(
        "Next time we will spend a day on the data before we promise anyone a date.",
      ),
    ),
  },
  {
    id: "launch-note",
    title: "Launch note for the team",
    targetBlockIndex: 3,
    tree: doc(
      heading("Launch note for the team"),
      paragraph(
        "Tomorrow we ship the new checkout. It has been a long road, and I want to say thank you to everyone who stayed with it.",
      ),
      paragraph(
        "The build is stable, the docs are written, and support has the runbook. The last two weeks were mostly waiting.",
      ),
      paragraph(
        "This is a game-changing release that will revolutionize how our customers think about checkout. At the end of the day, we are really excited to see the needle move, and the team has done a fantastic job.",
      ),
      paragraph(
        "There will be rough edges. Please file them the same day rather than saving them for the retro.",
      ),
      paragraph(
        "If the first hour goes badly, page me directly. I would rather hear it from you than from a dashboard.",
      ),
    ),
  },
];

/** Exactly three real Starter model Passes: the matrix's other axis. */
export const HARNESS_PASSES: Pass[] = [CLICHE_PASS, CLAIM_STRENGTH_PASS, CUT_CANDIDATES_PASS];

/**
 * The two document-scope Starter Passes, run over the same fixtures as a second
 * matrix. They exercise the structural prompt shape and the whole-Document
 * Target, which the paragraph matrix above cannot: the `{{document}}`
 * placeholder must carry the whole Document, and a Finding anchored in what a
 * local Pass would call context must be kept.
 */
export const HARNESS_DOCUMENT_PASSES: Pass[] = [TOPIC_STRINGS_PASS, PARAGRAPH_REORDER_PASS];

/**
 * The Reader pass, run as a third matrix. Its output shape is a Reader account
 * rather than Findings, so it exercises the section-scope prompt and the
 * account parser: no Anchor to contain, but the same linter and rewrite checks.
 */
export const HARNESS_READER_PASSES: Pass[] = [READER_PASS];

/**
 * The Audit pass, run as a fourth matrix. Its output shape is an Audit account
 * and its scope is the whole Document, so it exercises the document-scope
 * prompt and the schema-guided parser: no Anchor to contain, but the same
 * linter, praise and rewrite checks, plus an account that must never carry a
 * rewrite field.
 */
export const HARNESS_AUDIT_PASSES: Pass[] = [AUDIT_PASS];

/**
 * The misbehaving model response every case receives. It carries:
 * - a kept Finding whose diagnosis is praise, which the linter must flag;
 * - a Finding anchored in the context above the target, which Containment must drop;
 * - a Finding carrying an out-of-schema `rewrite` field, which must never reach
 *   a Finding and must be quarantined as a Violation instead.
 */
export function adversarialResponse(target: Target): string {
  const firstQuote = target.text.slice(0, 24);
  const secondQuote = target.text.slice(-24);
  const outOfTargetQuote = target.contextAbove === "" ? target.title : target.contextAbove;

  return JSON.stringify({
    findings: [
      {
        issue: "Cliché",
        diagnosis: `The phrase is worn smooth. This is ${FIXTURE_PRAISE}, honestly.`,
        quote: firstQuote,
        offset: 0,
      },
      {
        issue: "Out of scope",
        diagnosis: "Neutral diagnosis.",
        quote: outOfTargetQuote,
        offset: 0,
      },
      {
        issue: "Smuggled prose",
        diagnosis: "Neutral diagnosis.",
        quote: secondQuote,
        offset: Math.max(0, target.text.length - secondQuote.length),
        rewrite: FIXTURE_REWRITE,
      },
    ],
  });
}

/**
 * The misbehaving Audit response every Audit case receives. It carries the same
 * breaches in the account's shape: praise the linter must flag in an authored
 * field, an out-of-schema `rewrite` string that must be quarantined rather than
 * kept, and a valid account so the case still parses.
 */
export function adversarialAuditResponse(_target: Target): string {
  return JSON.stringify({
    type: "argument",
    corePayload: `The piece claims a plan carries the week. This is ${FIXTURE_PRAISE}, honestly.`,
    argumentMap: {
      premises: ["Every Sunday a list is written."],
      subConclusions: ["A list without habits is ignored by Tuesday."],
      conclusion: "Keep the list short.",
    },
    reasoning: {
      kind: "inductive",
      soundness: "The premise that habits carry the plan is never established.",
      enthymemes: ["Habits, not plans, do the work."],
    },
    fallacies: [
      {
        name: "False cause",
        passage: "the low-hanging fruit is usually the first thing to rot",
        why: "Correlation is treated as causation.",
        missing: "Evidence that the fruit rots first.",
      },
    ],
    definitions: { intensional: null, extensional: null },
    priority: ["Establish that habits do the work."],
    rewrite: FIXTURE_REWRITE,
  });
}

/**
 * The misbehaving Reader response every Reader case receives. It carries the
 * same three breaches in the account's shape: praise the linter must flag, an
 * out-of-schema `rewrite` string that must be quarantined rather than kept, and
 * a valid account so the case still parses.
 */
export function adversarialReaderResponse(_target: Target): string {
  const account = JSON.stringify({
    what_this_section_says: "It sets up the piece.",
    what_a_distracted_reader_would_miss: "The turn in the argument.",
    gap_between_intent_and_effect: "The claim arrives before its reason.",
    rewrite: FIXTURE_REWRITE,
  });
  // The praise sits in the prose around the JSON, so the harness proves the
  // Reader path lints the whole response, not only the account's fields.
  return `This is ${FIXTURE_PRAISE}, honestly.\n${account}`;
}

/**
 * The two passages the Judge matrix compares. The Judge is not a Pass: it takes
 * two versions rather than a Target, so it gets its own small matrix. These are
 * short, and the `after` version is the `before` with one clause tightened, so
 * the fixture is a plausible comparison rather than lorem ipsum.
 */
export const HARNESS_JUDGE_PASSAGES: { id: string; before: string; after: string }[] = [
  {
    id: "planning",
    before: "At the end of the day, I think we should really focus on the things that move the needle.",
    after: "We should focus on what moves the needle.",
  },
  {
    id: "migration",
    before: "In order to move forward, we made the decision to delay the cutover.",
    after: "We delayed the cutover.",
  },
];

/**
 * One misbehaving Judge response. The two calls must agree on a side, so the
 * `preference` label is supplied per call: with the label order fixed at
 * `["A", "B"]`, the first call prefers `A` and the swapped call prefers `B`, and
 * both name the Writer's `before` version. It plants the two breaches the
 * linter must catch in a problem list and a reason, and the evidence quote is
 * empty so the fixture does not depend on either passage's text.
 */
export function adversarialJudgeResponse(label: "A" | "B"): string {
  return JSON.stringify({
    preference: label,
    confidence: 0.7,
    reasons: [{ evidence_quote: "", explanation: `The opening is ${FIXTURE_JUDGE_PRAISE}.` }],
    problemsInA: [`${FIXTURE_JUDGE_REWRITE} the opening to be shorter.`],
    problemsInB: [],
  });
}
