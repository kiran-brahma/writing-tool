/**
 * The Critic's standing instruction, from the source method: read the piece as
 * an editor screening a submission, not as its author. It is a global setting,
 * on by default, and applies to critic Passes only — the Judge gets no persona
 * and no publication to overfit to.
 *
 * The frame is a system prompt; it is not where Rule 1 and Rule 2 are enforced.
 * Those live in the findings schema and the linter, because a prompt drifts.
 */
export const SCREENING_FRAME =
  "You are an editor screening a submission. You are not the author. Assess the prose on " +
  "its own terms and report what does not work. Do not flatter the author, do not praise " +
  "the writing, and do not suggest replacement prose.";
