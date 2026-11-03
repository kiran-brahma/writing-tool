# Spec — Obelus v1.2

> `docs/specs/obelus-v1.md` and `docs/specs/obelus-v1.1.md` stay as they are. This file is the v1.2
> increment. Where they disagree, v1's invariants — the constitution, the single seam
> `send(ModelRequest) -> Promise<string>`, and browser-only access — still hold, and this file is the
> requirement for everything it adds.
>
> The load-bearing decision is `docs/adr/0010-the-working-order-is-the-navigation.md`, which is bounded
> by `docs/adr/0009-obelus-recommends-never-enforces.md`.

## Problem Statement

v1 and v1.1 built the method. A Writer who knows where everything is can run the loop the source
method describes and can reach every recommendation the tool makes. A Writer who does not know where
everything is cannot, and nothing in the app teaches them.

Five failures, all of them in the surface rather than the analysis.

1. **The loop costs two scrolls a cycle.** The sidebar is eight sections in one scroll column, and
   the Findings sit *above* the Passes that produce them. Run a Pass, scroll up to read what it
   found, scroll back down to run the next. The Judge is below two more panels.
2. **Selecting a Finding does not move the prose.** Every open Finding draws an identical Highlight.
   Clicking one, or stepping to it with `j`, changes a row in the sidebar and nothing else, so on any
   Document longer than a screen the Writer is handed a quotation and left to find it.
3. **The two Rules are not in the product.** Rule 1 and Rule 2 are the reason Obelus exists. They
   appear in `README.md`, in `DESIGN.md` and in the prompts. They appear nowhere a Writer using the
   app will see them. There is no first run, no empty state that says what to do, and no page that
   explains the method.
4. **The app speaks its own glossary with no translation.** Pass, Finding, Anchor, Containment,
   Screening frame, Connection, Slot, Critic, Judge, Band, Revision, Reader account, Audit account,
   Violation — correct in code, and on screen with no definition anywhere. Sentences like *"No
   Findings dropped outside the target"* do not parse for someone meeting them for the first time.
5. **Declining is cheap once and expensive twenty times.** The method's closing move is a writer
   declining advice. Obelus makes declining one Finding a single keystroke and declining a whole
   category of advice twenty keystrokes — and nothing in the app can return a Finding to `open`, so
   every decline is one-way.

The through-line: v1.1 made the tool recommend. v1.2 makes the recommendation reachable.

## Solution

Make the **Working order** the navigation. The rail's top-level control becomes the **Band** —
Structure, Paragraph, Word — and each Band shows its Passes together with the Findings those Passes
produced, so a Run and its result are one view. **All** shows the whole queue. The Judge becomes its
own destination. This is ADR 0010, bounded by the four properties ADR 0009 requires.

Around it, six surface repairs and two method repairs:

- The **Current Finding**: selecting one scrolls the Editor to it and distinguishes its Highlight.
- **How this works**: a permanent page carrying the two Rules, the loop, the glossary and the
  shortcuts, with a first-run note pointing at it and a Scratchpad empty state that says what to do.
- **Glosses**: every panel explains its own nouns once, linking into that page.
- **Shortcuts that work where the Writer is**, and a hint bar that tells the truth about when the
  plain keys are live.
- **Accessibility**: tab-panel linkage, an announced Run result, legible contrast and text size.
- **Header and navigation**: persistent destinations, document actions separated, and the three
  "Back to the Editor" buttons deleted.
- **The Judge's default pair** becomes the last flagged Revision against now, not two autosaves.
- **Decline the rest of a Pass**, and a way back for any Finding that left the queue.

Nothing here adds an affordance that inserts model-derived text, and nothing here gates a Run.

## User Stories

### The Working order rail

**160.** As a writer, I want to navigate by Band — structure, paragraph, word — so that the order the
tool recommends is the order I move through rather than a caption I can ignore.

**161.** As a writer, I want a Band to show its Passes and the Findings those Passes produced in one
view, so that running a Pass and reading what it found is not two scrolls apart.

**162.** As a writer, I want an **All** option that shows every open Finding across every Pass, so
that navigating by Band never hides work from me.

**163.** As a writer, I want the Judge as its own destination rather than a fourth Band, so that the
tool's most important mechanism is one click away and is not mistaken for part of the Working order.

**164.** As a writer, I want Reader accounts and Audit accounts to appear in the Band their Pass
belongs to, so that I stop navigating two axes at once.

**165.** As a writer, I want the Outline and the metrics collapsible, and milestones and Revisions
beside the Judge where they are its raw material, so that reference material does not sit between me
and my work.

**166.** As a writer, I want the rail to open on Structure the first time and on the Band I last used
thereafter, and to collapse entirely when I want the prose alone.

### How this works

**167.** As a writer, I want a page that states Rule 1 and Rule 2, explains the loop, defines the
tool's terms and lists the shortcuts, so that the method is inside the product and not only in its
repository.

**168.** As a writer, I want a short note on first run pointing me at that page and telling me the
rule passes have already run, so that I know what I am looking at.

**169.** As a writer, I want that note to stay dismissed once I dismiss it.

**170.** As a writer, I want an empty Scratchpad to say what to do rather than showing me an empty
box.

### The Judge's default pair

**171.** As a writer, I want the Judge to default to comparing my last flagged Revision against now,
so that the pair it offers is a rewrite worth judging.

**172.** As a writer with no flagged Revision, I want it to default to my oldest Revision against
now, so that the default is still a real comparison.

### The Current Finding

**173.** As a writer, I want selecting a Finding to scroll the prose to the text it concerns, so that
I can work it without hunting for the quotation.

**174.** As a writer, I want the Current Finding's Highlight distinguished from the others, so that I
can see which of the marks on the page is the one I am on.

**175.** As a writer, I want stepping the queue with `j` and `k` to move the prose too, so that the
queue and the page never disagree about where I am.

### Reaching the queue from the prose

**176.** As a writer, I want a shortcut that steps the queue while my cursor is still in the prose, so
that working findings does not require reaching for the mouse.

**177.** As a writer, I want the hint bar to say when the plain `j`/`k`/`a`/`x` keys are live, so that
it stops advertising keys that type letters into my Document.

**178.** As a writer, I want `?` to show me every shortcut.

### Declining

**179.** As a writer, I want to decline the remaining open Findings in one Pass in one action, so that
declining a category of advice costs about what declining one piece of it costs.

**180.** As a writer, I want each of those declines recorded individually as declined advice, so that
they stay declined on the next Run exactly as a single decline does.

**181.** As a writer, I want to return a Finding I addressed or declined to the queue, so that no
decline — one or twenty — is a one-way door.

**182.** As a writer, I want declining the rest to be offered per Pass and nowhere else, so that the
tool never offers to dismiss my whole queue at once.

### Glosses

**183.** As a writer, I want each panel to explain its own nouns once, in plain language, so that the
tool's vocabulary is learnable from the tool.

**184.** As a writer, I want those explanations to link into How this works, so that there is one
place the full definition lives.

### Accessibility

**185.** As a writer using a screen reader, I want the rail's panels properly associated with their
controls, so that moving between Bands announces what I moved to.

**186.** As a writer using a screen reader, I want a Run finishing or failing announced, so that I am
not left waiting on a spinner I cannot see.

**187.** As a writer, I want text on the rail to meet contrast and size minimums, so that a disabled
Pass name and a cost estimate are legible.

### What a Run will cost

**188.** As a writer, I want the estimate for a Run beside the control that starts it, so that the
cost is where the decision is.

**189.** As a writer, I want a summed estimate before I run the structural set, so that the one action
that spends the most is not the one that says least.

### Header and navigation

**190.** As a writer, I want persistent navigation between the Editor, the Library and the other
pages, so that I never need a button whose only job is to undo the last button.

**191.** As a writer, I want document actions separated from navigation, so that exporting a Document
and leaving for a settings page do not look like the same kind of act.

## Implementation Decisions

### The Band is the navigation

`workingOrder(passes)` already groups Passes into Bands from kind and scope. It gains a second job:
partitioning the Findings queue by the Band of the Pass that produced each Finding. Both stay in that
one pure function — the rail is display over Core, as every panel in the app already is.

The four properties from ADR 0010 are requirements, not aspirations, and each is a test:

- every Band reachable in one click from every other, in any order;
- no Band gated on another;
- **All** always available, showing the whole queue;
- no Run refused, deferred or hidden because of the Band showing.

`workingOrderBand` is unchanged: a rule Pass is Word whatever its stored scope, a document-scope model
Pass is Structure, a section- or paragraph-scope model Pass is Paragraph. The Audit pass is
document-scope and therefore Structure; the Reader pass is section-scope and therefore Paragraph. The
Findings / Reader accounts / Audit accounts tab strip is removed: an account is shown in its Pass's
Band beside that Pass.

The Judge is not a Band. It is a destination below the Band control, visually separated, because it is
not part of the Working order and must not be read as its last step.

### Rail state

Three new keys in the existing `settings` key-value store: the last Band, whether the rail is
collapsed, and whether the first-run note was dismissed. `database.settings` is `get(key)` /
`put({key, value})`, so **no Dexie migration is required anywhere in v1.2** and
`docs/migrations.md`'s one-migration-per-deploy rule does not apply to this increment.

Settings travel in a Backup. A Restore therefore carries "first-run note dismissed", so a Writer
restoring onto a fresh browser does not meet the note again. That is correct — they are not new — and
is stated here so it is a consequence rather than a surprise.

The rail opens on Structure when no Band has been stored, and on the stored Band thereafter. A default
is not a gate.

### The Current Finding

`Highlight` today draws every open Finding identically. The Current Finding gets a distinguished
Highlight — a second class beside `.obelus-highlight` in `src/index.css`, not a replacement — and
selecting a Finding scrolls the Editor to it.

The scroll mechanism already exists: `jumpRequest` carries a block index and a nonce and is consumed
in `DocumentEditor`, which is how the Outline jumps to a Section. Selecting a Finding reuses it rather
than introducing a second way to move the Editor. The nonce matters: re-selecting the same Finding
must move the Editor again.

### Shortcuts

The plain `j`/`k`/`a`/`x`/`v` keys stay exactly as they are, including the guard that stands them down
while a field or the Editor has focus. They are ordinary letters and must reach the prose.

A modifier shortcut is added that steps the queue from inside the Editor and moves the selection into
the queue. The hint bar states the condition rather than advertising keys unconditionally. `?` opens
the shortcuts section of How this works.

### Declining

Declining the rest is offered **per Pass only**. Not per Band, not for the whole queue: the method's
move is declining a kind of advice, and a whole-queue decline is dismissing the tool, which the Writer
can already do by not running it.

Every Finding it touches is written individually with `declineReason: "advice"`. `"violation"` is an
assertion that the model breached the constitution and cannot responsibly be made in bulk.

`writeStatus` in `src/storage/findings.ts` gains an `open` case, and the sidebar gains a control on
rows that have left the queue. This is not a separate feature: a bulk one-way action is the thing that
makes the missing path back matter, so the two ship together. The invariant is preserved — a status
that is not `declined` never keeps a `declineReason`, so reopening clears it.

### How this works

A static view on the `PrivacyView` pattern. It carries Rule 1 and Rule 2 in full, the three-step loop,
the glossary of the terms the UI uses, and the shortcuts. It is a destination, so the two Rules have a
permanent home in the product rather than living in a note the Writer dismisses once.

The first-run note is in the Editor body, not a modal. It is dismissible, it says the rule passes have
already run and where to look, and it links to How this works.

### Glosses

A gloss is help text, not a concept: no new glossary term, no new component vocabulary. Each panel
explains its own nouns once, in the Writer's language, and links into How this works for the full
definition. `CONTEXT.md` governs code, tests, issues and commits; it does not require UI copy to be
untranslated, and a capitalised `Document` mid-sentence in help text reads as a contract. UI sentences
use ordinary case; the glossary terms stay the terms.

### Header

Three zones: brand, document actions, navigation. Document actions (Import Markdown, Export Markdown,
word count) move behind one control. Navigation is persistent, so `privacyReturn`, `workbenchReturn`
and `settingsReturn` in `src/App.tsx` are deleted along with the three "Back to the Editor" buttons
they exist to serve — that state is a symptom of having no navigation.

How this works is a fourth destination beside the Pass workbench, AI Settings and Privacy, so the
header ticket solves for six destinations in total, counting the Editor and the Library.

### Accessibility

The Band control is a `tablist`; each Band's panel is a `tabpanel` with `aria-controls` and `id`
linkage, which the current tab strip lacks. A polite `aria-live` region announces a Run finishing, a
Run failing and a Judge Verdict arriving. Disabled Pass names are raised to at least 4.5:1 against
their background — `text-stone-400` on the rail is roughly 2.3:1 today — and the `text-[10px]` and
`text-[11px]` sizes are raised.

### Glossary

`Band` and `Current Finding` are added to `CONTEXT.md`, and the `Highlight` entry now states that the
Current Finding's is distinguished. **"Stage" is banned**: the `Working order` entry already lists
*pass stage* under _Avoid_, and it is banned for the Band too — not in the spec, not in a ticket
title, not in a commit message, not in a variable name.

## Testing Decisions

- **No DOM layer.** Consistent with v1 and v1.1 and the one-seam discipline. Testing Library, jsdom
  and Playwright are all out of scope for this increment; a ticket that wants one must raise it as its
  own ticket with an ADR, not add it in passing.
- **Every ticket names the pure function underneath it and tests that**, through the existing entry
  points: the Band partition of the Findings queue in `workingOrder`, the Judge's default pair, the
  set of Findings a per-Pass decline touches, the reopen status write and its `declineReason`
  clearing.
- **Where a ticket is genuinely copy and markup** — the glosses, the header, the accessibility
  attributes — acceptance is an explicit observable checklist the implementer states they performed,
  not a unit test written to look like coverage.
- **The ADR 0010 properties are tested** as pure assertions where they can be: `workingOrder` exposes
  every Band whatever the Pass set, and **All** is never empty of a Finding that exists.
- **The privacy test is extended**, not replaced: How this works is a new static view and its content
  is asserted the way `privacyContent` is.
- **The constitution harness is untouched.** No prompt changes in this increment.

## Out of Scope

- **Dark mode and theming.** A comfort feature, not a legibility repair, and the riskiest change on
  the list: stone colours are hard-coded in every component. v1.3.
- **Inviting the Judge once Findings are addressed.** The method's step 3 has no path pointing at it,
  which is a real gap, but the design is not obvious and it is the item closest to nannying. It wants
  its own thinking, against ADR 0009. v1.3.
- **The reader extensions and the revision meter**, deferred to v1.2 by the v1.1 spec. They are a
  different axis — more analysis — from this increment, which is about reaching the analysis that
  exists. They move to v1.3.
- **A DOM or browser test layer.**
- **Any Dexie schema change.**
- **Any generation.** Unchanged: the findings schema has no field for prose and no affordance inserts
  model-derived text.

## Further Notes

This increment closes §5.3 of `docs/llm-writing-method-audit.md` — the last unimplemented
recommendation from that audit — by way of stories 179–182. §5.1 and §5.2 closed in v1.1.

The audit's §7.3 argued that Working order was high leverage because it changes what the Writer
attends to. v1.1 implemented it as a label. This increment is the argument that a label does not
change what anyone attends to.
