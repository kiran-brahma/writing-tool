# The Working order is the navigation

v1.1 added the **Working order** — structure, then paragraph, then word — and surfaced it as a label:
a heading over each group of Passes and a line reading *Recommended next: …*. The recommendation was
true and almost invisible. The sidebar it sat in held eight sections in one scroll column — Outline,
metrics, the Findings/Reader/Audit tabs, model Passes, rule Passes, the Judge, milestones and
Revisions — in an order that put the Findings above the Passes that produce them. Running a Pass and
reading what it found, which is the loop the whole tool exists for, cost a scroll down and a scroll
back on every cycle, and the Judge — the mechanism `DESIGN.md` §3 calls the most important in the
tool — sat below two panels most Writers never scrolled past.

So the Working order stops being a label and becomes the navigation. The rail's top-level control is
the **Band**: Structure, Paragraph, Word. Selecting one shows that Band's Passes *together with the
Findings those Passes produced*, so a Run and its result are the same view. The Judge is a
destination below the Bands, not a fourth Band, because it is not part of the Working order. The
Reader account and the Audit account stop being a separate axis of tabs: the Audit pass is
document-scope and so belongs to Structure, the Reader pass is section-scope and so belongs to
Paragraph, and `workingOrderBand` already sorts them there.

This is the strongest form the recommendation can take without becoming a gate, and ADR 0009 is the
line it must not cross. Four properties keep it on the right side, and each is a requirement, not an
aspiration:

- Every Band is reachable in one click from every other, in any order.
- No Band is gated on another, and no Band must be "finished" before another opens.
- **All** is always available and shows the whole queue across every Pass.
- No Run is refused, deferred or hidden because of which Band is showing.

A default is not a gate. The rail opens on Structure for a Writer who has never used it — the tool
opening on the thing it recommends — and on the last Band the Writer was in thereafter.

## Considered Options

- **Reorder the existing column and collapse what is rarely used.** An hour's work and near-zero
  risk. It fixes the run-then-read scroll and nothing else: the Judge stays buried, the Reader and
  Audit tabs stay a second axis, and the Working order stays a label. It treats the symptom.
- **Two rails — reference on the left, work on the right.** Hides nothing and uses horizontal space
  rather than concealment, but takes that space from the editor. This app's layout argument is that
  the writing surface is the point, so spending width on chrome contradicts it below roughly 1600px.
- **Enforce the order: hold the Paragraph and Word Bands until Structure is worked.** Arguably better
  advice and exactly the nanny ADR 0009 refuses. Rejected without much argument.

## Consequences

`workingOrder()` gains a second job: it already grouped Passes by Band, and it now also partitions the
Findings queue. That keeps the derivation in one pure function, and the rail stays display over Core.

The Findings queue is filtered by default, which is a real cost: a Writer who wants every open Finding
at once must choose **All**. This is the reason **All** is a requirement above rather than a
convenience.

`Band` enters `CONTEXT.md`. It existed in `src/core/pass.ts` as an implementation detail and is now the
thing the Writer navigates, so it stops being internal. "Stage" was already banned as a synonym for the
Working order and remains banned for the Band.

Almost every panel moves, so this lands before the tickets that decorate it. Reversing it later is a
second restructure of the same size — the reason this decision is written down rather than implied by
a layout.
