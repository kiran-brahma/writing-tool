# Spec — Obelus v1.1

> `docs/specs/obelus-v1.md` is the v1 requirement and stays as it is. This file is the v1.1
> increment. Where the two disagree, v1's invariants — the constitution, the single seam
> `send(ModelRequest) -> Promise<string>`, and browser-only access — still hold, and this file is
> the requirement for everything it adds.
>
> The reasoning is `DESIGN.md` §13. The load-bearing decisions are
> `docs/adr/0007-audit-is-its-own-surface.md`, `docs/adr/0008-source-method-adopted-selectively.md`
> and `docs/adr/0009-obelus-recommends-never-enforces.md`.

## Problem Statement

v1 closed the loop the source method describes — a model finds flaws, the Writer rewrites, a
context-free Judge compares the two versions — and made the two rules structural. It left three
things undone.

1. The method names passive voice first among the mechanical faults a model catches well, and v1
   reached it only through the `orwell` pass, which ships off and, being `exclusive`, suppresses
   every other rule pass while it is on.
2. `Prose Linter.md` has an A1–A14 section on AI tells and an H1–H5 section on honesty, and
   neither was implemented. The method's opening fear — that readers detect model words instantly —
   is therefore only half answered: Obelus prevents the Writer *producing* them, not *failing to
   notice* them.
3. Obelus could tell the Writer whether a sentence was clear. It could not tell them whether the
   thinking held up. A sentence can be perfectly clean and its argument still broken.

The third gap is the one the Writer's own working method already answers elsewhere. This specification
adopts that method — a whole-piece audit of argument structure, definitions and fallacies — with the
parts that conflict with the constitution left behind.

## Solution

Add the **Audit**: a document-scope model pass that reads a piece for whether its reasoning holds
up, classifies it as an argument or an observation, and returns an **Audit account** shown on its
own surface beside Findings and Reader accounts. The Audit reports; it never rewrites, exactly as
the method it comes from insists.

Alongside it, close the mechanical gaps the audit exposed: a first-class `passive` rule pass, an
`ai-tells` rule pass, three more deterministic metrics and the Lard Factor, and the routing of every
unimplemented `Prose Linter.md` check to the surface it belongs on.

Finally, add the mechanics that let the tool *recommend* without ever gating: **Working order**
(structure, then paragraph, then word), per-pass **screening frames**, **Judge calibration**, and a
**Voice list** of words the Writer has declared theirs.

## User Stories

### The Audit

**118.** As a writer, I want a whole-piece audit of my reasoning, so that I learn whether my argument
holds up and not only whether my sentences are clean.

**119.** As a writer, I want the audit to tell me what type of piece it read — argument or observation
— so that I know which checks it ran.

**120.** As a writer, I want the audit to state my final conclusion and the premises and
sub-conclusions that feed it, so that I can see the argument laid out rather than inferred.

**121.** As a writer, I want the audit to say whether my reasoning is deductive or inductive, so that
I know whether the piece claims more certainty than the reasoning earns.

**122.** As a writer, I want the audit to separate validity from soundness, so that a premise I never
established is named rather than assumed.

**123.** As a writer, I want the audit to surface a load-bearing premise I left unstated, so that the
argument does not coast on an assumption the reader has to supply.

**124.** As a writer, I want the audit to name a fallacy, quote the passage, say why it fails and note
what is missing, so that I can judge the flag rather than trust it.

**125.** As a writer, I want a flaw that fits no label described in plain terms, so that the audit does
not force the problem into a taxonomy.

**126.** As a writer, I want the audit to check my load-bearing words for equivocation and boundary
vagueness, so that the argument cannot shift a word's meaning without noticing.

**127.** As a writer, I want a persuasive definition flagged, so that a verdict smuggled into a term is
visible before the argument has earned it.

**128.** As a writer, for an observational piece, I want the audit to require an intensional definition
and a concrete example, so that an abstract idea is grounded in something real.

**129.** As a writer, I want the audit to close with the one or two things to fix first, so that I know
where to start.

**130.** As a writer, I want the audit to receive the whole Document, so that advice about its argument
is not given by something that cannot see the whole argument.

**131.** As a writer, I want the audit chunked by Section with a synthesis when the Document is too long
for one call, so that the global argument map survives chunking.

**132.** As a writer, I want the audit on its own surface beside Findings and Reader accounts, so that
reasoning problems never mix with copyedit findings.

**133.** As a writer, I want each Audit account to record its provenance — model, when, which Revision —
so that I can tell what produced it.

**134.** As a writer, I want the Audit schema to carry no field for rewritten prose, so that the audit
cannot hand me a sentence even if it wants to.

**135.** As a writer, I want praise or a rewrite caught in an Audit account to be struck through like any
other violation, so that prompt drift stays visible.

**136.** As a writer, I want the Audit to be a Pass I can author, disable, export and import like any
other, so that my own audit beats anyone else's default.

### Where each check lives

**137.** As a writer, I want passive voice flagged by a first-class rule pass, so that the fault the
method leads with is not hidden inside an off-by-default one.

**138.** As a writer, I want the passive pass reported at note severity with its exception stated, so
that a passive the sentence's topic requires is not reported as an error.

**139.** As a writer, I want the lexical AI tells flagged by a rule pass on every save, so that the
cheapest tells are caught for free.

**140.** As a writer, I want the argumentative AI tells and the honesty checks judged inside the Audit,
so that they are assessed as reasoning rather than counted as words.

**141.** As a writer, I want three consecutive paragraphs that share a shape reported as a metric, so
that a monotone paragraph rhythm is visible rather than felt.

**142.** As a writer, I want a hollow triad folded into an existing prose pass, so that the tool does not
gain a pass for every single check.

### Metrics

**143.** As a writer, I want be-verb density, prepositional density and abstract-noun density shown, so
that I can see the diagnostic the style authorities describe.

**144.** As a writer, I want a Lard Factor between two Revisions, so that I can see how much I actually
cut rather than how much I feel I cut.

**145.** As a writer, I want the metrics displayed and never gating, so that a number stays a signal and
not a verdict.

### Working order

**146.** As a writer, I want the passes offered in a recommended order — structure, then paragraph, then
word — so that I work globally before locally, the way revision research says experienced writers do.

**147.** As a writer, I want the recommended order to be skippable, so that it is a default and not a
gate.

**148.** As a writer, I want the order derived from Pass scope, so that I never maintain an order by
hand.

### Voice list

**149.** As a writer, I want to declare words and phrases as mine, so that a deliberate choice is not
raised as a problem a second time.

**150.** As a writer, I want the Voice list to silence a rule pass, so that my declared words leave the
queue outright.

**151.** As a writer, I want a model pass to be told about my Voice list, so that it does not flag them
either.

**152.** As a writer, I want a model finding that duplicates a Voice-list entry annotated rather than
hidden, so that I can see when the model ignored the list.

### Frames

**153.** As a writer, I want to choose the reader a pass is written for — a skimmer, a skeptic, a
practitioner — per pass, so that the frame fits the work rather than the whole tool.

**154.** As a writer, I want the Audit and the Reader to keep their own prescribed stance, so that a
frame cannot distort a method that depends on its stance.

**155.** As a writer, I want the Judge to keep its frameless protocol, so that independence is
preserved.

### Judge calibration

**156.** As a writer, I want to record which version I think is clearer before the Judge runs, so that I
can see whether my own judgment agrees with it.

**157.** As a writer, I want that prediction session-only and optional, so that the tool does not grade
me and I can run the Judge without it.

### Shape and storage

**158.** As a writer, I want no output shape offered in the Workbench that cannot run, so that the tool
keeps every promise it shows me.

**159.** As a writer, I want the privacy page free of typos, so that a trust surface does not undermine
its own argument.

## Implementation Decisions

### The boundary rule

**Prose is how something is said; the Audit is whether it holds up.** A check belongs to the prose
surface when the problem is in the words or their arrangement, and to the Audit when it is in what is
claimed or whether it is supported. This is the line `Prose Linter.md` already draws when it says the
linter must not "comment on the ideas."

Every unimplemented check from that document routes by this rule:

| Check | Destination |
|---|---|
| A1, A2, A5, A6, A7, A10, A11, A13 | `ai-tells` rule pass (lexical, deterministic) |
| A3 — uniform paragraph shape | Deterministic metric, not a pass |
| A4 — hollow triad | Folded into `cut-candidates` or `cliche`; not a new pass |
| A8, A9, A12, A14 | Audit |
| H1–H5 | Audit |

### The Audit pass

- `kind: "model"`, `scope: "document"`, `output: "audit"`, `slot: "critic"`.
- The prompt carries a condensed taxonomy from `docs/reference/musings-reviewer/references/logic-notes.md`:
  the argument/observation test, argument structure, deductive versus inductive, validity versus
  soundness, the enthymeme check, the definition checks, and the fallacy list. It states that the piece
  is analyzed and never rewritten, and it carries the same no-praise clause as every other critic pass.
- The Screening frame does **not** apply, and no `frame` may be set on it. Its method defines its
  stance.
- Long Documents are chunked by Section with overlap, and a second synthesis call produces the
  document-level account. The Run reports its chunk count as document-scope Runs already do.
- Parsing is tolerant (extract JSON, validate, lint), like the Findings parser.

### The Audit account

The output schema is closed and carries no field for rewritten prose:

```
AuditAccount {
  type: "argument" | "observation"
  corePayload: string
  argumentMap?: { premises: string[]; subConclusions: string[]; conclusion: string }
  reasoning?: { kind: "deductive" | "inductive"; form?: string; soundness: string; enthymemes: string[] }
  fallacies: { name: string | null; passage: string; why: string; missing: string }[]
  definitions?: { intensional: string | null; extensional: string | null }
  priority: string[]
  provenance: Provenance
  violations?: Violation[]
}
```

A `fallacy.name` of `null` means the audit described the fault in plain terms because no label fit; the
schema permits that rather than forcing a taxonomy.

Stored as `AuditAccountRecord` — the account plus `id`, `documentId`, `passId`, `promptHash` — in a new
`auditAccounts` table. Migration 8 adds the store. Per `docs/migrations.md` it ships alone, ahead of the
behaviour that uses it.

### The `note` output shape is removed

`OutputShape` becomes `"findings" | "section-summary" | "audit"`. Every reference to `note` is removed:
the union, `OUTPUT_SHAPES`, `isOutputShape`, the Workbench dropdown and its `outputLabel`, and
`passSet` validation. A stored Pass with `output: "note"` is refused on read with a clear message. An
output shape the Writer can select and cannot run is a broken promise.

### Checks that are rejected

The Audit does **not** enforce a length cap and does **not** run the atomicity gate. The first
contradicts the spec's "no length gate and no completeness check"; the second is specific to a
one-sitting piece and would misjudge any Document that legitimately carries more than one conclusion.
The source method's prose audit is dropped entirely, because `Prose Linter.md` and the style guide
already cover it. These rejections are recorded in ADR 0008.

### Passive voice

A new rule pass `passive`, `enabled: true`, at **note** severity, with a configurable auxiliary list.
The diagnosis states the Williams exception — a passive is right when the agent is unknown or
irrelevant and the patient is the topic — rather than the rule attempting to detect that condition,
which regex cannot do reliably. The rule reports; the Writer decides.

### AI tells

A new rule pass `ai-tells`, `enabled: true`, carrying the lexical subset from the table above as an
editable word list.

### Metrics

`documentMetrics` gains be-verb count and density, preposition count and density, and abstract-noun
count and density. A new `lardFactor(before, after)` derives from the existing word-level diff. There
are **no thresholds, no colour and no gate**; the panel continues to say "a signal, not a verdict."

### Working order

A pure function `workingOrder(passes)` derives a group from each Pass's `scope` — structural
(document), local (paragraph), rule — and returns the recommended sequence. It drives the sidebar
grouping and the recommended next run. Nothing is stored on the Pass, and no stage blocks another.

### Voice list

A `voiceList` setting holds a JSON array of words and phrases in the existing `settings` store, beside
`characterLimit` and `screeningFrame`. A rule pass drops any match inside a Voice-list entry. A critic
model pass receives the list in its request, and a post-filter annotates any surviving match as being
in the Voice list rather than hiding it, so prompt drift stays visible. The Voice list is data about
the Writer's vocabulary, never prose.

### Screening frames

`Pass` gains an optional, unindexed `frame?: ScreeningFrame` field, which needs no migration. The
frames are the existing default plus **Skimmer**, **Skeptic** and **Practitioner**, named to avoid the
reserved word *reader* and the existing _Avoid_ lists. Frames apply to critic finding passes only; the
Reader and the Audit are exempt, and the Judge keeps no persona.

### Judge calibration

Before the Judge runs, the Writer may record which passage they believe is clearer. The prediction is
held in memory for the session only, is never persisted, and never blocks a Judge run; when present it
is shown beside the Verdict.

### Defaults

`characters-actions` and `paragraph-reorder` become enabled. The new `ai-tells` and `passive` rule
passes, and the Audit pass, ship enabled. `orwell` stays disabled. Nothing else changes.

Model passes run on demand, so enabling one by default spends nothing until the Writer runs it. Rule
passes run on save, but they are free.

### Housekeeping

`Economsit Writing Style Guide.md` is renamed to `Economist Writing Style Guide.md`. The privacy page
content is restored to the form its test asserts.

## Testing Decisions

- **The Audit** is exercised through a `critique`-style entry point with the fixture player. The
  constitution harness gains Audit fixtures: three fixture Documents × the Audit, asserting that the
  output parses, that the schema is closed with no rewrite field, that praise is flagged, and that a
  chunked Document reports its chunk count.
- **Pure tests** for `workingOrder`, `lardFactor`, the metric additions, Voice-list filtering, and the
  `frame` field's round-trip through pass-set import and export.
- **The `audit` schema test** mirrors the Findings schema test: `additionalProperties: false`, and no
  rewrite field at any depth.
- **The privacy test is unchanged.** The content is restored to satisfy it.
- **No DOM layer.** The Audit surface's rendering is not tested, consistent with v1 and the one-seam
  discipline.

## Out of Scope

- The reader extensions — a document-scope Reader account, a "where would a reader stop and re-read"
  probe, and an "what question is left open" probe — deferred to v1.2.
- The revision meter (a measure of whether a Revision restructured or only reworded) — deferred to v1.2.
- Anchored fallacy Findings in the Findings queue — the follow-on increment after the Audit report
  shape is proven.
- The atomicity gate and any length cap.
- Any generation. The Audit is analysis, and the schema has no field for prose.

## Further Notes

**The adopted skill** lives at `docs/reference/musings-reviewer/` and is the source of truth for the
Audit's method. The browser cannot read files at runtime, so the Audit prompt carries a condensed
taxonomy; the skill file records what was adopted and what was not.

**Vocabulary.** `CONTEXT.md` gains **Audit pass**, **Audit account**, **Voice list**, **Working order**,
and the three frames.
