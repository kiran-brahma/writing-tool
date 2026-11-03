# The Judge is a Rail mode

ADR 0010 made the Judge "a destination below the Bands" so it would not be read as the Working order's
last step. It is still not a Band, but below the Bands it sat under the whole queue, with milestones
and Revisions under it: a Writer reaching the Judge scrolled past every open Finding, which is the
burial 0010 set out to end. So the Rail gets two **Rail modes**, Findings and Judge, switched at its
top. Findings holds the Band control and everything under it; Judge holds the Judge with milestones and
Revisions, its raw material (story 165). This supersedes 0010's one sentence on where the Judge sits
and nothing else: its four properties are untouched, because the Band control, **All**, and every Run
live whole inside Findings mode.

Two consequences keep it honest. The queue keys act only in Findings mode, so `j`/`k` never move a
selection the Writer cannot see; the modifier step switches to Findings mode, as it already opens a
collapsed Rail. And the mode is not remembered, like **All**: it is a choice made in the moment.

The same increment moves the Outline into the left margin on screens 1440px and wider. That is not the
"two rails" option 0010 rejected. That option took width from the Editor, and the Editor now holds its
prose to a reading measure of about 68 characters, so a wide screen leaves margin the prose cannot
use. The Outline takes that margin, not the prose's width, and returns to the Rail below 1440px.

## Considered Options

- **A top-level destination in the header.** One click away, but the Judge leaves the prose it
  compares, and milestones and Revisions either follow it out of the Editor or are split from it.
- **Keep it below the Bands.** Meets 0010's wording; leaves the Judge under the queue.
