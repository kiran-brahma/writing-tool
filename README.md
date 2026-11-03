# Obelus

Obelus is a browser-only writing tool that uses language models as a copyeditor and a judge, never as a ghostwriter. It marks; it never holds the pen.

## Why I built it

I did most of my writing as a student. Around five years ago I started keeping notes in Obsidian, linking one idea to another. I never meant to publish the notes, but they became the seed for essays and posts. I rewrote those posts five or six times before publishing them.

After ChatGPT arrived, I outsourced the editing and polishing to AI. Its skill improved with every model update. Mine did not. In 2026 I stopped asking AI to write for me and started asking it only for feedback. Reading William Zinsser's *On Writing Well* made the risk plain: if an editor controls how you write, your own voice is lost.

This app is my attempt to keep the editor's eye without giving it the pen.

## What it does

- **Write** in a rich-text editor with headings, emphasis, lists and block quotes.
- **Three rule passes run on every save**, offline and with no API key: hedges and intensifiers, wordy constructions, and repeated words and openers. Their word lists are yours to edit in Settings.
- **Review** runs three model passes on the paragraph at your cursor: paragraph unity, cut candidates and claim strength. Their findings join the same rail.
- **Work the findings rail**: every finding is anchored to the exact words it concerns. `j` and `k` step through the open ones, `a` marks one addressed, `x` declines it, and clicking a mark in the prose opens a small callout.
- **Compare** two versions with the Judge. It compares the current section, or the span you selected, twice with the labels swapped. A verdict that flips is reported as unstable rather than as a preference.
- **Library**: search every document in this browser, back up the whole library, restore it, or import a document bundle.
- **Settings**: Connections, the three rule word lists, the colour scheme, and a one-page Help.

Rule passes and model passes are both analysis. No model output can enter the document: the findings schema has no rewrite field, and there is no apply, accept or insert control for model text. Praise is forbidden by the prompts, caught by a client-side linter, and struck through rather than hidden.

## What is not here

Audit, Reader accounts, the pass workbench, the prompt-authoring assistant, metrics, cost estimates, raw provider responses, voice lists, tags, document status, per-document bundle export and the old band-based rail are all gone. Seven rule passes and six model passes left the Starter pack with them; the rule engine keeps its other matchers, but only the three ship. The old data is left in IndexedDB, invisible and harmless; no migration was needed.

## Run it locally

```sh
pnpm install
pnpm run dev
```

Open <http://localhost:5173>. The app works immediately as a plain writing tool. Model passes need a Connection:

1. Open **Settings**.
2. Pick a provider, enter an API key and a model id. The model field is free text.
3. Assign one Connection to the Critic slot and a different one to the Judge slot.
4. Use **Test connection** to confirm the URL and key.

For local Ollama, see [docs/ollama.md](docs/ollama.md). Ollama refuses origins it has not been told to allow, and a proxy would break the privacy claim, so the app does not route around it.

## The loop

1. Write.
2. The three rule passes mark problems as you save. No key, no network.
3. Press **Review** when you want a closer read on the current paragraph.
4. Rewrite in your own words. Mark the finding addressed or decline it.
5. Flag a version from the Document menu, then press **Compare** to ask the Judge whether the rewrite is clearer.

## Data and privacy

Documents, revisions, findings, passes, connections and (unless you choose session-only) API keys live in this browser's IndexedDB. There is no account, no sync and no telemetry. Requests go only to the provider you configured. The Cloudflare Worker only serves the app and its security headers; it has no provider route.

**Backups never include API keys.** Keys already stored in this browser are kept on restore; keys omitted from a backup cannot be restored.

## Checks

```sh
pnpm run typecheck  # tsc -b
pnpm test           # full suite, including the constitution harness
pnpm run gates      # affordances, palette, Worker
pnpm run harness    # the constitution harness alone
pnpm run build      # gates + typecheck + Vite
```

Run the constitution harness before changing a pass prompt. It checks that model output parses, that praise is flagged, that no response carries rewritten prose, and that findings stay inside their target.

## Deploy

`wrangler.jsonc` serves `dist/` through `worker/index.ts`, which sets the Content-Security-Policy and the other security headers. Keep the Worker free of provider routes.

```sh
npx wrangler login
pnpm run deploy
```

## Documentation

- [docs/spec.md](docs/spec.md) — the current requirement.
- [docs/decisions.md](docs/decisions.md) — the load-bearing decisions and the ones this release supersedes.
- [docs/ollama.md](docs/ollama.md) — local Ollama setup.
- [CHANGELOG.md](CHANGELOG.md) — what changed in each release.
- [AGENTS.md](AGENTS.md) — build discipline for agents.
- `docs/archive/` — the earlier specs, ADRs, build order and reference notes.

## License

GPL-3.0-or-later. See `LICENSE`.
