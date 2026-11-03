# The Callout does not move the queue

A Writer reading the prose meets a Highlight and has to find its Finding in the Rail: filtered to a
Band that may not hold it, scrolled somewhere else, and far from the words it concerns. So a click on a
Highlight opens a **Callout** beside the prose with that text's open Findings and the queue's verdicts —
addressed, declined, declined as a violation.

The first version made the clicked Finding the Current Finding, which is what `CONTEXT.md` would
suggest: the prose and the queue should not disagree about where the Writer is. In use it scrolled the
Rail to the Finding's row on every click, and the Writer lost their place in the prose — the thing the
Callout exists to protect. So opening a Callout changes nothing else on screen: not the Current
Finding, not the Rail, not the caret the click placed. The Writer can act from it, or close it and go
on typing.

This refines the Current Finding rather than contradicting it. The Current Finding is the queue's
selection, and the queue and the prose still agree about it; the Callout is a second, local way to
read and act on a Finding that never moves that selection.

## Considered Options

- **Make the clicked Finding current.** Keeps one notion of "where the Writer is", at the cost of
  moving the Rail under them on every click. Tried and rejected by the Writer.
- **Select the Finding in the Rail only when a verdict is given from the Callout.** Moves the Rail at
  the moment the Writer is about to go back to the prose. Same cost, later.
- **No Callout; make the Rail follow the caret.** Ties the Rail to every caret move while typing,
  which is noise, and still keeps the Finding away from the words.

## Consequences

A verdict given in the Callout on the Current Finding clears the selection rather than advancing it,
because the Writer is working in the prose, not stepping the queue. The Callout carries no
model-derived text into the Document: like a Rail row it is display and controls only, with praise
struck through and a caught rewrite behind the quarantine.
