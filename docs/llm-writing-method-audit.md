# The LLM writing method — coverage audit and forward analysis

**Date:** 2026-09-21
**Status:** Analysis. Not a requirement. Where this document disagrees with
`docs/specs/obelus-v1.md`, the spec is the requirement and this is the argument to reopen it.
**Outcome:** The recommendations accepted in the design session of 2026-09-21 are now
`docs/specs/obelus-v1.1.md`; see `DESIGN.md` §13 and ADRs 0007–0009. §5.1 and §5.2 closed in v1.1;
§5.3 (declining a whole category of advice) is `docs/specs/obelus-v1.2.md`, stories 179–182.
**Subject:** the source method behind Obelus, what the app already implements, what the post
recommends that the app treats as second-class, and what the research literature implies should be
added next.

**Sources reviewed for this audit**

| Source | What was taken from it |
|---|---|
| `https://sockpuppet.org/blog/2026/09/17/how-to-write-with-an-llm/` | The source method: the two rules and the three-step loop. |
| `DESIGN.md` | The reasoning record, §1–12. |
| `docs/specs/obelus-v1.md` | The v1 requirement, user stories and implementation decisions. |
| `CONTEXT.md` | Vocabulary. |
| `Prose Linter.md` | The E/W/N rule set, W1–W6, A1–A14, H1–H5. |
| `Economist Writing Style Guide.md` | The reduction list and words-to-avoid list. |
| `src/` (surveyed) | What actually ships: passes, metrics, linter, judge, harness. |
| Academic literature | Cited inline and listed in the appendix. |

> Note on filenames: the style guide was renamed from the misspelled `Economsit Writing Style
> Guide.md` to `Economist Writing Style Guide.md` in v1.1.

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [What the post actually advises](#2-what-the-post-actually-advises)
3. [Coverage audit: advice → implementation](#3-coverage-audit-advice--implementation)
4. [Where Obelus already exceeds the post](#4-where-obelus-already-exceeds-the-post)
5. [Gaps in the post's own advice](#5-gaps-in-the-posts-own-advice)
6. [What the research validates](#6-what-the-research-validates)
7. [Research-grounded additions](#7-research-grounded-additions)
8. [Prioritised roadmap](#8-prioritised-roadmap)
9. [Minor findings](#9-minor-findings)
10. [Appendix: the literature](#10-appendix-the-literature)

---

## 1. Executive summary

**The post's method is covered, and mostly enforced more strictly than the post asks.** The two
rules are implemented structurally rather than by request — there is no rewrite field, no insert
affordance, and praise is shown struck through rather than hidden — which is stronger than the
post's own "be strict about the rule" counsel. The three-step loop (find → rewrite → context-free
judge) is present end to end. Every named affordance from the post (highlights, Genius-style
sidebar, forward/back stepping, multiple documents, revisions, milestone flags) ships.

**The remaining gap against the post is small and specific.** Three items the post explicitly names
are treated as second-class in Obelus: passive voice (buried in the off-by-default `orwell` pass),
the two passes the post treats as its most satisfying wins (`characters-actions` and
`paragraph-reorder`, both off by default), and an aggregate form of "don't take all the advice"
(decline is one finding at a time).

**The larger opportunity is not in the post — it is in the research the post gestures at.** The
writing-science literature (Williams, Gopen & Swan, Sword, Lanham, Flower, Sommers) and the
feedback and sycophancy literatures (Kluger & DeNisi, Hattie & Timperley, Sharma et al., Zheng et
al.) both validate the constitution and point at concrete additions: an AI-tells pass that is
already written in your own reference doc but not implemented; deterministic diagnostics
(be-verbs, prepositions, abstract nouns, the Lard Factor); global-before-local revision ordering;
argument-level passes; sycophancy hardening; and a structural-revision meter built from diff data
you already store.

**Nothing recommended here breaks an invariant.** Every proposal is a rule pass (free,
deterministic, constitution-safe by construction), an analysis-only model pass, or a mechanic over
data the app already holds.

---

## 2. What the post actually advises

Recorded here so the audit can be checked against the source rather than against memory. The post
makes one framing claim, two rules, and a method.

**Framing.** Readers detect LLM words "in the parts per trillion." However much you humanise a
model paragraph, much of your audience will register it as output rather than writing. Therefore:
write for yourself, and use the model as a copyeditor, never a ghostwriter.

**Rule 1 — you may not use a single word an LLM suggests.** Frontier models are "supernaturally
good at selecting pleasing turns of phrase"; they are "wedged in a mode where everything they write
is a magazine headline." Any specific turn of phrase a model suggests is disqualified — even if you
like it, even if you are sure it is better. The rule is a form of "intellectual personal protective
equipment," because you will not reliably spot every way a model bends your prose.

**Rule 2 — avoid encouragement.** Hand a draft to a model and it replies "that's gold, Jerry!" That
is not what you need. In a first draft most paragraphs are bad, the topic flow is incoherent, and
you have 750 words you do not need. Praise makes you double down on first-draft impulses instead of
rethinking — and "the rethinking was the voice." Forbid encouragement; be hypervigilant about
praise. The "I am not the author, I'm the editor of a publication screening submissions" trick helps
but overshoots, because the model overfits to the fictional publication.

**What models are good at.** Flagging problems: overused passive voice, nominalised verbs and
buried action, repeated turns of phrase; "very / unfortunately / really / actually" sprinkled like
sawdust; and the 2–3 paragraphs that can be moved for an instant clarity win.

**The method.** Read *Style: Lessons in Clarity and Grace* (Williams), take notes, derive a list of
prompts, and run them in passes over the work: (1) the model finds problems; (2) for each problem,
rewrite the paragraph yourself; (3) present the original and the new writing to a model and ask
which is better — giving the options to a model that has no context of the editing process, or it
will praise the newer version. Build your own prompt list, because your own is better for you than
anyone else's. And, finally, do not take all of the model's copyediting advice.

---

## 3. Coverage audit: advice → implementation

Legend: **✅ covered** · **✅+ covered and improved on** · **⚠️ partial / second-class**

| # | Post's advice | Where it lives in Obelus | Status |
|---|---|---|---|
| 1 | Write it yourself; readers detect LLM text | Zero-generation constitution; no continue/rewrite/title/outline; `DESIGN.md` §2 | ✅ |
| 2 | Model as copyeditor, not ghostwriter | The product premise; `critique` returns findings only | ✅ |
| 3 | **Rule 1** — not one suggested word | `src/core/findingsSchema.ts` (no rewrite field); no apply/accept/insert, enforced by `scripts/gates/affordances.mjs`; `QuarantinedRewrite` is `user-select:none` and reveal-only | ✅+ structural |
| 4 | Models are "headline machines"; suggested phrases are DQ'd | `cliche` model pass ("Cliché and headline-ese"); `worn-phrases` rule pass | ✅ |
| 5 | **Rule 2** — forbid encouragement | Prompt clause `CONSTITUTION_CLAUSES` in `src/core/starterPasses.ts` + `src/core/lintViolations.ts` | ✅ |
| 6 | Be hypervigilant about praise | Praise is **struck through, not hidden** (`src/editor/ViolationDisplay.tsx`), with decline-as-violation and a raw-response toggle | ✅+ |
| 7 | "I'm not the author, I'm an editor screening submissions" | `src/core/screeningFrame.ts`; global toggle; critic-only | ✅ |
| 8 | Flag passive voice overuse | `matchPassive` in `src/core/rulePass.ts`, reachable only via the `orwell` pass, which ships **off** | ⚠️ |
| 9 | Flag nominalised verbs / buried action | `nominalizations` rule pass (on); `characters-actions` model pass (**off**) | ⚠️ |
| 10 | Flag repeated turns of phrase / word choices | `repetition` rule pass (on); `worn-phrases` rule pass (on) | ✅ |
| 11 | Flag "very/unfortunately/really/actually" sawdust | `hedges` rule pass (on) — default list contains exactly those words | ✅ |
| 12 | 2–3 paragraphs that can move | `paragraph-reorder` model pass (**off by default**) | ⚠️ |
| 13 | Read *Style* (Williams), derive prompts | `characters-actions` (characters/actions) and `topic-strings` (topic/stress position) model passes; pass engine as data | ✅ |
| 14 | Step 1: model finds problems | `critique(target, pass, connection, config)` | ✅ |
| 15 | Step 2: you rewrite | TipTap editor; no model path in | ✅ |
| 16 | Step 3: context-free model judges old vs new | `judge(before, after, …)` in `src/core/judge.ts` | ✅ |
| 17 | Give options to a model without editing context | Judge receives a closed input list; swapped labels; never the findings; different provider by default | ✅+ |
| 18 | Highlighting, Genius-style sidebar matching highlights | TipTap `obelusHighlight` decoration + sidebar grouped by pass | ✅ |
| 19 | Tick forward and back through suggestions | `j` / `k` / `a` / `x` (`src/editor/findingQueue.ts`) | ✅ |
| 20 | Multiple documents, track revisions, flag major revisions | Library, auto- and flagged Revisions, milestones | ✅ |
| 21 | Build your own list of prompts | Pass workbench + prompt-authoring assistant | ✅ |
| 22 | Don't take all the model's advice | Per-finding `decline`; no length gate; no completeness check | ⚠️ one at a time |

**Result: 22 items — 16 fully covered, 1 covered and improved, 5 partial.** The partial items are
detailed in §5.

---

## 4. Where Obelus already exceeds the post

Worth stating plainly, because it changes what "adding more" means. The post is one page of advice;
Obelus is an institution built around it. Several of your own additions go beyond anything the post
proposes, and the audit should not treat them as if the post were the ceiling.

- **The constitution is structural, not aspirational.** The post asks the writer to *be strict*.
  Obelus removes the possibility: no rewrite field, no insert affordance, a build gate that fails on
  the forbidden affordance names. `docs/adr/0001-constitution-is-structural.md`.
- **Praise is visible, not stripped.** The post asks for hypervigilance; silently removing praise
  would hide prompt drift. Struck-through display is a better reading of the same requirement.
- **The Judge is debiased twice, not once.** The post says use a context-free model. Obelus also
  swaps the labels and surfaces disagreement as `unstable`, which is the published mitigation for
  position bias (§6).
- **The Prose Linter.** A full E/W/N severity system with W1 banned words, A1–A14 AI tells, and
  H1–H5 honesty checks. None of this is in the post.
- **The Orwell pass.** The post names one style book; you also implemented a second, distinct
  tradition (Orwell's six rules) as an exclusive pass.
- **Cost, caching, cancellation, honest error surfacing, concurrency caps.** None in the post.
- **The reader pass, privacy architecture, durability, PWA, migrations.** None in the post.
- **The constitution harness.** Three fixture documents × three passes, run before any prompt
  change. This is the thing that keeps the whole constitution from silently drifting, and the post
  has no equivalent because the post has no code.

The forward analysis in §7 is measured against *this*, not against the post.

---

## 5. Gaps in the post's own advice

These are items the post explicitly recommends that Obelus currently treats as second-class.

### 5.1 Passive voice is buried behind an off-by-default pass

**The gap.** The post names passive voice first among what models catch well. In Obelus,
`matchPassive` (`src/core/rulePass.ts`) is reachable only by enabling the `orwell` pass, which ships
`enabled: false`. A writer who never turns on Orwell's rules never has passive flagged. Williams'
real position — that a passive is correct when it puts the sentence's actual topic in subject
position and the agent is unknown or irrelevant — appears in `Prose Linter.md` as M3 but is not
modelled in the rule engine.

**Why it matters.** Passive is the one mechanical fault the post leads with, and it is the fault
most likely to be a genuine error in an early draft. Leaving it behind a themed pass makes the
default experience worse than the post recommends.

**Fix.** Promote passive detection to its own first-class rule pass, on by default, with the
Williams exception as a configured carve-out (e.g. do not flag when the agent is absent and the
patient is the known topic). The `orwell` pass can continue to carry the remaining Orwell rules.

### 5.2 The post's two most satisfying passes ship off

**The gap.** `characters-actions` (the Williams pass the post's book recommendation is *about*) and
`paragraph-reorder` (the post's "2–3 paragraphs that can move") are both `enabled: false` in
`src/core/starterPasses.ts`. The post calls the reorder edits "really, actually, very satisfying,"
and calls buried action the first thing models notice.

**Why it matters.** Defaults are the product. A starter pack that disables the highest-value passes
teaches a new writer that Obelus is a surface-level proofreader.

**Fix.** Reconsider the defaults for these two, or at minimum surface them inside the "run structural
set" shortcut so they are one click from the default experience rather than hidden in a toggle list.

### 5.3 "Don't take all the advice" has no aggregate form

**The gap.** The post's closing move is the author declining GPT-5's "20% too long" and saying "I'm
just gonna be me." Obelus makes declining one finding cheap (`x`, no justification needed) but
declining a whole category expensive — twenty hedges you deliberately use cost twenty keystrokes,
and a noisy pass costs one keystroke per finding.

**Why it matters.** The whole point of `docs/adr/0003-rule-passes-not-model-passes.md` and the
decline action is that the tool defers to the writer's judgment. If deference is tedious, writers
stop deferring and start accepting, which is the drift the constitution exists to prevent.

**Fix.** A batch decline for a pass ("decline all remaining findings in this pass"), and eventually
the learning loop in §7.7.

---

## 6. What the research validates

You already have the literature on your side, and it is worth recording, because it upgrades the
constitution from "the post's opinion" to "the published consensus." Three strands.

### 6.1 Rule 2 is a documented failure mode, not a quirk

Reinforcement learning from human feedback trains models to produce output that humans rate highly,
and human raters reward agreement and flattery. Sharma et al., *Towards Understanding Sycophancy in
Language Models* (ICLR 2024, Anthropic), demonstrate sycophancy across five frontier assistants on
four free-form tasks, and show that the human preference data itself incentivizes matching the
user's beliefs. Two findings bear directly on Obelus:

- **Sycophancy is indirect.** A user saying "I really like the argument" flips a model's verdict on
  that argument. Praise is not always the word "great."
- **Sycophantic praise is dominated by outcome praise.** A 2026 follow-up (*Sycophantic Praise*,
  Vennemeyer et al.) finds that excessive praise is mostly about the *product* ("that's a nuanced,
  insightful argument") rather than the *person* ("you're brilliant"), and that it concentrates in
  socially interpretive domains rather than objective reasoning.

Obelus's `lintViolations.ts` is, in effect, a sycophancy filter. Finding 6.1 is why the regex
approach is *necessary*; §7.4 is why it is not *sufficient*.

### 6.2 Feedback research says praise is the weak form and self-directed attention is harmful

This is the empirical proof of Rule 2, and it is stronger than the post's argument.

- Kluger & DeNisi (1996, *Psychological Bulletin*; meta-analysis of 607 effect sizes, 23,663
  observations) found that feedback interventions improve performance on average (d = .41) but that
  **over one third decreased performance**, and that effectiveness falls as the locus of attention
  moves from the task toward the self. Person-directed feedback is the harmful end of that
  hierarchy.
- Hattie & Timperley (2007, *Review of Educational Research*) reach the same conclusion: feedback
  about the task and the process is powerful; praise directed at the person is weak.

The implication is not only "ban praise." It is that **analysis anchored to a specific span is
exactly task-level feedback**, which is why the quote-anchored Finding is the right shape. It also
implies a symmetric risk the post does not mention: negative *person-directed* feedback harms
performance too, so a "false severity" check is defensible alongside the praise linter.

### 6.3 The swapped-label double call is the researched mitigation

Zheng et al., *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena* (NeurIPS 2023) measure the
biases that make a naive judge unreliable:

- **Position bias** — many judges favour the first answer and flip when the order is swapped. Their
  recommended conservative fix is to call the judge twice with positions swapped and require
  consistency. Obelus implements exactly this and surfaces disagreement as `unstable`.
- **Verbosity bias** — judges favour longer answers even when shorter ones are clearer. This is the
  mechanism behind the post's "20% too long."

The same paper reports that a strong judge reaches roughly human–human agreement on open-ended
preference, which is the basis for trusting the Judge at all — provided the biases are mitigated.

---

## 7. Research-grounded additions

These are the genuine openings. Each entry gives the proposal, the research behind it, where it would
live in the code, whether it is constitutional, and the effort. Types:

- **Rule pass** — free, deterministic, offline, constitution-safe by construction.
- **Model pass** — needs the wire; analysis-only, so still constitutional.
- **Mechanic** — uses data the app already holds; no model, no new schema.
- **Setting** — configuration surface.

Ordered by value-to-effort within each type.

---

### 7.1 Ship the AI-tells pass that is already written (rule pass + model pass)

**Proposal.** Implement the A1–A14 "AI tells" section of `Prose Linter.md` as a first-class pass —
a rule pass for the lexical subset and one model pass for the structural subset.

**Research.** This is the post's *opening* fear: readers detect LLM words in parts per trillion. It
is also the thing the post cannot fully protect against, because Obelus prevents *producing* LLM
prose but does not help you *notice* it in text you pasted in from elsewhere. Your own reference doc
already enumerates the tells.

**Where.** `src/core/starterPasses.ts` and `src/core/rulePass.ts`.

**Rule-friendly subset (deterministic):**
- A1 manufactured significance — `pivotal`, `broader shift`, `testament`, `landscape`
- A2 vague authority — `experts say`, `industry reports`, `best practices`
- A5 false depth — `at its core`, `the real question is`
- A6 generic ending — `the future looks bright`, `time will tell`
- A7 chatbot residue — `great question`, `hope this helps`, `let me know`
- A10 crowd openers — `many of us`, `most operators`
- A11 category label where a specific belongs — `-tion`/`-ism` labels used as subjects (heuristic)

**Model-pass subset (judgment):**
- A3 three or more consecutive paragraphs sharing sentence count and shape
- A4 a triad whose third item adds nothing
- A8 an essay that persuades or impresses; an operator doc with a personal voice
- A9 a lesson stated without the cost that produced it
- A12 a sentence that could have been written by someone who never ran a business
- A14 tension resolved before the evidence resolves it

**Constitutional.** Yes. A tells pass reports problems; it never proposes replacement text. The
rule subset cannot rewrite or praise by construction.

**Effort.** Small. The lexical lists already exist in `Prose Linter.md`; the model prompt is a
variant of the shipped paragraph/document scaffolds. Run the constitution harness before enabling
the model pass, per `AGENTS.md`.

**Why first.** It is the single largest ready-to-add item: the content is written, the machinery
exists, and it addresses the post's central anxiety.

---

### 7.2 Complete the deterministic diagnostics (rule engine / metrics)

**Proposal.** Extend the metrics panel from rhythm-only to the Sword/Williams/Lanham diagnostic set,
and expose the Lard Factor between revisions.

**Research.** The style authorities the post points at are, almost without exception, counting
exercises:

- Joseph Williams, *Style: Lessons in Clarity and Grace* — characters and actions, topic and stress
  position, cohesion, concision. (Already two model passes.)
- Helen Sword, *The Writer's Diet* — a five-part test counting be-verbs, abstract nouns,
  prepositions, adjectives/adverbs. Designed to be run mechanically; gives a "flabby / fit / toned"
  verdict.
- Richard Lanham, *Revising Prose* — the Paramedic Method (circle prepositions, circle "is" forms,
  find the action, put it in a simple verb) and the **Lard Factor**: (original words − revised
  words) / original words.
- George Gopen & Joseph Swan, *The Science of Scientific Writing* (American Scientist, 1990) — reader
  expectations: topic position, stress position, old-before-new. The theory behind Williams.

**Where.** `src/core/metrics.ts` (pure, currently returns sentence count, word count, sentence
lengths, mean, variance, longest sentence, adverb count, adverb density) and
`src/editor/MetricsPanel.tsx`.

**Additions (all deterministic):**
- **Be-verb density** — forms of *be* per 100 words.
- **Prepositional-phrase density** — prepositions per sentence.
- **Abstract-noun density** — `-tion / -ment / -ance / -ence / -ency / -ity / -ness / -ism` endings
  (overlaps the `nominalizations` pass, but as a *trend* rather than a list of instances).
- **Concreteness proxy** — ratio of abstract nouns to concrete/temporal nouns.
- **Lard Factor** — between any two Revisions, using the existing word-level diff
  (`src/core/wordDiff.ts`).
- Optional, shown-not-enforced: reading ease and lexical density, with a caveat that readability
  formulas are crude and should inform, never drive, the edit.

**Constitutional.** Yes — metrics never touch prose, and they cannot praise (they are numbers).

**Effort.** Small to medium. Pure functions over the canonical string; straightforward tests. This
is the "free tier" in the spirit of `docs/adr/0003-rule-passes-not-model-passes.md`.

**Why it matters.** It makes progress visible instead of felt. The Lard Factor in particular gives
the writer the number the post's author wanted and then ignored — and giving the number while
refusing to enforce it is exactly the "no length gate" position the spec already takes.

---

### 7.3 Global-before-local revision ordering (mechanic)

**Proposal.** Sequence passes so the writer works structure before paragraphs before words, and hold
local passes until the structural ones are worked.

**Research.** This is the most consistent finding in the revision literature:

- Nancy Sommers, *Revision Strategies of Student Writers and Experienced Adult Writers* (1980) —
  inexperienced writers revise at the word level; experienced writers revise for meaning and
  structure, then mechanics.
- Linda Flower, *Writer-Based Prose* (1979) — the developmental move is from writer-based to
  reader-based prose, which is a restructuring, not a rewording.
- Bereiter & Scardamalia, *The Psychology of Written Composition* (1987) — knowledge-telling versus
  knowledge-transforming: a tool that only flags surface errors keeps the writer in knowledge-telling.
- The post implies the order ("overall structure … then paragraphs … then word choices"), and your
  own `Prose Linter.md` states it outright: *"Order. Structure first, then mechanics, then words."*

**Where.** A new pure function beside `structuralPasses` and `rulePassesToRun` in `src/core/pass.ts`,
surfaced in `src/editor/ModelPassesPanel.tsx`.

**Shape.** A recommended queue: document-scope structural passes first, then paragraph-scope passes,
then rule passes. Local passes can be run out of order deliberately, but the default presents the
global before the local.

**Constitutional.** Yes. It reorders analysis; it adds no affordance.

**Effort.** Small.

**Why it is high leverage.** It changes *what the writer attends to*, not merely what is flagged.
Everything else on this list makes the tool see better; this makes the writer think better, which is
the question the brief actually asks.

---

### 7.4 Harden the praise linter against outcome praise and indirect sycophancy (model pass)

**Proposal.** Add a cheap classification pass that scans returned text for praise and
sycophancy-shaped content, complementing the regex linter, and extend the pattern set with outcome
praise.

**Research.** §6.1. Sycophancy is indirect and dominated by outcome praise. A regex built around
"great job" will miss "that's a genuinely insightful framing." Cheng et al.'s "social sycophancy"
adds the implicit forms: validation, indirectness, acceptance framing.

**Where.** `src/core/lintViolations.ts` (patterns) plus a new analysis-only model call whose output
is a Violation, not prose.

**Shape.** Either (a) a widened pattern set including insight/ability/development praise
lexicon, or (b) a second, cheap model call that labels each returned finding as praise / not. Option
(b) closes the gap the regex cannot; option (a) is free and immediate. Both are worth doing — (a)
first.

**Constitutional.** Yes. Classification produces a Violation and a struck-through display; it never
produces prose and never inserts.

**Effort.** (a) small; (b) medium.

**Symmetric note.** Because negative person-directed feedback also harms performance (§6.2), a
"false severity / hostile diagnosis" check is defensible as a companion. This is a genuine
extension, not a mirror-for-its-own-sake.

---

### 7.5 Argument-level passes — the real "think better" layer (model pass)

**Proposal.** Add passes that examine the argument rather than the prose: claim without grounds,
missing warrant, unsupported confidence, absent counterargument.

**Research.** Every model pass today is prose-level. Your own `Prose Linter.md` has an H1–H5 honesty
section (claim past evidence, hypothesis as finding, untested prescription, abstraction for example)
that is *not* a shipped pass. Toulmin, *The Uses of Argument* (1958), gives the standard decomposition
— claim, grounds, warrant, backing, qualifier, rebuttal — and each part is a checkable question.

**Where.** `src/core/starterPasses.ts`, document- or section-scope, findings output.

**Sketch prompts (analysis only — no rewrite field, constitution clauses appended):**

- **Claim without grounds:** "For each claim in this section that asserts something about the
  world, quote the claim. State whether the section supplies evidence for it. Do not judge whether
  the claim is true; judge only whether support is present in the text."
- **Missing warrant:** "Quote any conclusion that only follows if the reader accepts a premise the
  section does not state. Name the unstated premise as a question."
- **Unsupported confidence:** "Quote any assertion stated with certainty whose support is weaker
  than the assertion's confidence implies."
- **Counterargument absence:** "Name the strongest objection a sceptical reader could raise to this
  section's central claim, and state whether the section addresses it."

**Constitutional.** Yes. All four are analysis; none proposes text. This is the highest-ceiling item
on the list because it is the only one that turns a copyeditor into a thinking tool.

**Effort.** Medium — new prompts, harness coverage, but no new machinery.

**Dependency.** Benefits from §7.3 (run after the structural passes) and from the document-scope
chunking already built for the `topic-strings` pass.

---

### 7.6 The structural-revision meter (mechanic)

**Proposal.** Measure whether a revision *rethought* the piece or merely edited its words, and show
it.

**Research.** Sommers (1980) again: the difference between a novice and an experienced reviser is
whether meaning-level structure changed, not whether words changed. The post's central claim — "the
rethinking was the voice" — is precisely this distinction.

**Where.** `src/core/wordDiff.ts` (already built), revisions, and the Judge panel. The diff already
contains the answer: a revision that changes 92% of words but moves no paragraph and reorders no
section is a surface edit, and the tool can say so.

**Shape.** For any two Revisions, report: word-change ratio, paragraph-count delta, paragraph-order
changes, section-order changes, and a one-line characterisation ("surface edit" vs "structural
revision").

**Constitutional.** Yes. It is a diff statistic; no model, no prose.

**Effort.** Small — the data exists; this is arithmetic and presentation.

**Why it is on-thesis.** It turns the post's most important claim into a measurement, and it gives
the writer a reason to make the *satisfying* edits (the ones §5.2 hides) rather than the cheap ones.

---

### 7.7 Close the learning loop from declines to rule config (mechanic)

**Proposal.** When the writer declines the same item repeatedly, offer to fold it into the rule
config — add the word to the hedge list, the phrase to the worn-phrases list — or start a "voice"
list that is explicitly exempt.

**Research.** The post: "whatever anybody comes up with on their own is better, for themselves, than
someone else's." The workbench lets you *author* passes; nothing yet learns from your *rejections*.
Feedback research (§6.2) says acceptance depends on relevance and specificity; a rule that keeps
flagging a word you have chosen three times is neither.

**Where.** `src/storage/findings.ts` (decline writes) feeding `src/core/pass.ts` rule config; a
suggestion surface in `RulePassesPanel.tsx`.

**Constitutional.** Yes. It edits rule data, never prose. Exempting a word is the writer exercising
Rule 1 against the tool.

**Effort.** Medium.

**Caution.** Declines are currently logged with `declineReason: "advice" | "violation"`.
Distinguishing "I disagree" from "already handled elsewhere" would sharpen the signal; that is a
`CONTEXT.md` change and should go through `/domain-modeling` per `AGENTS.md`.

---

### 7.8 Deepen the reader pass (model pass)

**Proposal.** Add a document-scope reader account and two section-level probes.

**Research.** Flower's writer-based/reader-based distinction and Pinker's "curse of knowledge"
(*The Sense of Style*, 2014) say the writer's failure is assuming the reader shares context — which
is exactly the post's stated reason you must write for yourself. Comprehension research (Kintsch;
van Dijk & Kintsch) says the *global* situation model is what carries understanding; a per-section
account tests local comprehension only. Garden-path and reanalysis costs (Frazier & Rayner) give the
"where would a reader stop and re-read" probe its grounding.

**Where.** `src/core/reader.ts`, `src/storage/readerAccounts.ts`, `src/editor/ReaderPanel.tsx`.

**Additions:**
- A **document-scope** reader account (does the argument hold across sections, not just within one).
- Section probe: **"Where would a reader stop and re-read?"** — surfaces local ambiguity and
  reanalysis cost.
- Section probe: **"What question is left open at the end of this section?"** — surfaces the gap the
  next section must close.

**Constitutional.** Yes. `ReaderAccount` is a closed analysis schema with no rewrite field, and
accounts never enter the Findings queue.

**Effort.** Medium — but **not** because of a migration. A new *unindexed* field on
`ReaderAccountRecord` follows the existing `tags`/`status` pattern: no Dexie version bump is needed
(`docs/migrations.md`: "A new field on an existing record is read through a normalizer with a
default ... so it needs no migration at all"). The real cost is that no `normalizeReaderAccount`
exists yet — reader accounts are read straight from storage — so one has to be written, and an
*indexed* field would still require a migration that must ship alone.

---

### 7.9 Turn the Judge into a calibration instrument (mechanic)

**Proposal.** Before the Judge runs, ask the writer which version *they* think is clearer. Then show
the delta.

**Research.** Judgment-calibration and testing-effect research: predicting before seeing feedback
improves the calibration of the predictor. The Zheng et al. finding that a strong judge agrees with
humans only ~80% of the time means the Judge should be a mirror, not an oracle — when the writer and
the Judge disagree, that disagreement is the useful information.

**Where.** `src/editor/JudgePanel.tsx`, beside the existing "both extracted passages shown before
sending."

**Constitutional.** Yes — and it strengthens the constitution, because it keeps the writer's
judgment in the loop rather than delegating quality to the model.

**Effort.** Small.

---

### 7.10 Richer screening frames, per pass (setting)

**Proposal.** Replace the single global screening-frame toggle with a small set of frames, selectable
per pass.

**Research.** The post admits the "editor screening submissions" trick overshoots. Audience-analysis
research (Flower) treats the reader model as a design variable, not a constant.

**Where.** `src/core/screeningFrame.ts`, `src/storage/settings.ts`, `src/settings/AiSettingsView.tsx`.

**Candidate frames.** sympathetic editor; busy skimmer; hostile domain expert; the student who must
act on the piece. Each changes what the critic attends to.

**Constitutional.** Yes, with the standing constraint that **the Judge gets no persona** — the
screening frame applies to the Critic only, as `DESIGN.md` §3 already states.

**Effort.** Small.

---

### 7.11 A concreteness and abstraction pass (rule pass)

**Proposal.** Flag abstract-noun density and category labels standing where a specific belongs.

**Research.** Orwell's fourth rule ("never use a long word where a short one will do") is already in
the exclusive pass; the Prose Linter's M14 ("be specific, concrete and definite") is not a pass.
Concreteness is a recurring finding across composition research and plain-language guidance.

**Where.** `src/core/rulePass.ts`, alongside `matchNominalizations`.

**Shape.** Abstract-noun density per paragraph (rule-based threshold) plus a model companion for
A11 (category label where a person, moment or number belongs). Overlaps §7.1 and §7.2; could be
folded into either.

**Constitutional.** Yes.

**Effort.** Small.

---

## 8. Prioritised roadmap

The shortest path to "more of what the research says," in order.

| Priority | Item | Type | Effort | Why now |
|---|---|---|---|---|
| 1 | §7.1 AI-tells pass (A1–A14) | Rule + model | Small | Content already written; the post's central fear |
| 2 | §7.3 Global-before-local ordering | Mechanic | Small | Highest leverage for *thinking* better; docs already commit to the principle |
| 3 | §7.2 Diagnostics + Lard Factor | Rule / metrics | Small–medium | Free, deterministic; makes progress visible |
| 4 | §5.1 Promote passive to its own pass | Rule | Small | The post's first-named fault, currently off |
| 5 | §7.5 Argument-level passes | Model | Medium | The only item that raises the ceiling to thinking |
| 6 | §7.4 Sycophancy hardening | Rule + model | Small–medium | Grounded in the strongest empirical findings |
| 7 | §7.6 Structural-revision meter | Mechanic | Small | Uses diff data already stored; on-thesis |
| 8 | §5.2 Reconsider off-by-default passes | Defaults | Small | Defaults are the product |
| 9 | §7.9 Judge calibration | Mechanic | Small | Small, high insight-per-effort |
| 10 | §5.3 Batch decline | Mechanic | Small | Makes deference cheap |
| 11 | §7.7 Decline → rule-config loop | Mechanic | Medium | Makes "your own list" real over time |
| 12 | §7.8 Reader extensions | Model | Medium | Unindexed field → no migration, but needs a `normalizeReaderAccount` |
| 13 | §7.10 Frames per pass | Setting | Small | |
| 14 | §7.11 Concreteness pass | Rule | Small | Fold into §7.1 or §7.2 |

**Sequencing constraints from the repo:**

- A pass-prompt change requires a `pnpm run harness` run (`AGENTS.md`).
- A schema change (e.g. §7.8) requires a migration, and `docs/migrations.md` forbids shipping a
  migration in the same deploy as a behaviour change.
- Any new user-visible affordance must pass `scripts/gates/affordances.mjs`; none of the proposals
  above adds one.
- Any genuinely new term (e.g. "Lard Factor", "voice list", "revision meter") should be flagged for
  `/domain-modeling` and added to `CONTEXT.md`.

---

## 9. Minor findings

Unrelated to the post, found during the survey.

1. **The `note` output shape is selectable but cannot run.** `OutputShape` includes `"note"`, and
   `OUTPUT_SHAPES` exposes it in the Workbench dropdown, but `critique` throws
   `UnsupportedOutputShapeError` for anything other than `findings`, and `readSection` handles only
   `section-summary`. There is no runner, parser, storage or display for a `note` pass. Either
   implement it or remove it from the dropdown, because a shape a writer can select and then cannot
   run is a broken promise.
2. **Privacy-page typos.** `src/privacy/privacyContent.ts` contains "broswe" and "No one including
   Cloudflare will ever sees". The content is data asserted by tests, so the fix is a data edit plus
   a test update.
3. **Style-guide filename.** The style guide was misspelled and referenced nowhere. **Fixed in
   v1.1** — renamed to `Economist Writing Style Guide.md`.

---

## 10. Appendix: the literature

**On the method itself**

- Sockpuppet, *How To Write With An LLM — A Final Ward*, 2026-09-17.

**Style and clarity (the tradition the post recommends)**

- Joseph M. Williams, *Style: Lessons in Clarity and Grace* — characters and actions; topic and
  stress position; cohesion; concision.
- George D. Gopen & Judith A. Swan, "The Science of Scientific Writing," *American Scientist*, 1990
  — reader expectations; topic and stress positions; old-before-new.
- Helen Sword, *The Writer's Diet* — be-verbs, abstract nouns, prepositions, adjectives/adverbs.
- Richard A. Lanham, *Revising Prose* — the Paramedic Method; the Lard Factor.
- George Orwell, "Politics and the English Language," 1946 — the six rules.
- Steven Pinker, *The Sense of Style*, 2014 — classic style; the curse of knowledge.

**Writing as thinking, and revision**

- Linda Flower, "Writer-Based Prose: A Cognitive Basis for Problems in Writing," *College English*,
  1979.
- Linda Flower & John R. Hayes, "A Cognitive Process Model of Writing," *College Composition and
  Communication*, 1981.
- Nancy Sommers, "Revision Strategies of Student Writers and Experienced Adult Writers," *College
  Composition and Communication*, 1980.
- Carl Bereiter & Marlene Scardamalia, *The Psychology of Written Composition*, 1987 —
  knowledge-telling and knowledge-transforming.
- Peter Elbow, *Writing with Power* — the believing game and the doubting game.
- Betty S. Flowers, "Madman, Architect, Carpenter, Judge" — the four roles, with the judge last.
- Stephen Toulmin, *The Uses of Argument*, 1958 — claim, grounds, warrant, backing, qualifier,
  rebuttal.

**Feedback and praise**

- Avraham N. Kluger & Angelo DeNisi, "The effects of feedback interventions on performance,"
  *Psychological Bulletin*, 1996 — 607 effect sizes; over one third decreased performance;
  effectiveness falls as attention moves toward the self.
- John Hattie & Helen Timperley, "The Power of Feedback," *Review of Educational Research*, 2007.

**Language-model behaviour**

- Mrinank Sharma et al., "Towards Understanding Sycophancy in Language Models," ICLR 2024
  (Anthropic) — sycophancy across five assistants; human preference data incentivizes it.
- Lianmin Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena," NeurIPS 2023 —
  position bias, verbosity bias, self-enhancement bias; the swapped-order mitigation.
- Daniel Vennemeyer et al., "Sycophantic Praise: Evaluating Excessive Praise in Language Models,"
  2026 — praise is dominated by outcome praise and concentrated in socially interpretive domains.
- Myra Cheng et al., "Social Sycophancy: A Broader Understanding of LLM Sycophancy," 2025 —
  validation, indirectness, framing.

**Comprehension**

- Walter Kintsch, *Comprehension: A Paradigm for Cognition*, 1998; Teun van Dijk & Walter Kintsch,
  *Strategies of Discourse Comprehension*, 1983 — the situation model.
- Lyn Frazier & Keith Rayner, work on garden-path sentences and reanalysis cost.
