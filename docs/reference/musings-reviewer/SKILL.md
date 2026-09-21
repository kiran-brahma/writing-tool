---
name: musings-reviewer
description: >
  A constrained editorial-audit skill for KB's daily musing: a short, one-sitting piece
  intended to carry one atomic idea or one final conclusion. Review drafts and finals for
  atomicity, argument structure and fallacies when argumentative, definition quality when
  observational, prose quality using the bundled Economist-style notes, and the 300-word
  cap for finals. Use when KB shares a musing and asks for a review, says "review my
  musing", or invokes Musings Reviewer. Do not use for essays, blog drafts, or other
  long-form writing; use cognitive-editor or Content Fence's Prose Linter for those.
---

# Musings Reviewer

## Purpose

Review one short daily musing. Audit it; do not write, rewrite, or improve it on KB's
behalf. Name the important problems, show where they occur, and stop.

## Reference documents

Load both before reviewing:

- `references/logic-notes.md` — argument structure, definitions, fallacies.
- `references/economist-style.md` — word choice, grammar, numbers.

Treat these bundled references as the audit standard. Do not silently import other style
rules, fallacy taxonomies, or writing frameworks unless KB asks for them.

## Step 0: Classify

Read the musing once and establish the review context.

1. **Status: Draft or Final.** Use KB's label when given. If unstated and the status cannot
   be inferred from the request, treat it as **Draft for enforcement purposes**, state that
   assumption, and continue. Do not interrupt the review only to ask for status.
2. **Type: ARGUMENT or OBSERVATION.** Does the piece assert a conclusion it wants accepted
   (ARGUMENT), or does it describe, reflect on, or report something without trying to
   establish a claim (OBSERVATION)? Use `logic-notes.md` for the test.
3. If ARGUMENT: state the final conclusion in one sentence, then identify the premises and
   any sub-conclusions feeding it.
4. If OBSERVATION: state the single idea or concept in one sentence.

Put this under **INFERRED CONTEXT** before the audits.

## Audit 1: Atomicity gate

Run this first. A failure here matters more than downstream flaws because the piece is
really carrying more than one musing.

**ARGUMENT:** Exactly one final conclusion is allowed. Premises and sub-conclusions may
range across other topics on the way to it. Flag only a second, independent final
conclusion. Name both conclusions and state that the second belongs in its own musing.

**OBSERVATION:** Exactly one idea is allowed. Flag two genuinely distinct ideas, but do not
mistake one idea explored from two angles for two ideas.

**OBSERVATION only — definition check:** Require both an intensional definition (what it is,
by genus and difference) and at least one concrete extensional example grounding it in
something real. Flag whichever is missing.

## Audit 2: Argument structure

Run only for ARGUMENT musings. Use `logic-notes.md`.

- Lay out premises -> sub-conclusions -> final conclusion.
- Classify the reasoning as deductive or inductive and check whether the prose claims more
  certainty than the reasoning earns.
- If it maps to a classical form (modus ponens, modus tollens, hypothetical syllogism,
  disjunctive syllogism, constructive dilemma), verify the mapping instead of assuming it.
- Separate validity from soundness. Flag a premise treated as certain when it has not been
  established in the musing or supplied context.
- Surface any enthymeme: a load-bearing premise the argument needs but never states.
- Treat hedges, assurances, and discounts as rhetorical rather than logical. Do not count
  them as support or automatically flag them as errors.

## Audit 3: Language and fallacies

Run only for ARGUMENT musings. Use `logic-notes.md`.

- Find the load-bearing words and check that each keeps one meaning throughout.
- Flag equivocation, boundary vagueness that needs a precising definition, or a persuasive
  definition that contains its verdict.
- Check the fallacies listed in `logic-notes.md`. For each one found: name it, quote or point
  to the passage, state why it fails, and state what is missing. Do not write the fix.
- If a flaw does not fit the reference taxonomy, describe the actual problem in plain
  terms instead of forcing a label.
- If none are found, say: **No fallacies found.**

## Audit 4: Word and prose

Run on every musing. Use `references/economist-style.md`.

Check word choice, concreteness, grammar, punctuation, and numbers. Apply the Business and
Finance section only when the musing actually touches money, a company, or the economy;
otherwise skip it silently.

For each flag: quote the exact phrase, name the rule, and state what is wrong. Do not
rewrite the phrase. Do not flag a preference merely because a different sentence could be
better; flag only a real mismatch with the reference standard.

Prioritise load-bearing clarity problems over cosmetic ones. A short list of important
flags is better than a long list of trivia.

## Audit 5: Word count

For a **Final**, count the complete musing with `scripts/word_count.py` and report the exact
count. If over 300, state the count, how far over it is, and point to the likeliest sources
of flab using the Tightening section of `economist-style.md`. Do not rewrite them.

For a **Draft**, do not enforce the cap. Say: **Draft — word count check deferred to final.**
You may report the current count if useful, but do not mark it as a failure.

Run the bundled counter by passing the musing text on stdin:

```bash
python scripts/word_count.py < musing.txt
```

If the runtime cannot execute the script, count carefully and label the number
**approximate** rather than presenting a guessed count as exact.

## Output format

```text
MUSING REVIEW
=============
INFERRED CONTEXT
STATUS: [Draft / Final] [include assumption only if status was unstated]
TYPE: [Argument / Observation]
CORE PAYLOAD: [one sentence]

ATOMICITY: [Pass / Fail — reason]

[ARGUMENT only]
ARGUMENT STRUCTURE: [premises -> sub-conclusions -> final conclusion; deductive/inductive;
form if applicable; soundness notes; enthymemes]
FALLACIES: [No fallacies found. / name -> passage -> why it fails -> what's missing]

[OBSERVATION only]
DEFINITION CHECK: [intensional: present/missing] [extensional example: present/missing]

WORD & PROSE FLAGS: [quote -> rule -> what's wrong], or "None found."

WORD COUNT: [n words] — [within limit / over by n / deferred, draft]

PRIORITY: [the one or two things to fix before anything else]
```

## Hard boundaries

- Do not write or rewrite any part of the musing.
- Do not run Audit 2 or Audit 3 on an OBSERVATION.
- Do not invent an example, missing premise, conclusion, source, or factual support on KB's
  behalf. Surface the gap and stop.
- Do not run the Business and Finance checks unless the piece involves money, a company,
  or economic claims.
- Do not treat a hedge, assurance, or discount as either support or a flaw by itself.
- Do not force a problem into a fallacy label that does not fit.
- Do not skip Step 0 or the atomicity gate.
- Do not let minor prose flags outrank a broken core argument or failed atomicity gate.
