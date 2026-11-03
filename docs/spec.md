# Obelus — current specification

This is the requirement for the simplified product. Earlier specs (`docs/archive/specs/`) describe
versions that no longer ship; where they disagree with this file, this file is the requirement.

## 1. What Obelus is

Obelus is a browser-only writing tool. The writer writes; Obelus marks problems in the prose and
leaves the rewriting to the writer. It is a copyeditor and a judge, never a ghostwriter.

The product is deliberately small: one writing surface, one findings rail, one optional Judge, a
Library and a Settings page.

## 2. Invariants

These are structural, not prompt-level promises.

1. **No model output enters the document.** The findings schema has no field for rewritten prose, and
   the UI has no apply, accept or insert control for model-derived text. The writer's keyboard is
   the only path by which words enter a document.
2. **No praise.** The prompts forbid it, a client-side linter catches it anyway, and praise is struck
   through rather than hidden.
3. **Every request leaves from the writer's browser**, to the provider the writer configured. The
   Worker serves the app and security headers only; it has no provider route.
4. **Local-first data.** Documents, revisions, findings, passes, connections and settings live in
   IndexedDB. There is no account, sync or telemetry.
5. **One seam.** `send(ModelRequest) -> Promise<string>` is the only test seam; `critique` and
   `judge` are the entry points above it, and provider differences live below it.

## 3. The Starter pack

Six passes ship. The pack is the read-only default; the writer's edits to the rule word lists are
persisted.

### Rule passes — run on save, offline, no API key

| id | Name | What it flags |
|---|---|---|
| `hedges` | Hedges and intensifiers | Words that soften a claim |
| `wordiness` | Wordy constructions | Phrases with a shorter equivalent |
| `repetition` | Repeated words and openers | Words and sentence openers repeated too close together |

All three are document-scope, findings-output and enabled. Their word lists are editable in
Settings. There are no per-pass toggles.

### Model passes — run only from Review, on the paragraph at the cursor

| id | Name | What it flags |
|---|---|---|
| `paragraph-unity` | Paragraph unity | A paragraph carrying more than one idea |
| `cut-candidates` | Cut candidates | Sentences that could be cut without loss |
| `claim-strength` | Claim strength | Hedged claims and confidence the paragraph cannot support |

All three are paragraph-scope, findings-output and enabled. Their prompts are fixed in the
repository. Review runs them one after another and adds their findings to the same rail.

## 4. The loop

1. The writer types. Saves are debounced, and a `pagehide` save protects the last edits. The
   Document menu starts a new Document, imports or exports Markdown, and flags a version.
2. The three rule passes run on save. Their findings are reconciled against the stored set.
3. The writer presses **Review**. The three model passes run on the paragraph at the cursor. While
   they run, the same control offers **Cancel**; a cancelled run stores nothing. A failure is
   surfaced verbatim in a banner above the page.
4. The findings rail lists every finding in document order, with the pass name on the row. `j`/`k`
   step through open findings, `a` addresses, `x` declines. Clicking a mark in the prose opens the
   callout with the same verdicts. **Clear** moves every open finding out of the queue in one
   action; they join the closed findings behind **Show closed**, where any can be reopened.
5. The writer may flag a version from the Document menu. **Compare** opens the Judge for the current
   section, or the selected span. The Judge makes two calls with the labels swapped and reports
   `Unstable` when they disagree.

## 5. Screens

### Editor

The last opened document opens here. The page carries the title, the prose, a quiet word count, and
the findings rail. The first run shows one dismissible note; there is no separate empty-state note.
The Outline appears in the left margin at 1440px and wider. The header carries the Document menu
(New document, Flag this version, Import and Export Markdown) and a **Findings** control that opens
or closes the rail, so closing the rail never strands the writer.

### Library

A flat list of every document in this browser, newest edited first. Search covers titles and body
text. The writer can create a document, open one, delete one after an explicit confirmation, back up
the whole library, restore from a backup, or import a document bundle. There are no tags, status
fields or per-document bundle exports.

### Settings

- **Connections** — provider cards, keys, base URLs, and the Critic and Judge slots.
- **Rules** — the three rule passes' word lists and a Restore defaults action.
- **Appearance** — Light, Dark or System.
- **Help** — the two rules, the loop, the shortcuts, privacy and the local-Ollama note.

There is no Workbench, no AI Guide, no per-run tuning, no Voice list, no Screening-frame toggle, no
character-limit field, no price table, no raw-response toggle and no calibration prediction.

## 6. Data and old versions

The Dexie schema remains at version 8. Tables for the removed features — `readerAccounts`,
`auditAccounts`, `runResponses` — remain in the schema but are no longer read or written. Keeping
them avoids a destructive migration and leaves an old library intact.

On load, only passes whose ids are in the Starter pack are used. A stored pass outside the pack is
left in place but ignored, so a removed pass cannot keep running. A stored pack pass with an output
shape this build cannot run is still refused rather than silently coerced.

A document's `tags` and `status` fields remain in storage, without UI, so a later save does not
discard them. Backups and restores continue to carry all stores. **Backups never include API keys.**

## 7. Providers

OpenAI, Anthropic, Google Gemini, OpenRouter, local Ollama and Custom endpoints are supported through
the Connection table and the `openai-shaped`, `anthropic-shaped` and `gemini-native` adapters. A local
Ollama daemon must allow the app's origin; see `docs/ollama.md`. Ollama Cloud models work through the
local daemon with `ollama signin`.

## 8. Non-goals

- No Audit or Reader accounts.
- No pass workbench or prompt-authoring assistant.
- No metrics panel, cost estimates, price table or session total.
- No raw provider response view.
- No Voice list.
- No bands, rail modes or Working-order navigation.
- No tags, document status or per-document bundle export.
- No server-side provider route, account, sync or telemetry.

## 9. Verification

- `pnpm run typecheck`, `pnpm test`, `pnpm run gates` and `pnpm run build` pass.
- The constitution harness passes with the three surviving model passes and the Judge.
- The app opens on the last document; three destinations; one first-run note.
- Review runs only from the status line, on the current paragraph; a failure is visible and a run
  can be cancelled.
- The findings rail is one flat list; the callout works; `j`/`k`/`a`/`x` work; Clear empties the
  queue and the cleared findings stay closed after the next save.
- The header opens the rail after it is closed; the Library deletes a document only after a second,
  explicit confirmation.
- Compare opens the Judge; the swapped double call runs.
- Settings has Connections, Rules, Appearance and Help.
- Library has search, backup/restore and bundle import.
- No apply/accept/insert affordance exists; no model text can enter the editor.
- Old data is still present but invisible; old passes do not run.
