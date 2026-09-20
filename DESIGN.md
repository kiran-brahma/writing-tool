# Obelus — Design

> In ancient manuscripts, the obelus (÷) was the editor's mark for *this passage is suspect*.
> It was never used to write anything.

Obelus is a client-side writing tool that uses LLMs as a copyeditor and a judge, never as a
ghostwriter. It marks. It never holds the pen.

The method comes from "How To Write With An LLM — A Final Ward" (sockpuppet.org, 2026-09-17):
write your piece yourself, hand it to a good model to find flaws, and refuse the two things a
model does that quietly wreck your voice — suggesting better words, and telling you it's good.

---

## 1. Constraints (non-negotiable)

| Constraint | Consequence |
|---|---|
| 100% client-side. No server action, no server storage. | Documents, revisions, findings and API keys live only in the browser's IndexedDB. |
| Hosted statically on Cloudflare Workers. | The only Worker code is security headers. There is no API route. |
| Bring your own key. No accounts, no onboarding. | Anyone may use it; nobody signs in; nothing is attributable to a user. |
| No telemetry, analytics, or error reporting. | A tool whose pitch is "your data stays with you" cannot phone home. |
| No proxy that touches an API key. | This rules out server-side calling of any provider, including Ollama Cloud. |

## 2. The constitution

The whole design exists to make Rule 1 and Rule 2 enforceable rather than aspirational.

**Rule 1 — you may not use a single word an LLM suggests.** Enforced *structurally*:

- Model output is schema-constrained to findings. **There is no field for rewritten prose.**
- **No "Apply", "Accept", "Insert", or equivalent affordance anywhere in the app, for any
  model-derived text, ever.** The only way text enters a document is the writer's own keyboard.
- Diagnosis text is selectable (you may want to keep the finding). The quarantined
  quarantined-rewrite pane is `user-select: none` and has no insert affordance.
- There is no clipboard policing. It is unreliable and it treats the writer as a suspect.

**Rule 2 — no encouragement.** Enforced by prompt *and* by a client-side linter:

- Every returned string is scanned for praise and rewrite-shaped content.
- Praise is shown **struck through, not hidden** — the post asks for hypervigilance about praise,
  so praise must be visible and marked. Silently stripping it would hide prompt drift and make
  debugging impossible.
- A per-finding `decline` action that records why it was declined — the writer disagreed, or the
  model breached the constitution — plus a global **"show raw provider response"** toggle.

**Zero generation.** No continue-writing, no rewrite, no title or outline generation, no chat
window. Write-first is the writer's discipline; the tool's contribution is refusing to hold the
pen. There is no length gate and no completeness check — those would be a nanny.

## 3. The loop

The post's three steps, all in-app:

1. **Model finds flaws** → findings.
2. **You rewrite** → the writer edits normally in the editor.
3. **A context-free model judges old vs. new** → the Judge.

**Findings.** Anchored to the smallest span the model can quote exactly. Store the quote plus an
offset, and re-locate after edits by fuzzy quote-match — offsets rot the moment you type; quotes
survive. Every finding carries a stable id, a status (`open` / `addressed` / `declined`) and
provenance: pass, provider + model, timestamp, and the revision it was found in.

**Sidebar.** Grouped **by pass**, not by span — the post's method is to run passes over the work,
so the working unit is one pass at a time. Within a pass, findings list in document order.

**Keyboard.** `j` / `k` step through open findings, `a` marks addressed, `x` declines.
Declining needs no justification and is logged — the post ends with a man declining advice.

**Judge protocol.** The single most important mechanism in the tool.

- Receives two passages, labelled `A` and `B`, and one neutral instruction: *"Two versions of the
  same passage. Which is clearer and more effective prose? Do not assume either is newer or
  better."*
- Receives **nothing else** — no document, no history, no authorship, no mention that an edit
  occurred, no mention that a model was involved, **never the findings**.
- A/B order randomized per call; the mapping is kept locally.
- Output: `preference: A|B|tie`, `confidence`, `reasons[]` (each with an `evidence_quote`),
  `problems_in_A[]`, `problems_in_B[]`.
- **Run twice with the order swapped.** Disagreement is surfaced as `unstable`. A judge that flips
  when the labels swap is either position-biased or looking at two equivalent passages — exactly
  the self-deception Rule 2 warns about. One extra call is cheap.
- Judge defaults to a **different provider + model** than the Critic. Soft warning, not a block,
  when they are the same.
- The screening frame (below) applies to the **Critic only**. The Judge gets no persona and no
  publication to overfit to.

**Critic framing.** The post's "I am not the author, I'm an editor screening submissions" trick
helps but overshoots. It is a global setting, on by default, and applies only to critic passes.

## 4. Pass engine

Passes are **data, not code**: records in IndexedDB, edited in-app, exportable and importable as
JSON, shipped with a read-only starter pack and a "restore defaults" action.

```
Pass {
  id, name, description,
  kind:   "rule" | "model",
  scope:  "document" | "section" | "paragraph",
  output: "findings" | "section-summary" | "note",
  prompt: template,          // model passes only
  slot:   "critic",          // override per pass
  enabled, prompt_version
}
```

**Rule passes — local, deterministic, free, offline.** These run automatically on save and are
constitution-safe *by construction*: a rule cannot suggest a word or praise you. Their configuration
(word lists, regexes, windows) is editable data.

1. Intensifier / hedge sweep — `very really actually quite rather somewhat basically literally
   simply just of course unfortunately arguably "I think"`
2. Nominalizations — `-tion -ment -ance -ence -ency`, "made a decision", "the implementation of"
3. Expletive / throat-clearing openers — "There is…", "It's worth noting", "As I mentioned"
4. Wordiness pairs — "in order to", "due to the fact that", "at this point in time"
5. Repetition — same non-stopword lemma within N sentences; repeated sentence openers
6. Sentence metrics — length and variance, adverb density, longest sentence

**Model passes (judgment; a rule cannot do this).** Enabled by default: 8, 10, 11, 12, 13.
Shipped but off by default: 7, 9.

7. Characters & actions — is the actor the subject, or is the verb buried in a noun
8. Topic strings & stress position — cohesion across sentences; is the important new thing last
9. Paragraph reordering candidates — the post's "2–3 paragraphs that can move"
10. Paragraph unity — one idea per paragraph; does the topic sentence do its job
11. Cut candidates — "which sentences add nothing"
12. **Cliché & headline-ese** — the post's exact fear; flag anything that reads like a magazine headline
13. Claim strength — hedges undercutting something you obviously mean, and confidence with no support
14. Reader pass — see §6

**Scoping and context budget.**

- Structural passes (8, 9, 14) get the **whole document**, one call when it fits, else chunked
  by section with overlap.
- Local passes (every rule pass, plus 7, 10, 11, 12, 13) get **target paragraph + one paragraph
  either side + heading outline** (headings only, never body text). Paragraph unity is judged on
  the paragraph, not on paragraph order, so it sits with the local passes.
- Two hard rules: the prompt must state *"analyze only paragraph N; surrounding text is context,
  not target"*, and any finding anchored outside the target is **dropped client-side**. Without
  this, every pass re-flags the whole document and you get six copies of one finding.
- Above a configurable character limit: warn and offer section-by-section.

**Prompt templates.** Placeholders `{{title}} {{outline}} {{document}} {{target}}
{{context_above}} {{context_below}}`, validated on save; an unknown placeholder is a hard error.
Output schemas are fixed (`findings`, `section-summary`, `note`) rather than user-editable JSON
Schema — three shapes is enough rope.

## 5. Provider layer

Five prefills plus one escape hatch. Facts verified against live endpoints on 2026-09-19 — full
detail in [`notes/provider-api-facts.md`](notes/provider-api-facts.md).

| Prefilled Connection | Base URL | Protocol | Auth | Extra headers |
|---|---|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `openai-shaped` | `Authorization: Bearer` | — |
| Anthropic | `https://api.anthropic.com/v1` | `anthropic-shaped` | `x-api-key` | `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | `gemini-native` | `x-goog-api-key` | — |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai-shaped` | `Authorization: Bearer` | optional `HTTP-Referer`, `X-OpenRouter-Title` |
| Ollama (local) | `http://localhost:11434/v1` | `openai-shaped` | none | requires `OLLAMA_ORIGINS=https://<app-origin>` |
| Custom | user-supplied | `openai-shaped` | user-supplied | the documented escape hatch for a self-hosted proxy |

**Ollama Cloud is deliberately not supported.** `ollama.com` returns `405` to CORS preflight with
no `Access-Control-Allow-Origin`, so a browser `fetch` is blocked; Ollama's own docs say *"Keep your
API key out of browser code."* Cloud models are still reachable — through a local Ollama daemon
after `ollama signin`, using the `:cloud` model suffix — and that path needs no key in the browser
at all. Anyone who wants the hosted endpoint may point a Custom Connection at their own proxy.

**Behaviour.**

- Model is **free text** with a "List models" button (OpenAI `/v1/models`, Anthropic `/v1/models`,
  Gemini `/v1beta/models`, OpenRouter `/api/v1/models`, Ollama `/api/tags`). A hardcoded model list
  goes stale within weeks.
- Runs are on demand, one pass at a time, plus "Run local passes" (free, instant, no key) and
  "Run structural set". Concurrency capped at 3 per Connection, configurable, with a visible queue.
- **No streaming in v1.** A finding is a parsed object; showing half of one is not useful. Spinner,
  elapsed timer, cancel.
- Pre-call cost estimate (chars ÷ 4 tokens × an editable per-model price table) and a running
  session total. Always shown, never blocking.
- Findings cached by `hash(document text) + pass id + prompt version + model`, so re-running a pass
  never re-bills you.
- Retry on 429 / 5xx with exponential backoff honouring `Retry-After`. Provider error text is
  surfaced verbatim. Never swallowed.
- "Test connection" on every Connection.
- Tolerant parser: extract JSON from prose, validate, then lint (§2) — `strict: true` is a promise
  models still break, and OpenRouter's schema support is a passthrough requiring
  `require_parameters: true`.

**Key handling.** Plaintext in IndexedDB by default, with a session-only toggle (key held in memory,
never persisted). No passphrase encryption in v1 — shipping the decryption code to the same browser
that holds the Documents makes it mostly theatre, while "never persisted" is the honest form of *more
secure*. Non-negotiable regardless: keys are never logged, never placed in a URL, never sent to any
origin but the Connection's base URL; strict CSP (no inline script, no remote script) set as a Worker header;
`noopener noreferrer` on outbound links; keys excluded from exports by default.

## 6. The reader pass

A model pass, not a third Slot. One model call per section returning
`{what_this_section_says, what_a_distracted_reader_would_miss, gap_between_intent_and_effect}` — a
reader account — shown in its own **Reader** tab so it never mixes with findings. It is the cheapest defence against
the post's central anxiety — that you are writing for yourself — and the one thing a rule engine can
never do.

## 7. Documents, revisions, durability

- **Library:** flat list, no folders. Each row shows title, word count, last edited, open-findings
  count, and status (`draft` / `revising` / `done`). Optional tags and search over title + body. One
  auto-created "Scratchpad".
- **Structure:** heading-delimited sections parsed from TipTap heading nodes. Sections are
  load-bearing — the Judge compares them and structural passes chunk by them.
- **Revisions:** an auto-revision on debounce (~60s idle or N keystrokes, pruned) **plus** a flagged
  revision the writer marks as a milestone, carrying an optional note. A Revision holds full text plus
  metadata: parent id, timestamp, word count, flag, Findings addressed, and the Run in progress.
- **Diff:** minimal word-level diff between any two revisions.
- **Judge any two revisions**, because the comparison you want is "before I ran the style pass" vs
  "now" — not v3 vs v4. Comparison unit is a selected span or a heading-delimited section; the app
  fuzzy-aligns it across revisions and **shows both extracted strings before the call**. Text the
  writer has not seen is never sent.
- **Export:** Markdown always. Single-Document JSON bundle (Document + revisions + findings + Run
  results) for round-tripping. A Library backup in JSON, **keys excluded by default** and
  included only behind an explicit checkbox, with a visible "last backed up" nag.
- **Migrations:** forward-only, versioned. A browser holding a newer schema than the code refuses to
  open and says so, rather than risking the Library.
- **PWA:** manifest + service worker so the shell and existing Documents open offline. No push, no
  background sync.

## 8. Stack and hosting

Vite + React + TypeScript + Tailwind, TipTap for the editor (edit-mapped document positions are what
make "Genius-style sidebar that matches highlights" possible), Dexie for IndexedDB, Markdown as
import/export format rather than internal source of truth. Deployed to **Cloudflare Workers static
assets** with a thin Worker for CSP and security headers. **No Astro** — there are no content pages,
one screen, and no SEO; Astro would be a routing wrapper around an island containing 100% of the
app. GPLv3.

## 9. Privacy

A plain-language page, and a **"Verify this yourself"** section with actual steps:

- No accounts, no telemetry, no analytics, no error reporting.
- Documents, revisions, findings and keys live in this browser's IndexedDB — open DevTools →
  Application → IndexedDB and read them yourself.
- The only outbound requests go to the model provider you configured — open DevTools → Network with
  "Preserve log" and watch.
- The Worker-set CSP header means no third-party script origin can load.
- The source is public (GPLv3); read it.

Claims a user can check, not claims we ask them to trust.

## 10. Verification

The constitution lives in prompt text, and prompt text drifts silently. A tiny regression harness —
**3 fixture documents × 3 model passes** — asserts that output parses, that no un-flagged praise
token survives the linter, that no rewrite field ever appears, and that findings anchor inside their
Target. Run manually before any prompt change; results stored locally with a timestamp. It never
ships to the UI. It is the only thing standing between "the tool can't do that" and "the tool can't
do that *today*".

## 11. Build order

Each stage ends somewhere usable.

- **Stage 0 — Shell (no AI).** Vite/React/TS/Tailwind, Dexie schema, library screen, TipTap editor,
  Markdown import/export, Connection setup with all five prefills + Custom + Test connection, key
  storage, deployed to Workers with CSP. *Usable as a plain writing app.*
- **Stage 1 — Constitution core.** Findings schema, tolerant parser, praise linter, raw-response
  toggle, pass engine at paragraph scope, two model passes to prove the shape, sidebar with
  quote-anchoring, statuses and `j/k/a/x`. *The thing is real here.*
- **Stage 2 — Rule engine.** Every rule pass, editable rule config, auto-run on save, metrics panel.
  *Useful with zero API keys.*
- **Stage 3 — Structure.** Section model, outline, document-scope passes, chunking and char limits.
- **Stage 4 — Judge.** Revisions, word-level diff, swapped-order double call, `unstable`
  surfacing, screening-frame setting.
- **Stage 5 — Workbench.** Pass editor, rule config editor, pass-prompt authoring assistant.
- **Stage 6 — Reader.** The Reader tab and its schema.
- **Stage 7 — Durability.** Library backup, PWA service worker, migrations, backup reminder.

## 12. Non-goals

Generation of any prose. Collaboration. Sync. Accounts. Folders. PDF export. Streaming. Prompt-
injection theatre. Clipboard policing. Length gates. Prompt-editable JSON Schema. Any proxy
that sees an API key. A pass library curated by anyone other than its user — *"whatever anybody
comes up with on their own is better, for themselves, than someone else's."*
