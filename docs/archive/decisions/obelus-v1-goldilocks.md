# Obelus v1 — Goldilocks review

**Status:** approved

**Approved** by the project owner, who adopted all seven recommendations. The recorded answers, which
the spec and ADR-0005 were amended to match:

1. Story 16 is a WYSIWYG requirement — Shape A′.
2. Re-location is diff-projection from `provenance.revisionId`, then quote match, then Orphaned.
3. `canonicalText` is Markdown source, defined in the spec: one blank line between blocks, inline
   formatting preserved as source, determinism asserted by a round-trip test.
4. `anchor.state: "attached" | "orphaned"`, computed on re-resolution; an Orphaned Finding stays
   `open` and has no Highlight.
5. The affordance half of Rule 1 gets a static source check — a build gate, not a seam.
6. `connect-src` is broad; the privacy page distinguishes the header-enforced claim from the
   code-enforced one.
7. Document persistence (short debounce plus `pagehide`) is separate from Revision cadence.

## Problem and constraints

Obelus must let a Writer get model-found flaws and a model comparison of two versions of their own
prose, without any model-authored prose ever entering a Document, entirely inside one browser with
no server of ours. The spec names the mechanism (Passes, Findings, Anchors, a Judge); this review
decides whether that mechanism is the smallest sound shape for the requirement.

Constraints that cannot change:

- **No server route calls a Provider** (ADR-0002). Every request leaves the Writer's browser to the
  Connection the Writer configured. Ollama Cloud stays unreachable directly, and no proxy handles a
  key.
- **Model output is analysis, never prose** (ADR-0001). The findings schema has no rewrite field and
  no affordance inserts model-derived prose. The Writer's keyboard is the only path by which words
  enter a Document.
- **Mechanical problems are rules, not model calls** (ADR-0003).
- **The Judge answers twice with the labels swapped** (ADR-0004).
- **Markdown is interchange, not the source of truth** (ADR-0005).
- **One test seam:** `send(ModelRequest) -> Promise<string>`. IndexedDB runs against an in-memory
  implementation; there is no DOM test layer.
- GPLv3, Cloudflare Workers static assets, BYOK, no accounts, no telemetry.
- The browser is the whole environment: IndexedDB is the entire Library, it can be evicted, and
  there is no server-side recovery.

**Where this review contradicts a recorded decision.** ADR-0005 justifies the rich-text document
model with "positions have to survive editing… character offsets rot on the first keystroke, which
would break anchoring." The spec does not depend on offsets at all: "Anchoring is by quote match with
the offset as a hint, never by offset alone… re-resolves on every document change." With the offset
demoted to a hint, Anchor survival is a property of a pure re-location function over stored prose,
not of the editor's position model. ADR-0005's conclusion (a rich-text editor) still holds, but for
different reasons — story 16 requires WYSIWYG and story 58 requires an inline Highlight, and a
plain Markdown source editor provides neither without extra work. **ADR-0005's rationale was amended,
not its outcome:** the ADR now carries a correction note recording that its stated premise is refuted,
while its conclusion stands on story 16 and story 58.

The other flaws listed below were corrected in the spec rather than merely noted.

## Required complexity

**Domain complexity the design cannot remove**

- Model output is untrusted: tolerate messy output, detect Praise and rewrite-shaped strings, and
  drop any Finding whose Anchor falls outside the Target (Containment) with the count reported.
- Prose reasoning: model Passes at three scopes, a Reader pass, and a Judge whose inputs are a closed
  list and whose answer is two swapped calls.
- Deterministic mechanics over editable Rule config (ADR-0003).
- Anchor survival. Prose gets rewritten, so Anchors must re-locate; some will not, and Orphaned
  behavior is part of the product, not an error path.
- Revision history: auto-Revisions, flagged Revisions, a word-level diff, and comparing any two
  Revisions.

**Environmental complexity the design cannot remove**

- Browser-only and BYOK: five Protocols behind one seam, and a wire-facts table that drifts.
- IndexedDB is the Library: forward-only migrations, eviction risk, no server recovery, and an
  offline shell.
- No telemetry, so production is unobservable to the project by design.

**Breadth, not architecture.** The 117 stories add a Library, tags, search, a pass Workbench, a
Reader pass, a whole-Library backup and a PWA. That is a lot of surface, and it is requirement-driven
rather than incidental. It is not where the design risk is, and cutting it is not the cheapest way to
reduce risk; ordering it after the risky path is.

## Candidates

### Shape A — Spec shape: rich-text tree of record, six modules, breadth in v1

- **State:** the TipTap/ProseMirror tree is the Document of record; a canonical string is derived for
  model input and Anchor matching; `Anchor = {quote, offset}` with the offset's coordinate system and
  tie-break unspecified.
- **Coupling:** Anchor resolution is assigned to "editor integration", but Anchor tests are listed
  under the core loop with no DOM layer — the highest-risk logic sits exactly where the test policy
  cannot reach. Two serializations exist (tree and canonical string) with no contract between them.
- **Operational:** Dexie with forward-only migrations, service worker, a static Worker setting CSP.
  No server to deploy.
- **Change cost:** editor swap is expensive (ADR-0005); the Protocol table is code; an unspecified
  Anchor contract is re-negotiated by every later feature (diff, Judge extraction, chunking).
- **Modules:** six.

### Shape B — Text of record: one canonical string, four behavior modules

- **State:** the Document of record is one canonical string (Markdown). The editor is a view with
  mark decorations; nothing is derived twice. Anchors resolve over the same string the model saw.
- **Coupling:** Anchor resolution and model input are the same string by construction; there is no
  tree↔string projection. Module list: transport (Protocol table folded in), core, rule engine,
  storage, plus a thin editor view.
- **Operational:** hosting is identical; Revisions are strings, so the storage and migration surface
  is smaller; the editor can be swapped with no data migration.
- **Change cost:** cheapest editor swap, export is nearly identity, one serialization. **Fails story
  16 as written:** a Markdown source editor makes the Writer fight markup, and WYSIWYG over Markdown
  needs a live-preview decoration layer that costs more than the tree↔string projection it removes.

### Shape C — Smallest v1 scope (not a third architecture)

- Shares Shape B's state model; differs on the scope axis. v1 is one Document, the loop, rule Passes
  and the Judge. Library (tags/search/status), Workbench, Reader pass, Revisions and diff, backup and
  PWA move to v1.1.
- **Coupling:** as B, minus the pass-editing UI.
- **Operational:** no service worker and no migration surface in v1, so deploy and rollback are
  trivial and the support surface is one screen.
- **Change cost:** smallest possible now, at the price of a thinner v1 than the spec promises and a
  second release to reach parity.
- **Modules:** three or four depending on where storage sits.

Shape B and Shape C are labelled by axis because they are not independent: B is an architecture
choice, C is a scope choice that can be layered on either architecture. Shape A versus Shape B is the
one genuinely architectural fork.

## Decision

Select **Shape A, amended** — rich-text tree of record, with five changes that remove incidental
complexity without removing behavior. Call it A′.

1. **One canonical serialization.** Define `canonicalText(tree)` and make it simultaneously (a) what
   every model Pass receives as Target and context, (b) the unit Anchors resolve against, and (c)
   what a Revision stores. Anchors, Containment, chunking, diff and Judge extraction then move in one
   coordinate system. Without this, a quote the model returns from Markdown-formatted prose may not
   exist in the string the Anchor matches, and Containment will silently drop valid Findings.
2. **Anchoring is a pure function in the core, not a responsibility of the editor.** Split it into
   `resolveAnchor(anchor, currentCanonical, provenanceCanonical) -> Interval | Orphaned` and
   `projectInterval(tree, interval) -> EditorRange`, both pure and DOM-free. The editor only renders
   the result as a Highlight. This resolves the spec's own contradiction and makes story 59 testable
   above the seam. The editor's position model then buys exactly three things: WYSIWYG authoring,
   structural blocks for Pass scope and Section derivation, and position mapping convenient enough to
   render decorations. It buys **nothing** for Anchor survival, because survival is quote/diff work
   over stored prose.
3. **Re-location is diff-projection first, quote match second, Orphaned last.** `provenance.revisionId`
   already exists on every Finding; use it. Project the Anchor's interval from the provenance
   Revision's canonical string to the current canonical string through a character diff, then fall
   back to exact quote match, then Orphaned. Exact quote match alone orphans a Finding the moment the
   Writer changes any character inside the anchored span — the common case, and the exact case story
   59 promises to handle.
4. **The Provider layer is not a module.** Fold the Protocol table and the three adapters into the
   transport. Behavior is unchanged; a boundary that only rearranged request construction
   disappears. Change `ModelRequest` to carry the Connection rather than `protocol`, `extraHeaders`
   and `apiKey`, so "nothing above this boundary knows which Provider is in use" becomes true instead
   of aspirational. The fixture player records the Connection's base URL, which is what the privacy
   assertion actually needs. Five modules, not six.
5. **Replace `promptVersion` with a derived `promptHash`.** A hand-bumped integer is bookkeeping that
   drifts silently; a hash of the Pass's prompt, output shape and scope is computed, stored on the
   Finding, and used in the cache key. Also add the Connection to the cache key, which currently
   collides between two Connections serving the same model id.

**Why this is the Goldilocks zone.** A′ keeps the load-bearing pieces — one seam, Anchors over one
serialization, structural Rule 1, rules for mechanical Passes, a swapped-label Judge — and deletes the
two pieces of avoidable coupling the spec contains: a Provider boundary above the seam, and Anchor
resolution living where it cannot be tested. It does not try to be smaller by cutting breadth, because
breadth is in the requirement. Shape B is the honest smaller state model and is rejected only because
the Owner's story 16 says "without fighting markup"; if that phrase is negotiable, B is the better
architecture and this review should be re-run. Shape C is rejected as a v1 scope but its ordering —
spine and Anchor before breadth — is adopted below.

**Genuine flaws found, recorded here so approval is informed** (each is a design flaw, not a matter
of taste):

- **ADR-0005's stated rationale is unsound** (see Problem and constraints). The conclusion survives,
  the reason does not.
- **`Orphaned` has nowhere to live.** CONTEXT says it is "a condition, never a status"; `Finding.status`
  is exactly three values; the Finding shape has no field for it. As written it cannot be stored or
  rendered deterministically.
- **Story 55 is unachievable for one Provider.** `notes/provider-api-facts.md` records that OpenAI's
  real `POST` with a bad key returns `401` **without** `access-control-allow-origin`, so the browser
  surfaces an opaque network/CORS failure. "Provider errors shown to me verbatim" and "verbatim
  propagation of provider errors" cannot hold for OpenAI auth failures.
- **The affordance half of Rule 1 has no test.** The seam proves there is no rewrite field; it cannot
  prove there is no Apply/Accept/Insert control. The spec forbids a DOM layer and forbids a test that
  asserts on such an affordance, so the product's central claim is enforced by review alone. "The
  constitution is a test suite, not a style guide" is currently half true.
- **Anchor placement and Anchor testing disagree.** Editor integration owns Anchoring; the core loop's
  tests assert it; the DOM is not testable. One of the three must move.
- **`canonicalText` is never defined**, so Containment, Anchor offsets, chunking and Judge extraction
  each get to invent their own coordinate system in a fresh context window.
- **The cross-Revision "fuzzy-aligns the selection" step is unspecified** and untestable as written;
  it is the diff-projection function of amendment 3 wearing a different name.
- **Revisions carry `Findings addressed` and `the Run in progress`.** A Revision should be immutable
  prose plus metadata; those two fields are a time-varying join and an ephemeral pointer. Storing them
  on an immutable record couples history to unrelated mutable state.
- **A static CSP cannot authorize a Writer-supplied base URL.** `connect-src` cannot enumerate a Custom
  Connection or a local Ollama origin, so the privacy claim "requests go only to your Connection" is
  enforced by the single-origin code path, not by the header. The privacy page must not conflate them.
- **A schema migration is not rollback-safe** given forward-only migrations, a service worker, and no
  down-migration. A rollback after a migration strands the Library until forward code returns.
- **Autosave is conflated with auto-Revisions.** "Auto-revision on debounce, roughly sixty seconds"
  is not a save guarantee, and story 17 promises no paragraph lost to a closed tab.

## Rejected alternatives

- **Shape A unamended.** Rejected because the Anchor contract is unspecified and the riskiest behavior
  sits outside the test policy; one serialization is missing, so Containment can disagree with what the
  model saw.
- **Shape B (text of record).** Rejected because a Markdown source editor fails the "without fighting
  markup" half of story 16, and WYSIWYG over Markdown costs more than the projection it removes.
- **Shape C (smallest v1 scope).** Rejected as a v1 scope because the stories are the requirement, not
  a wish list; retained as the ordering rule for tickets.
- **Prompt-only enforcement of Rule 1/2** (ADR-0001's rejected option). Rejected for the reasons
  already recorded; not reopened.
- **A stateless proxy for Ollama Cloud** (ADR-0002's rejected option). Rejected; not reopened. The
  operational path below accepts the consequence.

## Interfaces and seams

**The seam:** `send(req: ModelRequest): Promise<string>`. Real implementation owns the Protocol table,
the three adapters, retry with `Retry-After`, connection testing and model listing. The test
implementation records every request and replays fixtures.

| Module | Owns | Allowed to know | Must not know |
|---|---|---|---|
| **Transport** (the seam) | Protocol table, three adapters, `send`, retry/backoff, connection test, model listing | the Connection's base URL, Protocol, key and extra headers | Passes, Findings, Documents, the Judge |
| **Core** | `canonicalText`, tolerant parsing, praise linter, Containment, Run cache, `critique`, `judge`, `resolveAnchor`, `projectInterval` | Findings, Passes, Connections, Revisions, the canonical string | wire shapes, IndexedDB |
| **Rule engine** | deterministic rule Passes | canonical string and Rule config | transport, storage, editor |
| **Storage** | Dexie repositories, forward-only migrations, newer-database refusal | records and canonical strings | prose reasoning, transport |
| **Editor** | TipTap wiring, rendering a projected Interval as a Highlight | a resolved Interval | Anchors, quote matching, model output |

Entry points above the seam:

```
critique(target: Target, pass: Pass, connection: Connection, config: RunConfig): Promise<RunResult>
judge(before: string, after: string, connection: Connection, config: JudgeConfig): Promise<JudgeResult>
resolveAnchor(anchor: Anchor, current: string, provenance: string): Interval | Orphaned
projectInterval(tree: DocTree, interval: Interval): EditorRange
canonicalText(tree: DocTree): string
runRulePass(canonical: string, ruleConfig: RuleConfig): Finding[]
lintViolations(raw: string): Violation[]
parseFindings(raw: string, shape: OutputShape): Finding[]
```

**What the single seam cannot test, stated plainly:**

- The affordance half of Rule 1. A static source check over the UI module (forbidden affordance
  names) is not a second seam — it observes source, not behavior — and is the only cheap way to make
  story 67 enforceable. Otherwise accept review-only enforcement and say so.
- Rendering: that a Highlight lands on the right prose, and that the Quarantined rewrite pane is
  unselectable. `projectInterval` is testable; the DOM result is not.
- The service worker, the CSP header, and offline opening: deploy-time properties, verified by the
  manual steps in the privacy page.
- Migrations against a real browser IndexedDB: the in-memory implementation tests logic, not quota,
  eviction or partial-migration behavior.
- Real Provider CORS behavior. Adapters are tested without network, so an auth failure that returns an
  unreadable body looks identical to a handled response at the adapter level.
- Cross-Revision extraction and alignment, unless amendment 3 makes the alignment a pure function.

## Operational path

**Deploy.** `wrangler deploy` publishes static assets plus one Worker that sets headers and nothing
else. No runtime configuration, no secrets, no environment, nothing to provision. Configuration is
per Writer, per browser.

**Configure.** Connection records with all prefills and Custom; key storage plaintext or memory-only.
Memory-only means a reload ends model Passes for that session. Offline, rule Passes still work, which
is the floor ADR-0003 buys.

**Observe.** There is none, by design. The project gets no logs, no counters, no version beacon and no
crash reports. The only diagnostics are the Writer-visible raw-response toggle and Provider errors
where CORS permits reading them. Two consequences to accept out loud: support is reproduction-only,
and a Provider that changes a header overnight produces a report with no evidence. Keep
`testConnection` and model listing as the pre-flight, and keep the Protocol table in one file with a
named constant per header so an emergency patch is one line.

**Retry.** Exponential backoff honouring `Retry-After` on 429 and 5xx; the Run is lost, the Document
is not; the Writer can cancel. The estimate and session total never block.

**Recover.**
- *Unsent prose:* separate Document persistence from Revisions. Persist the canonical string on a
  short debounce **plus** `visibilitychange`/`pagehide`, and take auto-Revisions on the slower
  debounce. As written, a closed tab can lose up to sixty seconds, contradicting story 17.
- *Evicted Library:* call `navigator.storage.persist()` on first save; keep the last-backed-up
  reminder as the real defence; and make whole-Library backup importable as well as exportable, or it
  is not a recovery path.
- *Provider auth change:* the Protocol table is code, so it needs a deploy. A Custom Connection can
  change a base URL but not an auth header. Document that as a known break class with a fast path.
- *Provider outage or rate limit:* backoff, verbatim error where readable, cancel. No Run is worth
  losing prose over.

**Migrate.** Dexie versioned `upgrade`, one migration per release, atomic per step, forward-only by
decision. A database newer than the running code refuses to open with a message and no destructive
fallback. The hazard: **a deploy that migrates the Library cannot be reversed by code alone.** Rule:
never ship a migration and a behavior change in the same deploy; ship the migration alone behind a
backup reminder.

**Roll back.** `wrangler rollback` restores the Worker and assets. If no migration shipped, the
rollback is safe once the service worker is forced to advance (`skipWaiting`/`clients.claim`, and a
cache name keyed to the release) — otherwise the Writer keeps the old shell indefinitely. If a
migration shipped, rollback is a Library outage until forward code returns.

**Support.** No logs, no version beacon, no counters. What exists: the raw-response toggle; verbatim
Provider errors where CORS allows; the "verify this yourself" steps; public GPLv3 source. A class of
bugs — opaque auth failures, eviction, CSP interactions on a Custom Connection — will be diagnosed by
reproduction, never by evidence. Say that in the privacy page rather than implying otherwise.

**CSP note.** `script-src 'self'` is the enforceable claim and covers the "no third-party script
origin" statement. `connect-src` must be broad enough for a Custom Connection and a local Ollama
origin, which means it cannot also be the enforcement point for "only your Connection". That property
is enforced by the single-origin code path and the seam test.

## Ticket boundaries

Vertical tracer bullets. Each cuts a complete path through every layer it needs, is demoable on its
own, and is sized for one fresh context window. Blocking edges are explicit.

**What the old Stage 0 must produce before any slice can land green.** The spec's Stage 0 is a
horizontal slab that bundles the editor, the Library, Dexie, Markdown, Connections, key storage, CSP
and deploy, and lands none of the product's risk. Replace it with slices 1 and 2, and give it one job
the spec omits: **the toolchain**. There is no `package.json`, no test runner, no `scripts/agent-gates`
and no pre-commit hook, so AGENTS.md's "new behaviour has a test through the seam" and "the
constitution harness runs before any pass-prompt change" are currently unenforceable. Before any
slice can land green, Stage 0 must produce: the build and test toolchain; the in-memory IndexedDB test
setup; the fixture transport player; the constitution harness scaffold (three fixture Documents ×
three model Passes, runnable); the deploy pipeline with CSP; and Dexie migration number 1 with the
newer-database refusal. Also: several slices (3, 4, 6, 8) cannot be implemented independently until
the Anchor contract of Open questions 1–3 is pinned, or each fresh context window will invent its own
coordinate system and the seams will not meet.

1. **Spine — write, mark, highlight, step.** Document of record in IndexedDB; TipTap with headings,
   emphasis, lists and quotes; Document persistence on a short debounce plus `pagehide`; one Revision;
   `canonicalText`; one rule Pass (hedges); Finding and Anchor; a Highlight; sidebar grouped by Pass;
   Finding status; `j/k/a/x`; Markdown export; deployed with CSP. No Provider, no network.
   *Blocked by: none.* Demo: write three Paragraphs, see a hedge Highlighted, address it, reload,
   export.
2. **Connection and the seam.** Connection records with all prefills and Custom; key storage in both
   modes; connection test; model listing; `send` plus the Protocol table and three adapters; the
   fixture player; the privacy assertion that the seam never sees a base URL other than the
   Connection's. *Blocked by: 1.*
3. **Constitution core.** Findings schema and tolerant parser; praise linter; Containment with the
   dropped-anchor count; one paragraph-scope model Pass end to end; Run cache with `promptHash`;
   raw-response toggle; Quarantined rewrite pane; the no-insert-affordance check. *Blocked by: 2.*
4. **Anchor survival.** `resolveAnchor` with diff-projection from `provenance.revisionId`, quote
   fallback, ambiguous-quote tie-break, Orphaned state and its placement in the sidebar;
   `projectInterval`; re-resolution on every change; pure tests for a rewrite inside the quote and for
   deletion. *Blocked by: 1 (the pure function), 3 (the wiring).*
5. **Rule engine.** Every rule Pass; editable Rule config; auto-run on save; metrics panel.
   *Blocked by: 1.*
6. **Structure.** Section model from headings; outline; document-scope Passes; chunking, limits and
   the too-long-for-one-call path. *Blocked by: 3, 5.*
7. **Library.** Many Documents; Scratchpad; tags; search; Document status; open-Finding count.
   *Blocked by: 1.*
8. **Judge.** Pick any two Revisions; word-level diff; span and Section extraction with both strings
   shown before sending; swapped double call; `Unstable`; Screening frame toggle; same-model warning.
   *Blocked by: 3, 4.*
9. **Workbench.** Pass editor with placeholder validation and output shapes; Rule config editor;
   pass-set JSON import and export; restore the Starter pack; the prompt-authoring assistant.
   *Blocked by: 5, 6.*
10. **Reader pass.** Reader account schema; the Reader tab. *Blocked by: 6.*
11. **Durability.** Library backup with keys excluded by default and explicit opt-in; import;
    last-backed-up indicator; single-Document JSON bundle; `navigator.storage.persist()`; the
    migration policy and newer-database refusal; service worker and offline shell.
    *Blocked by: 1, 7.*

Changes from the spec's build order: Stage 0 splits into slices 1–2 and absorbs the toolchain;
Stage 1 splits, and Anchor survival (4) is pulled ahead of all breadth because it is the highest-risk
and least-specified behavior; Library leaves Stage 0 for slice 7; Rule engine (5) runs parallel to the
constitution slices because it is pure and needs no seam.

## Open questions

Only questions that block approval or materially change the design.

1. **Is story 16's rich-text editor a WYSIWYG requirement, or does a Markdown source editor satisfy
   it?** This single answer selects Shape A′ or Shape B. If the editor may be a Markdown source view,
   B is the smaller architecture and should be re-run; if "without fighting markup" is binding, A′ is
   the design. Blocks everything.
2. **Anchor re-location: diff-projection from `provenance.revisionId` then quote fallback, or exact
   quote match as the spec text now reads?** The two give opposite behavior the moment the Writer
   edits inside the anchored span, and only one satisfies story 59. Blocks slice 4 and the correction
   to ADR-0005.
3. **Which serialization is canonical, and what are its rules?** Define `canonicalText`: heading
   boundaries, list markers, emphasis, Paragraph breaks, and what the model receives for Target and
   context. Anchors, Containment, chunking and Judge extraction all sit on it. Blocks slices 3, 4, 6,
   8.
4. **How is `Orphaned` represented?** CONTEXT calls it a condition and not a status; the Finding shape
   has no field. Proposed: `anchor.state: "attached" | "orphaned"`, computed on re-resolution, with an
   Orphaned Finding staying `open` and actionable but without a Highlight. Confirm or replace. Blocks
   slice 4.
5. **Is the affordance half of Rule 1 allowed a test?** Either add a static source check for forbidden
   affordance names (not a second seam), or accept that story 67 is enforced by review alone and state
   that in the spec. Blocks slice 3's definition of done.
6. **What is `connect-src` for a Writer-supplied base URL?** A static header cannot cover a Custom
   Connection or local Ollama. Set a broad `connect-src` and correct the privacy page to say the
   single-origin property is enforced in code, or restrict Connections to a build-time list (which
   breaks story 7). Blocks slice 11 and the privacy page.
7. **Is Document persistence continuous and Revisions periodic?** Story 17 promises no lost paragraph;
   the current wording names only a sixty-second auto-Revision debounce. Confirm the split. Blocks
   slice 1.
