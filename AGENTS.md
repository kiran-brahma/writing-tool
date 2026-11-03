# Obelus — agent notes

Obelus is a browser-only writing tool. A model may mark the prose and judge a rewrite; it may never
write into the document. The repository is deliberately small: one writing surface, one findings rail,
one optional Judge, a Library and a Settings page.

## Invariants

1. **It marks; it never holds the pen.** The findings schema has no rewrite field, and the UI has no
   apply, accept or insert control for model-derived text. The writer's keyboard is the only way
   words enter a document. `scripts/gates/affordances.mjs` is a build gate; `src/useDocument.ts` and
   the `send` seam are the behavioural boundary.
2. **No praise.** Prompts forbid it, a client-side linter catches it, and praise is shown struck
   through. Do not hide it.
3. **Every request leaves from the writer's browser** to the provider the writer configured. Never add
   a Worker route that calls a provider, including to work around Ollama's browser block. `worker/`
   is assets and security headers only; `scripts/gates/worker.mjs` enforces it.
4. **Local-first.** Documents, revisions, findings, passes, connections and settings live in
   IndexedDB. No account, sync or telemetry.
5. **One seam.** `send(ModelRequest) -> Promise<string>` in `src/wire/transport.ts` is the only test
   seam. `critique` and `judge` are the entry points above it. Tests assert external behaviour through
   those entry points; there is no DOM test layer.

## Read before you work

- `docs/spec.md` — the current requirement. It is short; read all of it.
- `docs/decisions.md` — the load-bearing decisions and the superseded ones.
- `CONTEXT.md` and `DESIGN.md` are archived in `docs/archive/`; use `docs/spec.md` for the current
  shape.
- `docs/ollama.md` for local Ollama setup.
- `CHANGELOG.md` — add a line under `## [Unreleased]` for anything a writer would notice.

## Commands

```sh
pnpm run dev        # Vite
pnpm test           # full suite, including the constitution harness
pnpm run typecheck  # tsc -b
pnpm run gates      # affordances, palette, Worker
pnpm run harness    # the constitution harness alone
pnpm run build      # gates + typecheck + Vite
```

Run the constitution harness before changing any pass prompt. It checks that output parses, praise is
flagged, no rewrite survives, and findings stay inside their target.

## Database

The schema is Dexie version 8 and this release adds no migration. Tables for removed features
(`readerAccounts`, `auditAccounts`, `runResponses`) remain in the schema but are not read or written.
A document's `tags` and `status` fields remain in storage without UI. Do not drop a store or field
without a forward-only migration, one per deploy, never in the same deploy as the behaviour change.

On load, only passes in the Starter pack are used; a stored pass outside it is ignored. If you change
the pack, update `src/core/starterPasses.ts` and the harness together, and keep the load path's filter
so an old row cannot keep running or lock the writer out.

## Before you say done

- New behaviour has a test through the seam; a prompt change has a harness run.
- No affordance was added that inserts model-derived text.
- `pnpm test`, `pnpm run typecheck`, `pnpm run gates` and `pnpm run build` pass.
- A writer-visible change has its `CHANGELOG.md` line.
- Names match `docs/decisions.md` and the current spec. "Pass" is internal; the UI says Rules and
  Review.
