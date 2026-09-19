# The Judge answers twice, with the labels swapped

A model told that a passage was just rewritten will prefer the rewrite, which makes a single verdict
worthless for the decision it exists to support. The Judge therefore receives two passages and
nothing else, and answers twice with the labels swapped; when the two answers disagree the result is
reported as Unstable rather than as a preference.

## Considered Options

- **One call, with the editing history withheld.** Cheaper, and still blind to position bias, which is
  a real effect and invisible from a single answer.
- **One call, repeated without swapping.** Tests reproducibility, not bias.

## Consequences

Judging costs two calls. The first answer alone is never shown as a Verdict, because a flattering
coin toss presented as a verdict is the exact failure the Judge exists to prevent.
