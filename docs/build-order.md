# Build order — Obelus v1

**This file is the sequence. GitHub is the graph.**

Issue numbers cannot be changed: GitHub assigns them in creation order and never reuses one, so
recreating the tickets would produce #25 upward and throw away the local mirror for nothing. The
numbers therefore do not follow the work order, and this document is where the order lives.

GitHub remains the source of truth for *what blocks what*, because that is what the tracker enforces.
Regenerate the graph whenever a ticket closes:

```sh
for n in $(gh issue list --state open --json number --jq '.[].number' | grep -v '^1$' | sort -n); do
  printf "#%s %s blocked_by=%s\n" "$n" \
    "$(gh issue view "$n" --json title --jq .title)" \
    "$(gh api "repos/kiran-brahma/writing-tool/issues/$n" --jq .issue_dependencies_summary.blocked_by)"
done
```

The sequence below is a topological sort of that graph, so it is safe to walk top to bottom.

## Where we are

**#2 Toolchain and shell**, **#13 Document and its text**, **#14 Marking the prose** and **#15
Working the queue** are closed. The Document of record lives in IndexedDB, the rich-text editor is
live, `canonicalText` is the one coordinate system, and auto- and flagged Revisions are taken.
Rule-pass Findings are marked and highlighted, the Writer works the queue with `j`/`k`/`a`/`x`,
a declined Finding stays declined on the next Run, and the Document imports from and exports to
Markdown. The wire is open: #3 landed Connections with all prefills and Custom, both key modes,
`send`, the Protocol table, the `openai-shaped` adapter, the fixture player, test connection, model
listing, retry, the concurrency cap and the base-URL privacy assertion, and #17 added the
`anthropic-shaped` and `gemini-native` adapters. #4 (Constitution core) landed the first model Pass
end to end: the findings schema with no field for rewritten prose, the tolerant parser, Containment
with its dropped-anchor count, the raw-response toggle, `promptHash` and the Screening frame toggle.
#24 (When the model misbehaves), #18 (Constitution harness), #16 (Run control) and #19 (Starter
passes) have since landed: model drift is linted and struck through, the harness guards the prompts,
Runs are cached, estimated, cancellable and honest about an unreadable auth failure, and the
paragraph-scope Starter model pack is complete. #5 (Anchor survival) has landed: `resolveAnchor`
diff-projects an Anchor from its provenance Revision, falls back to quote match, then reports
Orphaned; re-resolution runs on every Document change, persists `anchor.state`, and reconciliation
shares the one coordinate system. #9 (Judge) has landed: the Writer compares any two Revisions,
sees the word-level diff and both extracted passages before anything is sent, and receives a Verdict
from the swapped double call — or an Unstable result when the labels flip — with a different
Provider and model from the Critic by default. #7 (Structure) has landed: the Section model carries
its heading level, the Outline is derived from the headings and jumpable, document-scope model
Passes receive the whole Document, the topic-strings and paragraph-reorder passes ship in the
Starter pack, and the Writer runs the structural set in one action. #20 (Chunking and limits) has
landed: a document-scope Run past the character limit is chunked Section by Section with overlap,
the limit is an editable setting with a warning, and the Run reports its chunk count. #11 (Reader
pass) has landed: a section-scope Reader pass returns a Reader account — what a Section says, what a
distracted reader would miss, and the gap between the two — one model call per Section, stored as
its own output shape and shown in its own Reader accounts tab, never mixed with Findings. #8
(Library) has landed: many Documents, the auto-created Scratchpad, tags and tag filtering, search
over title and body text, Document status, and the open-Finding count; the one-Document app is now
a flat Library. #12 (Durability) has landed: the whole Library backs up to one file and restores
back behind an explicit confirmation, API keys are excluded unless the Writer opts in, a visible
last-backed-up reminder sits on the Library screen, and a single Document exports and imports as a
bundle carrying its Revisions, Findings, Run results and Reader accounts. #23 (Offline shell and
migration policy) has landed: a production service worker and manifest cache the shell so the app
opens with the Library offline, `navigator.storage.persist()` is requested on the first save, and
`docs/migrations.md` states the forward-only, newer-database-refusal, no-migration-with-a-behaviour-
change policy. #22 (Privacy page) has landed: a plain-language page explains what happens to the
Writer's words, where Documents and keys live, which claim the CSP header enforces (`script-src
'self'`) rather than the code path (requests go only to the configured Connection), and the
verify-it-yourself steps in DevTools. #10 (Workbench) and #21 (Prompt authoring assistant) have
since landed: the Writer writes and edits their own Pass prompts with placeholder validation and the
fixed scope and output shapes, edits Rule config, round-trips the Pass set as JSON and restores the
Starter pack, and can ask a model to draft a Pass prompt — assistance that reaches a Pass record and
never the prose. **Every v1 and v1.1 ticket has landed**, and issues #1 and #25 are both closed.
#16's migration 7 (`runCache`) is its own commit, ahead of the
Run-cache behaviour, so it can ship alone as `docs/migrations.md` requires: deploy the migration
commit first, then the behaviour that uses the store.

**v1.2 is the open frontier.** The spec is #34 and the sequence is the v1.2 table below. Its subject
is the surface rather than the analysis: v1.1 made the tool recommend, and v1.2 makes the
recommendation reachable. #35 (The Working order rail) has landed: the rail's top-level control is
the Band — Structure, Paragraph, Word — plus All, a Band shows its Passes together with the Findings
those Passes produced, the Judge is its own destination, the three-tab strip is gone, and the rail
remembers its Band and collapses. #36 and #37 are now the tickets with no blocker; #38–#44 wait on
#35, which is closed.

## How to work a ticket

- **A ticket can start the moment every ticket in its Blocked-by is closed.** Do not begin a blocked
  ticket because it looks interesting.
- One ticket per fresh context. State which ticket and which stories it covers before writing code.
- If the ticket leaves a business rule ambiguous, **stop and ask**. A guessed rule compiles, passes
  review and is wrong.
- `code-review` before any ticket is called ready; `thermos` first if the change is major.
- Run the constitution harness (row 9) before changing any pass prompt.

## The order

| Step | # | Ticket | What it makes work |
|---|---|---|---|
| 1 | **#13** | Document and its text | TipTap authoring; the Document persisted on a short debounce plus `pagehide`; Dexie migration 1 with the newer-database refusal; `canonicalText`; auto- and flagged Revisions | - Completed
| 2 | **#14** | Marking the prose | One rule pass (hedges) auto-run on save; the Finding shape; the attached Anchor; a Highlight; the sidebar grouped by Pass | - Completed
| 3 | **#15** | Working the queue | Statuses with `declineReason`; `j`/`k`/`a`/`x`; a declined Finding staying declined; Markdown in and out | - Completed
| 4 | **#6** | Rule engine | Every rule pass, editable Rule config, auto-run on save, the metrics panel — the free tier, complete | - Completed
| 5 | **#3** | Connection and the seam | Connections with all prefills and Custom, both key modes, `send`, the Protocol table, the `openai-shaped` adapter, the fixture player, test connection, model listing, retry, concurrency cap, the base-URL privacy assertion | - Completed
| 6 | **#17** | Anthropic and Gemini Protocols | The `anthropic-shaped` and `gemini-native` adapters — one Pass, three Protocols | - Completed
| 7 | **#4** | Constitution core | Findings schema, tolerant parser, Containment, one paragraph-scope model Pass end to end, raw-response toggle, `promptHash`, Screening frame toggle | - Completed
| 8 | **#24** | When the model misbehaves | The praise linter over every returned string, Praise struck through rather than removed, `declineReason: "violation"`, the quarantined rewrite pane, the static affordance source check | - Completed
| 9 | **#18** | Constitution harness | Three fixture Documents × three model Passes, runnable before any prompt change, timestamped | - Completed
| 10 | **#16** | Run control | The Run cache with `promptHash`, the cost estimate and session total, cancelling, and the error paths including the unreadable auth failure | - Completed

| 11 | **#19** | Starter passes | The five remaining paragraph-scope Starter model passes | - Completed

| 12 | **#5** | Anchor survival | Diff-projection from `provenance.revisionId`, quote fallback, tie-break, Orphaned, `projectInterval` | - Completed
| 13 | **#9** | Judge | Any two Revisions, word-level diff, extraction preview, the swapped double call, `Unstable`, the same-model warning | - Completed
| 14 | **#7** | Structure | The Section model from headings, the outline, document-scope model Passes | - Completed
| 15 | **#20** | Chunking and limits | The character limit, the warning, section-by-section chunking with overlap, the too-long path | - Completed
| 16 | **#11** | Reader pass | The reader account schema and the Reader tab | - Completed
| 17 | **#8** | Library | Many Documents, the Scratchpad, tags, search, Document status, the open-Finding count | - Completed
| 18 | **#12** | Durability | Library backup with keys excluded and explicit opt-in, import, the last-backed-up indicator, the single-Document bundle | - Completed
| 19 | **#23** | Offline shell and migration policy | Service worker and offline shell, `storage.persist()`, the forward-only migration policy, the no-migration-with-a-behaviour-change rule | - Completed
| 20 | **#22** | Privacy page | The plain-language page and the verify-this-yourself steps | - Completed
| 21 | **#10** | Workbench | Pass editor with placeholder validation and output shapes, Rule config editor, pass-set JSON round trip, Starter-pack restore | - Completed
| 22 | **#21** | Prompt authoring assistant | The assistant that helps author passes and never touches prose | - Completed

Steps 9 and 10 may swap: both are blocked only by row 7.

## The order — v1.2

Parent: **#34**, `docs/specs/obelus-v1.2.md`. The decision is
`docs/adr/0010-the-working-order-is-the-navigation.md`.

v1.1 made the tool recommend. v1.2 makes the recommendation reachable: the Working order stops being
a caption over a panel and becomes the thing the Writer navigates. Every ticket here is surface work;
no prompt changes, no schema changes, and **no Dexie migration** — the three new settings go into the
existing key-value store, so `docs/migrations.md` does not bind this increment.

Three waves. Nothing inside a wave blocks anything else inside it, so a wave can be worked in
parallel.

| Step | # | Ticket | Blocked by | What it makes work |
|---|---|---|---|---|
| 23 | **#35** | The Working order rail | — | The Band is the navigation: Structure, Paragraph, Word, All; a Band shows its Passes and their Findings in one view; the Judge is its own destination; the three-tab strip is gone; the rail remembers its Band and collapses | - Completed
| 24 | **#36** | How this works, and first run | — | A permanent page carrying Rule 1, Rule 2, the loop, the terms and the shortcuts; a dismissible first-run note; an empty Scratchpad that says what to do |
| 25 | **#37** | The Judge's default pair | — | The default comparison is the last flagged Revision against now, not two autosaves |
| 26 | **#38** | The Current Finding | #35 | Selecting a Finding scrolls the prose to it and distinguishes its Highlight |
| 27 | **#39** | Reaching the queue from the prose | #35 | A modifier shortcut that steps the queue while typing; a hint bar that tells the truth; `?` |
| 28 | **#40** | Decline the rest, and reopen | #35 | Declining a whole Pass in one action, and the first path back to `open` — closes audit §5.3 |
| 29 | **#41** | Plain-language glosses | #35, #36 | Every panel explains its own nouns once, linking into How this works |
| 30 | **#42** | Accessibility | #35 | Tab-panel linkage, an announced Run result, 4.5:1 contrast, no text under 12px |
| 31 | **#43** | What a Run will cost | #35 | The estimate beside the control that spends, and a summed estimate for the structural set |
| 32 | **#44** | Header and navigation | #36 | Persistent navigation over six destinations; document actions separated; the three "Back to the Editor" buttons and their state deleted |

**Why this order.** #35 restructures nearly every file the other nine touch, so it lands before the
tickets that decorate it — otherwise an AFK agent resolves conflicts it cannot see. #36 is in the
first wave rather than beside #44 because the header ticket needs the fourth destination to exist
before it can arrange it. #37 is unblocked because its change is internal to `JudgePanel`'s state
defaults even though #35 relocates the panel.

**The standing constraints**, in every ticket body: no affordance that inserts model-derived text; a
recommendation, never a gate (ADR 0009, and the four properties in ADR 0010); `CONTEXT.md` terms only
and **"stage" is banned**; name the pure function and test it through the seam; **no DOM test layer**
— a ticket that wants Testing Library, jsdom or Playwright must raise it as its own ticket with an
ADR rather than adding one in passing.

**#2 (Toolchain and shell)** has no row because it is the order's foundation rather than a step in
it: the Vite/React/TypeScript toolchain, the test runner, the gates, the in-memory IndexedDB setup
and the deployed shell with its CSP. It is closed.

## Why this order

**The offline loop completes at step 3.** After #15 — with no API key, no Connection and no network — a
Writer can draft, see mechanical problems marked, work the queue, and export. That is ADR-0003's whole
point, and it is worth having early because it is the only part of the product that still works when
everything else fails.

The free tier then completes (step 4), the wire opens (5–6), the constitution lands (7–8), the
harness guards it (9), and the Judge follows (12–13) — the riskiest and most novel machinery before
the breadth.

**Critical path:** steps 1 → 2 → 3 → 5 → 7 → 14 → 21 → 22. Everything else is off it, which is why
the order is not fragile: any ticket may move earlier the moment its own blockers close.

## Running several agents at once

The graph has seven independent waves:

- **Wave 1:** #13
- **Wave 2:** #14, #3, #8
- **Wave 3:** #15, #6, #17, #12, #22
- **Wave 4:** #4, #23
- **Wave 5:** #24, #16, #18, #19, #5, #7
- **Wave 6:** #9, #10, #11, #20
- **Wave 7:** #21

## Two questions, both settled

Both were closed by completing the order, and the reasoning is kept because it is why the order was
shaped this way.

**#5's edge on #4 was kept.** #5 is blocked by #4 and #14, but only #14 is needed to exercise
re-location — #14's rule-pass Findings already give it Anchors. Dropping the #4 edge would have moved
the highest-risk behaviour in the design from step 12 to step 5, seven steps earlier, which is where
the Goldilocks review wanted it. It was not dropped; the work landed in the order the table shows.

**#4 was split once.** The praise linter, the struck-through display, the quarantined rewrite and the
affordance source check moved to #24, and #4 did not overflow again.

## Coverage

Every one of the 117 user stories in the spec is cited by at least one ticket. Where two tickets cite
the same story, the split is deliberate and stated in both.

## v1.1 — the Audit and the recommendation mechanics

The increment is `docs/specs/obelus-v1.1.md`; its stories are numbered 118–159. Each slice is a
vertical tracer, and **migration 8 ships alone** ahead of the behaviour that uses it, as
`docs/migrations.md` requires. GitHub issue numbers are assigned when the round starts. Slices 1–8
have landed.

| Step | Ticket | What it makes work | Blocked by | Status |
|---|---|---|---|---|
| 1 | #26 Audit shape and store | The `audit` output shape; the `auditAccounts` table via migration 8; `note` removed from the union, the picker, the Workbench and `passSet` | — | Completed |
| 2 | #27 The Audit pass | Prompt carrying the condensed taxonomy; closed schema; tolerant parser; chunk and synthesis; the Audit surface; harness fixtures | #26 | Completed |
| 3 | #28 Rule passes | `passive` and `ai-tells`; A3 as a metric; A4 folded into `cut-candidates` or `cliche`; the default flips | — | Completed |
| 4 | #29 Metrics | Be-verb, preposition and abstract-noun densities; the Lard Factor; display-only | — | Completed |
| 5 | #30 Working order | The derived grouping and the recommended sequence | — | Completed |
| 6 | #31 Voice list | The `voiceList` setting; rule silence; model prompt injection; the annotating post-filter | #28 | Completed |
| 7 | #32 Frames | The `Pass.frame` field; Skimmer, Skeptic, Practitioner; the Audit and Reader exempt | — | Completed |
| 8 | #33 Judge calibration | The session-only prediction shown beside the Verdict | — | Completed |

Steps 1 and 2 are the critical path: slice 2 cannot start until the `audit` shape and its store
are settled, or a fresh context window invents a second coordinate system for the account. Steps 3–8
are independent of each other once the shape lands, and 6 needs the rule passes from 3 to have
something to silence.
