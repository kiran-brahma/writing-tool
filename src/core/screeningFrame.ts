/**
 * The Critic's standing instruction, from the source method: read the piece as
 * an editor screening a submission, not as its author. It is a global setting,
 * on by default, and applies to critic Finding Passes only — the Reader and the
 * Audit keep their own prescribed stance, and the Judge gets no persona and no
 * publication to overfit to.
 *
 * A frame is a system prompt; it is not where Rule 1 and Rule 2 are enforced.
 * Those live in the findings schema and the linter, because a prompt drifts.
 */

/**
 * Story 153: the reader a Pass is written for. `default` is the editor persona
 * v1 shipped; Skimmer, Skeptic and Practitioner are the three v1.1 frames. The
 * names avoid the reserved word *reader* and the CONTEXT.md _Avoid_ lists. A
 * Pass carries one of these in its optional `frame` field; unset and `default`
 * are the same request, so a Pass that never chose one behaves as it did before
 * v1.1.
 */
export type ScreeningFrame = "default" | "skimmer" | "skeptic" | "practitioner";

/** Every frame a Pass may set, in the order the Workbench offers them. */
export const SCREENING_FRAMES: readonly ScreeningFrame[] = [
  "default",
  "skimmer",
  "skeptic",
  "practitioner",
];

export function isScreeningFrame(value: unknown): value is ScreeningFrame {
  return typeof value === "string" && (SCREENING_FRAMES as readonly string[]).includes(value);
}

/**
 * The two clauses every frame keeps, so a persona cannot be added without the
 * constitution's two prompt bans. Rule 1 and Rule 2 are enforced structurally,
 * but the frame states them too because a system prompt is where a model looks
 * for them.
 */
const ASSESS_CLAUSE = "Assess the prose on its own terms and report what does not work.";
const NO_PRAISE_CLAUSE =
  "Do not flatter the author, do not praise the writing, and do not suggest replacement prose.";

/** One frame's persona, with the two clauses every frame shares appended. */
function withClauses(persona: string): string {
  return `${persona} ${ASSESS_CLAUSE} ${NO_PRAISE_CLAUSE}`;
}

/**
 * The frame texts. Each names who is reading and what they need from the piece,
 * then keeps the same ban on praise and replacement prose, so the frame cannot
 * drift from the constitution.
 */
const FRAMES: Record<ScreeningFrame, string> = {
  default: withClauses("You are an editor screening a submission. You are not the author."),
  skimmer: withClauses(
    "You are a reader with no time and no patience, skimming this piece on a phone between " +
      "other things. Flag every place you would stop reading, lose the thread, or fail to take " +
      "away the point.",
  ),
  skeptic: withClauses(
    "You are a hostile domain expert who doubts the claim. You know this subject well and you " +
      "are not inclined to believe the piece. Flag every unsupported assertion, every claim that " +
      "outruns its evidence, and every place the reasoning would not persuade a careful opponent.",
  ),
  practitioner: withClauses(
    "You are someone who has to act on this advice this week. You need the piece to tell you " +
      "what to do, in what order, and what to watch for. Flag every place it leaves you unable " +
      "to act.",
  ),
};

/**
 * The system instruction for a frame. `undefined` and `default` are the same
 * frame, so a Pass that never chose one and a Pass that explicitly chose the
 * default send an identical request.
 */
export function frameText(frame: ScreeningFrame | undefined): string {
  return FRAMES[frame ?? "default"];
}
