# Spec — Obelus v1.3

> `docs/specs/obelus-v1.md`, `obelus-v1.1.md` and `obelus-v1.2.md` stay as they are. This file is the
> v1.3 increment. v1's invariants — the constitution, the single seam
> `send(ModelRequest) -> Promise<string>`, and browser-only access — still hold, and this file is the
> requirement for everything it adds.
>
> The load-bearing decision is `docs/adr/0012-the-judge-is-a-rail-mode.md`, which supersedes one
> sentence of ADR 0010 and keeps its four properties. The design was chosen in
> `docs/decisions/the-page-and-the-mark-goldilocks.md`.

## Problem Statement

v1.2 made the recommendation reachable. What the Writer looks at for hours — the page and the marks on
it — is still the least designed thing in the app.

1. **The prose has no measure.** The Editor spans the whole width left over from the Rail, in the
   system sans at 16px. On a wide screen a line runs past 140 characters, and the Writer's own words
   look like the tool's labels.
2. **The marks overwhelm the text.** Every open Finding draws a filled amber Highlight. A Document with
   a few hundred Findings becomes a yellow wall, and the Current Finding is one deeper yellow among
   them.
3. **Amber means two things.** It is the colour of a Highlight, a mark to work through, and of a save
   failure, a failed Run, a storage notice and a milestone badge. "Look at this" and "something broke"
   are the same colour.
4. **The Rail puts chrome above the queue, and the Judge under it.** A reference strip, a debugging
   checkbox and a 40-word hint sit above the Findings; the Judge, milestones and Revisions sit below
   every open Finding. Reaching the Judge — the mechanism `DESIGN.md` calls the most important — means
   scrolling past the whole queue.
5. **The chrome is flat.** Nearly all Rail text is 12px grey; the header gives six destinations equal
   weight and hides the word count behind a menu; the Callout's three verdicts are identical links.
6. **It works only on a wide screen, and only in light.** The Rail is always 384px wide, so on a tablet
   the prose is squeezed to a column; there is no dark scheme, and the browser chrome colour is set dark
   while the app is light.

## Solution

Give Obelus an identity in exactly two places — **the page** and **the mark** — and keep everything
around them quiet.

- **The page:** the Writer's prose in a bundled book serif, held to a reading measure of about 68
  characters, with the Document's title at the head of the column, a quieter toolbar, and a **Status
  line** beneath it carrying the word count. Everything that is the tool's rather than the Writer's
  stays in the system sans: serif is the Writer's words, sans is the tool's.
- **The mark:** Highlights in an editor's blue pencil, underlined at rest and filled only for the
  Current Finding and under the pointer; and a **Margin mark** — the obelus, with a count — beside each
  Paragraph where open Findings begin, opening the Callout when clicked.
- **Colour that means one thing:** semantic colour tokens, a Light | Dark | System choice, blue pencil
  for marks, amber for warnings, red for failures.
- **The Rail in two Rail modes,** Findings and Judge, with the queue first, a one-line hint bar, and
  the Judge beside its milestones and Revisions.
- **The Outline in the left margin** on wide screens.
- **A header that says where the work is:** Editor and Library as the destinations, the rest quieter.
- **Down to tablet width:** below 1024px the Rail overlays the prose instead of squeezing it.

Nothing here adds an affordance that inserts model-derived text, nothing gates a Run, and nothing
changes a prompt.

## User Stories

### The page

**192.** As a Writer, I want my prose held to a comfortable reading measure, so that a line on a wide
screen is as readable as a line in a book.

**193.** As a Writer, I want my prose set in a book serif and the tool's own words in a sans, so that
what I wrote and what the tool says never look alike.

**194.** As a Writer, I want the typeface served by Obelus itself, so that opening a Document sends no
request to a font service.

**195.** As a Writer, I want a readable fallback typeface when the book serif has not loaded yet, so
that an offline first open still shows my prose.

**196.** As a Writer, I want my Document's title at the head of the page, in the page's typeface, so
that it reads as the top of my Document rather than a form field.

**197.** As a Writer, I want a quieter formatting toolbar aligned with the page, so that formatting is
at hand without competing with the prose.

**198.** As a Writer, I want Undo and Redo left to the keyboard, so that the toolbar carries only what
has no universal shortcut.

**199.** As a Writer, I want Markdown shortcuts to keep working as they do now, so that I can format
without the toolbar at all.

**200.** As a Writer, I want a Status line beneath the prose showing my word count, so that I can see
it at a glance rather than opening a menu.

### Colour and scheme

**201.** As a Writer, I want to choose Light, Dark or System, so that I can write at night without
changing my whole computer's setting.

**202.** As a Writer, I want System to be the default and to follow my operating system as it
changes, so that I need do nothing to get the scheme I already use.

**203.** As a Writer who chose System, I want the app to open in the right scheme with no flash of the
wrong one, so that a dark room stays dark.

**204.** As a Writer, I want my scheme choice remembered and carried in a Backup, so that it survives a
reload and a Restore.

**205.** As a Writer, I want the browser's own chrome to match the scheme, so that the window reads as
one surface.

**206.** As a Writer, I want the dark page to be a dark paper rather than pure black, so that long
sessions do not glare.

**207.** As a Writer, I want warnings and failures in colours distinct from the marks, so that
"something to work through" and "something went wrong" never look the same.

**208.** As a Writer, I want a milestone badge that does not borrow a warning's colour, so that a
milestone reads as something I chose, not something that went wrong.

**209.** As a Writer using the keyboard, I want every control to show a visible focus ring, so that I
always know where I am.

**210.** As a Writer, I want Rail text to meet the contrast and size minimums of story 187 in both
schemes, so that dark mode does not undo that repair.

### The mark

**211.** As a Writer, I want a Highlight underlined at rest rather than filled, so that I can see where
the marks are without the page becoming about them.

**212.** As a Writer, I want the Current Finding's Highlight filled, so that the one I am working on
stands out from the rest.

**213.** As a Writer, I want a Highlight to deepen under the pointer, so that I know a click will open
its Callout.

**214.** As a Writer, I want marks in an editor's blue pencil, so that they read as editing marks and
not as errors.

**215.** As a Writer, I want marks legible in both schemes, so that dark mode does not hide my work.

**216.** As a Writer with a Document carrying hundreds of Findings, I want typing to stay as fast as it
is today, so that the new marks cost me nothing while I write.

### Margin marks

**217.** As a Writer, I want a Margin mark beside each Paragraph where open Findings begin, so that I
can scan down the margin to see where the work is.

**218.** As a Writer, I want the Margin mark to show how many Findings begin there, so that I can tell a
lightly marked Paragraph from a heavily marked one.

**219.** As a Writer, I want a click on a Margin mark to open the Callout with that Paragraph's
Findings, so that I can act on them without looking for them in the Rail.

**220.** As a Writer, I want opening a Callout from a Margin mark to leave the Current Finding and the
Rail where they were, so that I keep my place (ADR 0011).

**221.** As a Writer, I want a Finding that spans several Paragraphs to give one Margin mark, beside
the first of them, so that the counts are honest.

**222.** As a Writer, I want no Margin mark for an Orphaned Finding, so that the margin never points at
text that is not there.

**223.** As a Writer, I want the Margin marks in the right-hand margin, between the prose and the Rail,
so that my eye moves one way: prose, mark, Rail.

**224.** As a Writer, I want Margin marks to follow the prose as I type, so that a mark never sits
beside the wrong Paragraph.

**225.** As a Writer using the keyboard, I want Margin marks left out of the Tab order, so that
hundreds of them never stand between me and the Rail; the queue keys already reach every Finding.

**226.** As a Writer using a screen reader, I want each Margin mark labelled with its count, so that it
is announced as what it is.

**227.** As a Writer, I want a Margin mark to disappear when the last Finding it counts leaves the
queue, so that a finished Paragraph looks finished.

### The Rail

**228.** As a Writer, I want the Rail to have two Rail modes, Findings and Judge, switched at its top,
so that the Judge is one click away rather than below the whole queue (ADR 0012).

**229.** As a Writer, I want Findings mode to open with the Band control and the Findings, so that the
queue is the first thing in the Rail.

**230.** As a Writer, I want milestones and Revisions in Judge mode, beside the Judge, so that the
material the Judge compares is where the Judge is (story 165).

**231.** As a Writer, I want the Rail to open in Findings mode each session, so that I start where the
work is.

**232.** As a Writer, I want the queue keys to act only in Findings mode, so that `j`/`k` never move a
selection I cannot see.

**233.** As a Writer, I want the modifier step to switch the Rail to Findings mode, so that it still
works from anywhere, as it already opens a collapsed Rail.

**234.** As a Writer, I want a Verdict or a finished Run announced whichever Rail mode is showing, so
that switching modes never costs me a result (story 186).

**235.** As a Writer, I want every Band, **All** and every Run available in Findings mode exactly as
before, so that ADR 0010's four properties hold.

**236.** As a Writer, I want the hint bar reduced to one line at the foot of the Rail, still saying when
the plain keys are live, so that it informs without crowding the queue (story 177).

**237.** As a Writer, I want the full explanation of the keys on the shortcuts page, so that the one-line
hint can stay short.

**238.** As a Writer, I want the raw-response option in AI Settings and remembered, so that a debugging
aid does not sit above my queue.

**239.** As a Writer, I want a Finding's model and time shown on the Current Finding and in the
Callout rather than on every row, so that the queue is readable and provenance is there when I judge.

**240.** As a Writer, I want Rail text in a clear three-step type scale, so that headings, Findings and
details are distinguishable by size, not only by borders.

### The Outline

**241.** As a Writer on a wide screen, I want the Outline in the left margin beside the page, so that
the map of my Document sits next to it and uses space the prose leaves empty.

**242.** As a Writer on a narrower screen, I want the Outline back in the Rail as a collapsible
section, so that it is never lost.

**243.** As a Writer, I want the Outline to mark the Section I am in and jump on click wherever it is
shown, so that it behaves the same in both places.

### The header

**244.** As a Writer, I want Editor and Library as the header's main destinations, so that the header
says where the work is.

**245.** As a Writer, I want the Pass workbench and AI Settings present but quieter, so that tools read
as tools.

**246.** As a Writer, I want How this works and Privacy under one help control, so that they are
always reachable without taking header space.

**247.** As a Writer, I want every destination still reachable from every other in at most two clicks,
so that navigation stays persistent (story 190).

### The Callout

**248.** As a Writer, I want Addressed to be the Callout's primary action, so that the verdict I give
most is the easiest to give.

**249.** As a Writer, I want Decline as a secondary action and Decline as violation as a quieter one,
so that the rarer verdicts are available without competing.

**250.** As a Writer, I want no keyboard hints in the Callout, so that I am not told keys act on this
Finding when they act on the Current Finding (ADR 0011).

### Narrow screens

**251.** As a Writer on a tablet, I want the Rail to overlay the prose below 1024px rather than squeeze
it, so that the page keeps its full width.

**252.** As a Writer on a tablet, I want the overlaid Rail to start closed whatever I chose on a wide
screen, so that a desktop preference never covers my prose.

**253.** As a Writer on a tablet, I want the Status line to offer the Rail with the open-Finding count,
so that I can see how much work is waiting without opening it.

**254.** As a Writer on a tablet, I want the modifier step to open the overlaid Rail, so that the
keyboard route works at every width.

**255.** As a Writer on a tablet, I want Escape or a press outside to close the overlaid Rail, so that
returning to the prose is one move.

### Other screens

**256.** As a Writer, I want the Library, Pass workbench, AI Settings, How this works and Privacy to
follow the scheme, the type scale and the focus rings, so that no screen is left behind in light or
without focus.

## Implementation Decisions

### Colour tokens and the scheme

Colours are named by meaning — paper, ink, muted ink, rule, mark, current mark, warning, failure — as
Tailwind v4 theme variables, redefined for the dark scheme. Components use the names, never palette
steps; replacing the palette classes is ticket 1's whole job, and it changes nothing but colour.

`resolveColorScheme(setting, systemPrefersDark)` returns `light` or `dark`. With **System**, the
stylesheet follows `prefers-color-scheme` on its own and no attribute is set, so there is no flash on
load. A Light or Dark choice sets a single `data-theme` attribute on the root element; the only
possible flash is for those Writers, during the existing loading screen, before `settings` has been
read. That is accepted rather than mirroring the choice into `localStorage`, which would be a second
store able to disagree with the first.

The `theme-color` meta tag follows the resolved scheme.

### The page

The book serif is Literata, a variable font under the SIL Open Font License, bundled into the build
and served from Obelus's own origin; Georgia is the fallback. The Content Security Policy already
allows only `'self'` and `data:` for fonts, so no CDN is possible or wanted. The service worker caches
fonts at runtime; it does not precache them, and an offline first open before Literata has loaded
shows Georgia.

The measure is about 68 characters; the page body is about 18px with line-height near 1.6, and headings
follow a scale set in the same family. The title field moves into the column. The toolbar keeps
headings, bold, italic, inline code, lists and quote, and drops Undo and Redo. The Status line lives
under the page at every width and carries the word count; the Document menu keeps Import and Export.

### The mark

A Highlight is an underline at rest; the Current Finding's Highlight and a hovered Highlight are
filled. The underline remains a text decoration and no Highlight gets a box-shadow or a radius — the
WebKit budget recorded beside `.obelus-highlight` holds. The Current Finding's outline stays, because
only one Highlight is ever current.

### Margin marks

`marginMarks(tree, highlights)` is a pure function from the Document and the resolved Highlights to a
list of `{ blockIndex, findingIds }`: one entry per top-level block where at least one open, attached
Finding's interval begins. It lives beside the Callout's pure functions, and it never sees a Finding's
text.

The Highlight plugin draws each entry as a widget decoration placed **between** top-level blocks —
never inside a textblock, where widgets disturb the caret in Safari — as a zero-height element
positioned into the right margin. Because the plugin already maps its decorations through edits and
rebuilds them when Highlights are projected, Margin marks follow typing with no measuring and no
second scroll-tracking mechanism.

Each Margin mark is a `button` with `tabIndex=-1` and an `aria-label` naming its count. A click
reports its Finding ids through the same path a Highlight click uses, so the shell opens the Callout
with `calloutFindings` and the Current Finding does not move.

### Rail modes

Rail mode is local state in the Rail — `findings` or `judge`, opening on `findings`, never stored.
Findings mode holds the Band control, **All**, the run controls and the queue; Judge mode holds the
Judge, milestones and Revisions. The queue's keyboard handler acts only in Findings mode; the modifier
step switches to it first, exactly as it opens a collapsed Rail today. The live region for Runs and
Verdicts sits outside both modes.

The hint bar is one line at the foot of the Rail; the full explanation moves to the shortcuts section
of How this works. The raw-response option becomes a `showRawResponse` key in `settings`, set from AI
Settings. A Finding row shows its model and time only when it is the Current Finding; the Callout shows
them for each Finding.

### The Outline

The Outline renders in two places and CSS shows one: in the left margin at 1440px and wider, as a
collapsible Rail section below that. No JavaScript decides the placement.

### Narrow layout

One `matchMedia("(min-width: 1024px)")` subscription gives `wide`. `railPresentation(wide, collapsed,
overlayOpen)` returns `docked`, `overlay` or `hidden`: when `wide`, the stored `collapsed` preference
decides between docked and hidden; when narrow, only a local `overlayOpen` flag — false on every load —
decides between overlay and hidden. The overlay closes on Escape and on a press outside it.

### Header and Callout

The header keeps its three zones (brand, document actions, navigation). Editor and Library are the
navigation tabs; Pass workbench and AI Settings follow as quieter links; How this works and Privacy sit
under one help control. The Callout's Addressed is a filled button, Decline an outlined one, Decline as
violation a text link.

### Data

Two new keys in the existing `settings` store: `colorScheme` and `showRawResponse`, each normalised on
load so an unknown value falls back to the default. **No Dexie migration**, so
`docs/migrations.md`'s rule does not apply to this increment. Both travel in a Backup, as every setting
does; an older build ignores them.

### Glossary

**Margin mark**, **Rail mode** and **Status line** are added to `CONTEXT.md`; **Rail** and **Callout**
are updated. "Margin mark" is kept although the Anchor entry lists *mark* under _Avoid_: that avoid is
about naming an Anchor, and the Margin mark is not one. The Rail is never a "drawer" — below 1024px it
*overlays the prose*.

## Testing Decisions

- **No DOM layer,** as in v1.2. A ticket that wants one raises it as its own ticket with an ADR.
- **Every ticket names the pure function underneath it and tests that,** through its inputs and
  outputs only, in the style of the Callout's and the queue keys' tests:
  - `resolveColorScheme` — the full table of setting × system preference.
  - `colorScheme` and `showRawResponse` — save, load, and normalisation of an unknown value, as the
    settings store's existing tests do.
  - `marginMarks` — one entry per open Finding at the block where it begins; a multi-Paragraph
    Finding counted once; Orphaned and closed Findings absent; counts correct where Findings share a
    block.
  - `railPresentation` — the full table, including "narrow ignores `collapsed`".
  - The one-line hint — its content asserted, as the content of How this works already is.
- **The queue-key restriction is tested as a rule,** not through the DOM: the function that decides a
  key's action receives the Rail mode, and returns nothing in Judge mode except the modifier step.
- **Markup and CSS tickets** — the page, the mark, the header, the Callout, the Outline placement — are
  accepted by an explicit checklist the implementer states they performed in the app, **in both
  schemes and at 375, 1024 and 1440px wide.**
- **The WebKit budget is checked by hand** for tickets 3 and 4: typing in a Document with about 490
  Highlights must feel no slower than on the commit before the ticket.
- **The constitution harness is untouched.** No prompt changes in this increment.

## Out of Scope

- **Phone-sized layouts.** Tablet width is the floor; working a Findings queue on a phone is a
  different product.
- **Different mark styles per Band.** One style for every Band; revisit after use.
- **A selection-anchored formatting menu,** and any new editor dependency.
- **Redesigning the Library, Pass workbench, AI Settings, How this works or Privacy** beyond colour,
  type scale and focus.
- **Precaching fonts** in the service worker.
- **Inviting the Judge once Findings are addressed, the reader extensions and the revision meter** —
  deferred to v1.3 by v1.2, and now v1.4.
- **A DOM or browser test layer. Any Dexie schema change. Any prompt change.**
- **Any generation.** Unchanged: the findings schema has no field for prose and no affordance inserts
  model-derived text.

## Further Notes

Build order, each ticket leaving the app usable:

1. Tokens and scheme — blocks every other ticket.
2. The page.
3. The mark.
4. Margin marks — after 3.
5. Rail modes.
6. The Outline in the margin.
7. Header and Callout.
8. Narrow layout.

Tickets 2, 3, 5, 6, 7 and 8 need only ticket 1; ticket 4 needs ticket 3.
