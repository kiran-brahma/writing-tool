# Build order — Obelus v1

The order to work the v1 tickets in, so nobody has to read 22 tickets out of the tracker to find out
what can start next. **GitHub is the source of truth for the graph**; this table is a derived snapshot.
Regenerate it whenever a ticket closes:

```sh
for n in $(gh issue list --state open --json number --jq '.[].number' | grep -v '^1$' | sort -n); do
  printf "#%s %s blocked_by=%s\n" "$n" \
    "$(gh issue view "$n" --json title --jq .title)" \
    "$(gh api "repos/kiran-brahma/writing-tool/issues/$n" --jq .issue_dependencies_summary.blocked_by)"
done
```

## Where we are

**#2 Toolchain and shell** is closed. The build, the test runner, the in-memory IndexedDB setup,
`scripts/agent-gates check`, the pre-commit hook, and the Workers deploy with CSP all landed, so
AGENTS.md's two build-discipline rules are enforceable from here on.

The frontier is **#13**. Nothing else can start.

## How to work a ticket

- **A ticket can start the moment every ticket in its Blocked-by is closed.** That is the whole rule;
  it is what the graph exists for. Do not begin a blocked ticket because it looks interesting.
- One ticket per fresh context. State which ticket and which stories it covers before writing code.
- If the ticket leaves a business rule ambiguous, **stop and ask**. A guessed rule compiles, passes
  review and is wrong.
- `code-review` before any ticket is called ready; `thermos` first if the change is major.
- Run the constitution harness (#18, once it exists) before changing any pass prompt.

## The order

A single-agent sequence. Every Blocked-by is satisfied by the time the row is reached, so this list is
safe to walk top to bottom.

| Order | # | Ticket | What it makes work |
|---|---|---|---|
| 1 | **#13** | Document and its text | TipTap authoring; the Document persisted on a short debounce plus `pagehide`; Dexie migration 1 with the newer-database refusal; `canonicalText`; auto- and flagged Revisions |
| 2 | **#14** | Marking the prose | One rule pass (hedges) auto-run on save; the Finding shape; the attached Anchor; a Highlight; the sidebar grouped by Pass |
| 3 | **#15** | Working the queue | Statuses with `declineReason`; `j`/`k`/`a`/`x`; a declined Finding staying declined; Markdown in and out |
| 4 | **#6** | Rule engine | Every rule pass, editable Rule config, auto-run on save, the metrics panel — the free tier, complete |
| 5 | **#3** | Connection and the seam | Connections with all prefills and Custom, both key modes, `send`, the Protocol table, the `openai-shaped` adapter, the fixture player, test connection, model listing, retry, concurrency cap, the base-URL privacy assertion |
| 6 | **#17** | Anthropic and Gemini Protocols | The `anthropic-shaped` and `gemini-native` adapters — one Pass, three Protocols |
| 7 | **#4** | Constitution core | Findings schema, tolerant parser, praise linter, Containment, one paragraph-scope model Pass end to end, raw-response toggle, quarantined rewrite pane, affordance source check, Screening frame toggle |
| 8 | **#16** | Run control | The Run cache with `promptHash`, the cost estimate and session total, cancelling, and the error paths including the unreadable auth failure |
| 9 | **#18** | Constitution harness | Three fixture Documents × three model Passes, runnable before any prompt change, timestamped |
| 10 | **#19** | Starter passes | The five remaining paragraph-scope Starter model passes |
| 11 | **#5** | Anchor survival | Diff-projection from `provenance.revisionId`, quote fallback, tie-break, Orphaned, `projectInterval` |
| 12 | **#9** | Judge | Any two Revisions, word-level diff, extraction preview, the swapped double call, `Unstable`, the same-model warning |
| 13 | **#7** | Structure | The Section model from headings, the outline, document-scope model Passes |
| 14 | **#20** | Chunking and limits | The character limit, the warning, section-by-section chunking with overlap, the too-long path |
| 15 | **#11** | Reader pass | The reader account schema and the Reader tab |
| 16 | **#8** | Library | Many Documents, the Scratchpad, tags, search, Document status, the open-Finding count |
| 17 | **#12** | Durability | Library backup with keys excluded and explicit opt-in, import, the last-backed-up indicator, the single-Document bundle |
| 18 | **#23** | Offline shell and migration policy | Service worker and offline shell, `storage.persist()`, the forward-only migration policy, the no-migration-with-a-behaviour-change rule |
| 19 | **#22** | Privacy page | The plain-language page and the verify-this-yourself steps |
| 20 | **#10** | Workbench | Pass editor with placeholder validation and output shapes, Rule config editor, pass-set JSON round trip, Starter-pack restore |
| 21 | **#21** | Prompt authoring assistant | The assistant that helps author passes and never touches prose |

### Why this order

**The offline loop completes at row 3.** After #15 — with no API key, no Connection and no network —
a Writer can draft, see mechanical problems marked, work the queue, and export. That is ADR-0003's
whole point, and it is worth having early because it is the only part of the product that works when
everything else fails.

Then the free tier is finished (row 4), the wire is opened (rows 5–6), the constitution lands
(rows 7–10), and the Judge follows (rows 11–12) — the riskiest and most novel machinery before the
breadth.

**The critical path is rows 1 → 2 → 3 → 5 → 7 → 13 → 20 → 21.** Everything else is off it, which means
the order is not fragile: any ticket may move earlier once its own blockers are closed.

### Running several agents in parallel

The graph has 7 independent waves. If more than one agent is working, these sets can run concurrently:

- **Wave 1:** #13
- **Wave 2:** #14, #3, #8
- **Wave 3:** #15, #6, #17, #12, #22
- **Wave 4:** #4, #23
- **Wave 5:** #5, #7, #16, #18, #19
- **Wave 6:** #9, #10, #11, #20
- **Wave 7:** #21

## Notes for whoever picks these up

**#4 is the heaviest remaining ticket.** Schema, tolerant parser, praise linter, Containment, a full
model Pass end to end, the raw-response toggle, the quarantined rewrite pane, the source check and the
Screening frame toggle. It has already been split once. If any ticket overflows a context window, it
will be this one — and the right response is another split, not a longer run.

**#5 has one edge that may be removable.** It is blocked by #4 and #14, but only #14 is needed to
exercise re-location — the rule-pass Findings from #14 already give it Anchors to re-locate. Dropping
the #4 edge would move the highest-risk behaviour in the design from row 11 to row 4, six tickets
earlier, which is where the Goldilocks review wanted it. Decide this deliberately rather than by
default.

**Coverage is complete.** Every one of the 117 user stories in the spec is cited by at least one
ticket. Where two tickets cite the same story, the split is deliberate and stated in both.
