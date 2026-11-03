# Obelus — decisions

The load-bearing decisions, in one page. Earlier ADRs are in `docs/archive/adr/`; where one is
superseded, the superseding decision is named here.

## 1. The constitution is structural

No model output can enter the document. The findings schema has no rewrite field, and the UI has no
apply, accept or insert control. Praise is forbidden by the prompts and caught by a client-side
linter; the linter's findings are shown struck through, never hidden.

The enforcement is a schema and a source gate, not a promise in a prompt.

## 2. Provider access is browser-only

Every request leaves from the writer's browser to the provider the writer configured. There is no
server route to a provider, because a route would put a key on a server and break the privacy claim.
Ollama's browser block is accepted rather than routed around; the daemon must allow the app's origin.

The Cloudflare Worker serves static assets and security headers only. `scripts/gates/worker.mjs`
fails the build if the Worker gains a network call.

## 3. Rule passes are deterministic and free

The three rule passes run on save, offline, with no API key and no model. They are pure functions of
the canonical text and their word lists. They mark; they never rewrite. The full rule engine remains
capable of more checks, but only three ship in the Starter pack.

## 4. The Starter pack is six passes

Three rule passes (hedges, wordiness, repetition) and three paragraph-scope model passes (paragraph
unity, cut candidates, claim strength). The model passes run only from Review, on the paragraph at the
cursor. A pass the writer does not see cannot distract them.

## 5. Markdown is the interchange format

Markdown import and export stay. They are the portable path into and out of a document. The
per-document JSON bundle is no longer exported; the importer remains so files already produced still
open.

## 6. The rail is a flat findings list

Findings are listed in document order, with the pass name on the row. The old Working-order bands and
the Findings/Judge rail modes are gone. `j`/`k`/`a`/`x` work the open queue; addressed and declined
findings sit behind a "Show closed" toggle so the queue stays quiet.

This supersedes `docs/archive/adr/0010-the-working-order-is-the-navigation.md`.

## 7. The Judge is on demand

The Judge is opened from the status line's **Compare** action. It compares the current section, or the
selection when there is one, and makes two calls with the labels swapped. A verdict that flips is
reported as `Unstable` rather than as a preference. The calibration prediction is gone.

This supersedes `docs/archive/adr/0012-the-judge-is-a-rail-mode.md`.

## 8. No migration for this simplification

Removing features leaves old IndexedDB rows in place: the `readerAccounts`, `auditAccounts` and
`runResponses` tables stay in the schema, and a document's `tags` and `status` fields stay in the
record. The app stops reading them. This avoids a destructive Dexie migration and leaves an old
library intact.

On load, only passes in the Starter pack are used. A stored pass outside it is ignored, so it cannot
keep running, and the writer is not locked out by an output shape this build no longer runs.

## 9. The lab is removed

Audit, Reader accounts, the Pass workbench, the prompt-authoring assistant, metrics, cost estimates,
the price table, raw-response inspection, the Voice list, the Screening-frame toggle, the
character-limit field and calibration are removed. They were useful experiments; none is part of the
daily writing loop, and each cost a surface, a setting or a store.

Supersedes `docs/archive/adr/0007-audit-is-its-own-surface.md`.

## 10. Three destinations

Editor, Library and Settings. Help and Privacy are sections inside Settings. There is no Workbench,
Help or Privacy destination, and no "Back to..." state.

## 11. The writer's data is never silently discarded

A backup never includes API keys. A restore replaces the library behind an explicit confirmation. A
document's old tags and status are kept in storage even though the UI no longer shows them. Old pass
rows are kept and ignored rather than deleted.

Clearing findings addresses them rather than deleting them, so a cleared queue is recoverable from
Show closed and a later Run does not raise the same objection again. Deleting a document is the one
destructive action, and it is explicit, confirmed, and removes only the document the writer chose.

## 12. Verification

The constitution harness runs before any pass-prompt change. `pnpm run gates` keeps three build gates:
no forbidden affordance, no raw palette colour, no Worker provider route. `pnpm test` covers the
behaviour through the `send` seam; there is no DOM test layer.
