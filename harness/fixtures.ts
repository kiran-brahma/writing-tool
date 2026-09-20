import type { BlockNode, DocTree } from "../src/core/docTree";
import type { Pass } from "../src/core/pass";
import {
  CLAIM_STRENGTH_PASS,
  CLICHE_PASS,
  CUT_CANDIDATES_PASS,
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
