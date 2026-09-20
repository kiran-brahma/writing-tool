# Migration policy

Obelus's Library is one IndexedDB database, and the schema it stores is versioned. This document is the
policy every change to that schema follows. It implements the spec's storage and durability decisions
(`docs/specs/obelus-v1.md`) and the operational rules in `docs/decisions/obelus-v1-goldilocks.md`.
Read it before changing anything in `src/storage/obelusDatabase.ts`.

## Forward-only and versioned

- A schema change is a **new Dexie version** added above the last one in `src/storage/obelusDatabase.ts`.
  An existing version is never edited or renumbered, because a browser that already ran it would not
  re-run it. `OBELUS_DATABASE_VERSION` is the running code's required version.
- Migrations are **forward-only**. There is no down-migration, because the code that would run it is
  exactly the code you are trying to leave behind.
- Prefer an **additive** migration: a new store or a new index, with existing records left untouched.
  A new field on an existing record is read through a normalizer with a default (see
  `normalizeDocument` in `src/storage/documents.ts`), so it needs no migration at all.
- One migration per deploy. Ship it alone, confirm the Library opened, then ship behaviour that
  depends on it.

## A newer database refuses to open

A database whose schema is newer than the running code refuses to open. `openObelusDatabase` reads the
native IndexedDB version *before* Dexie touches the database, and throws `NewerDatabaseError` when it
is higher than `OBELUS_DATABASE_VERSION`. The shell shows that error's message on the "Obelus could
not open your Library" screen.

There is **no destructive fallback**. Obelus never deletes and recreates the database, never upgrades
it downward, and never writes to a database it refused. The Writer is told to open the newest version
of Obelus or restore a backup. This is story 116: a stale deployment — an old service-worker shell, a
rolled-back Worker — must not risk the Library.

## One migration per deploy, never with a behaviour change

**A migration is not rollback-safe.** `wrangler rollback` restores the Worker and its assets, but it
cannot reverse a schema change already applied in the Writer's browser: the old code would then meet a
database it does not understand, and the refuge above (refuse and say so) would leave the Writer
locked out until forward code returns. The rule is therefore:

> Never ship a migration and a behaviour change in the same deploy. Ship the migration alone, behind a
> backup reminder, and ship the behaviour that uses it in the next deploy.

Rolling back a deploy that shipped **no** migration is safe once the service worker is forced to
advance. `public/sw.js` calls `skipWaiting()` and `clients.claim()` so the rolled-back shell reaches
the Writer immediately, and it prunes superseded hashed assets on activation and on every successful
navigation so the cache tracks the current deploy rather than growing without bound. If a migration
did ship, a rollback is a Library outage until forward code returns.

## What enforces it

- `src/storage/obelusDatabase.ts` — the versions and `openObelusDatabase`'s refusal.
- `src/storage/obelusDatabase.test.ts` — an upgrade path from every prior version with existing data
  intact, and the newer-database refusal leaving the database untouched.
- `public/sw.js` — `skipWaiting`/`clients.claim`, precached hashed assets, and pruning of superseded
  assets, so offline opening and rollback both work.
- The service worker, the CSP header and offline opening are **deploy-time properties**: the
  in-memory IndexedDB tests prove the logic, not quota, eviction or a partial migration. Verify those
  in a real browser.
