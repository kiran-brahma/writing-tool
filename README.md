# Obelus

Obelus is a browser-only writing tool that uses language models as a copyeditor and a judge, never as a ghostwriter. It marks; it never holds the pen.

You write in a rich-text editor. Rule-based passes run on every save and cost nothing. Model passes run on demand and return findings anchored to the exact text they concern. You rewrite in your own words. When a paragraph changes, the judge compares the old and new versions and says which is clearer. It runs twice with the labels swapped, so a verdict that flips shows up as unstable instead of being reported as a preference.

Two constraints shape the product:

- No model output can enter your document. The findings schema has no field for a rewritten sentence, and the app has no apply, accept, or insert control for model text. Your keyboard is the only path by which words enter a document.
- No praise. The prompts forbid it, a client-side linter catches it anyway, and the app shows it struck through rather than hiding it, so you can see when a prompt has drifted.

Everything runs in the browser. Documents, revisions, findings, passes, connections, and API keys live in IndexedDB. The only outbound requests go to the model provider you configure. There is no account, no sync, and no telemetry.

## What it does

- Rich-text editing with headings, emphasis, lists, and block quotes.
- Rule passes for hedges and intensifiers, nominalizations, throat-clearing openers, wordy constructions, and repeated words and openers, plus sentence-rhythm metrics. They run on save, offline, and with no API key. Their word lists and patterns are editable.
- Model passes: a starter pack of paragraph-scope and document-scope passes, each returning findings anchored to a quote. Findings are listed by pass in document order. `j` and `k` move through them, `a` marks addressed, and `x` declines.
- The judge: compare any two revisions, see the word-level diff and both extracted passages, then get a verdict from two calls with the labels swapped. The judge defaults to a different Connection and model from the critic.
- The reader pass: a per-section account of what the section says, what a distracted reader would miss, and the gap between the two, shown in its own tab.
- A library of documents with tags, search, and status; automatic and milestone revisions; a word-level diff; Markdown import and export; whole-library backup and restore; and a single-document bundle.
- An offline shell that opens with your existing documents.
- A pass workbench for writing your own prompts, with a model assistant that works on prompts and never on your prose.

## Requirements

- Node.js 22.12.0 or newer.
- A browser with IndexedDB and service worker support.
- For model passes, an API key for OpenAI, Anthropic, Google Gemini, or OpenRouter, or a local Ollama install. Rule passes need none of this.

## Run it locally

```sh
npm install
npm run dev
```

Open http://localhost:5173.

The app works immediately as a plain writing tool with the rule passes, and it creates a Scratchpad so there is somewhere to type. Model passes need a Connection:

1. Open the Connections panel in the sidebar.
2. Pick a provider, then enter an API key and a model id. The model field is free text, so a model released today works without an update.
3. Assign one Connection to the Critic slot and a different one to the Judge slot.
4. Use "Test connection" to confirm the URL and key before running a pass.

For local Ollama, choose the Ollama prefill (base URL `http://localhost:11434/v1`, no key) and start Ollama with the app's origin allowed:

```sh
OLLAMA_ORIGINS=http://localhost:5173 ollama serve
```

Keys are stored in IndexedDB by default. Set a Connection to session-only to keep its key in memory, in which case you re-enter it after a reload.

## Using it

1. Write or import a document. Rule passes mark problems as you save.
2. Work the queue in the sidebar. Address a finding when you have fixed it, or decline it. Declining needs no reason.
3. Run a model pass when you want a closer read. Findings arrive anchored to quotes, grouped by pass.
4. Rewrite the paragraphs in your own words, then flag a milestone so the version is findable later.
5. Select a span or a section, pick two revisions, and ask the judge whether the rewrite is clearer.

The Privacy page in the app lists where your data lives and gives the steps to verify it in DevTools.

## Checks

```sh
npm run typecheck   # tsc -b
npm test            # full suite, including the constitution harness
npm run gates       # import, silent-catch, affordance, and lockfile gates
npm run harness     # the constitution harness alone
```

Run the constitution harness before changing any pass prompt. It checks that model output parses, that praise is flagged, that no response carries rewritten prose, and that findings stay inside their target.

To check the production build and the security headers, use the Worker locally:

```sh
npm run build
npx wrangler dev
```

`npm run preview` serves the static build without the Worker, so it will not show the Content-Security-Policy header.

## Deploy to Cloudflare Workers

This is the intended host. `wrangler.jsonc` serves `dist/` as static assets and routes every request through `worker/index.ts`, which sets the Content-Security-Policy and the other security headers. The Worker has no API route and serves nothing but the app. Keep it that way: a route that called a model provider would put a key on a server and break the central privacy claim.

```sh
npx wrangler login
npm run deploy
```

`npm run deploy` runs the gates, typechecks, builds with Vite, and deploys with Wrangler. To preview the Worker and its headers locally, run `npm run build && npx wrangler dev`.

Take a backup before the first deploy to a browser that already holds work. The launch applies the accumulated database migrations at once.

## Deploy to Vercel

Vercel is a static host here. It builds `dist/` with `npm run build` and serves it. The Worker does not run, so `vercel.json` supplies the same security headers, the single-page-app rewrite, and caching for the hashed assets.

```sh
npx vercel        # preview deployment
npx vercel --prod # production deployment
```

The Content-Security-Policy in `vercel.json` is a copy of the one in `worker/securityHeaders.ts`. Change either and update the other. The "requests go only to your connection" property is enforced by the app's code, not by the header, so it holds on any host.

## Documentation

- `DESIGN.md` explains the reasoning behind the product, including why the constitution is structural.
- `docs/specs/obelus-v1.md` is the v1 requirement, published as issue #1.
- `CONTEXT.md` is the glossary. Code, tests, and commits use its terms.
- `docs/adr/` records the load-bearing decisions.
- `docs/migrations.md` states the database migration policy.
- `notes/provider-api-facts.md` records the provider wire facts, with the date they were checked.
- `AGENTS.md` describes the build discipline for agents working in the repository.

## License

GPL-3.0-or-later. See `LICENSE`.
