# Obelus — agent notes

The app is **Obelus**; the repo is `writing-tool`. Obelus uses LLMs as a copyeditor and a judge,
never as a ghostwriter. It marks; it never holds the pen. Everything runs in the browser — drafts,
revisions, findings and API keys live in IndexedDB — and the only outbound requests go to the model
provider the writer configured.

## Invariants

**It marks; it never holds the pen.** Model output is analysis: findings anchored to quotes, with
praise struck through. The writer's keyboard is the only path by which words enter a document, so no
affordance inserts model-derived text (apply, accept, insert) and the findings schema carries no
rewrite field — not in the app, not in a debug build, not in a test helper. The enforcement is
structural; prompts cannot talk their way out of it.

**Every request leaves from the writer's browser,** to the provider the writer configured. A Worker
route that calls a provider is therefore the one thing that must never be added — including to work
around Ollama's browser block, which we accept rather than route around.

Reasoning for both: `DESIGN.md` §1–2.

## Read before you work

- **Design reasoning** — `DESIGN.md`. Before reopening a settled decision, or when a requirement looks
  arbitrary. It carries the *why*; the spec carries the *what*, and where they disagree the spec is
  the requirement.
- **The v1 requirement** — `docs/specs/obelus-v1.md`, published as issue #1. Before implementing or
  changing any behaviour.
- **Wire facts** — `notes/provider-api-facts.md`. On any provider, protocol, auth-header or model-id
  work. Probed live on 2026-09-19; headers and model ids drift, so re-verify rather than trusting it.
- **Vocabulary** — `CONTEXT.md`. When naming a concept in code, a test, an issue title or a commit.
  Use its terms rather than reaching for synonyms.
- **Decisions** — `docs/adr/`. Before contradicting one: surface the conflict instead of quietly
  overriding it.
- **Migrations** — `docs/migrations.md`. Before changing the Dexie schema or the database version:
  forward-only, one migration per deploy, never in the same deploy as a behaviour change.
- **Process** — `docs/agents/`. When creating or reading tickets, specs or triage state.
- **Build order** — `docs/build-order.md`. Before picking up a ticket: which one can start now, what it
delivers, and what it is waiting on.

## Build discipline

- **One seam.** `send(ModelRequest) -> Promise<string>` is the only test seam. `critique` and `judge`
  are the entry points above it; provider differences live below. IndexedDB runs against an in-memory
  implementation in test setup, and there is no DOM test layer.
- **Tests assert external behaviour** through those entry points. A test that reaches into a module's
  internals means the seam sits in the wrong place.
- **The constitution harness runs before any pass-prompt change**: three fixture documents × three
  model passes, asserting that output parses, that no un-flagged praise survives the linter, that no
  rewrite field appears, and that findings anchor inside their scope.
- **Rule passes stay rules.** Free, deterministic, constitution-safe by construction.
- **Stage order** — spec §Build order. Each stage ends usable, and Stage 2 makes the tool useful with
  no API key at all.

## Before you say done

- Every user story you touched is observable in the app, not only in a passing unit test.
- New behaviour has a test through the seam; a prompt change has a harness run.
- No affordance was added that inserts model-derived text.
- Names match `CONTEXT.md`, and a genuinely new term is flagged for `/domain-modeling`.

## Agent skills

### Issue tracker

GitHub Issues (`kiran-brahma/writing-tool`) is canonical; a read-only markdown mirror lives in `.scratch/issues/`. See `docs/agents/issue-tracker.md`.

### Specs

Specs are files in `docs/specs/` (canonical, git-tracked) published as GitHub issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
