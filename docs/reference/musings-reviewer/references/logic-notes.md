# Logic Reference

Condensed from KB's own notes (deductive logic, argument identification, language and
definitions, informal fallacies). Used only for ARGUMENT-type musings, except the
definitions section, which also applies to OBSERVATION-type musings.

## Classifying the piece

A musing is an ARGUMENT if it asserts a conclusion it wants accepted — there is a claim,
and other statements in the piece are offered as reasons for it (words like "so",
"therefore", "because" are a hint, but not proof; the test is whether a statement is doing
evidential work or just explaining/describing).

A musing is an OBSERVATION if it reports, describes, or reflects on something without
trying to establish a conclusion. A report or an explanation is not an argument.

## Argument structure (ARGUMENT type only)

- Identify every premise, every sub-conclusion, and the one final conclusion.
- A sub-conclusion is a premise for something further down the chain — this is normal and
  does not break atomicity. Only a second, independent *final* conclusion breaks it.
- Deductive vs inductive: does the argument claim the conclusion is guaranteed by the
  premises (deductive) or only made probable (inductive)? Don't demand deductive certainty
  from an inductive musing, but do flag if it's dressed up as more certain than it is.
- Valid forms to check reasoning against when applicable: modus ponens, modus tollens,
  hypothetical syllogism, disjunctive syllogism, constructive dilemma. Not every argument
  fits one of these — most everyday reasoning won't, and that's fine. Use them to catch
  cases where the piece thinks it's using one of these forms but the structure is actually
  broken (e.g. affirming the consequent).
- Valid ≠ sound. A valid chain with a false or unsupported premise is not yet earned. Flag
  premises presented as certain that KB hasn't actually established or sourced.
- Enthymeme check: is a load-bearing premise left unstated? Surface it rather than let the
  argument coast on an assumption the reader has to supply.
- Discounts ("although", "I realise that... but"), hedges ("I think", "perhaps"), and
  assurances ("clearly", "obviously") are rhetorical, not logical. Don't count them as
  support for the conclusion, and don't flag them as flaws either — just don't let them
  smuggle in unearned confidence (assurances) or count as evidence.

## Definitions and language (both types, when the piece turns on a key term)

- Ambiguous word: has multiple meanings — flag if the piece could shift between them
  without noticing.
- Vague word: meaning is clear but its boundary isn't (e.g. "successful") — ask for a
  precising definition (a stated threshold) if the conclusion depends on the boundary.
- Equivocation: the same word carries two different meanings at two points in the same
  piece, and the argument's logic depends on treating them as one. This is the single most
  useful check for a short piece — find the load-bearing words and check each means the
  same thing everywhere it appears.
- Cognitive vs emotive meaning: strip loaded language from a sentence and restate it
  neutrally. If nothing true survives, the sentence was doing emotional work, not
  argumentative work.
- Persuasive definition: a definition that already contains the verdict ("bureaucracy"
  instead of "process") before the argument has earned it.
- Intensional definition (genus + difference): what class does this idea belong to, and
  what specifically separates it from other members of that class? Required for
  OBSERVATION-type musings.
- Extensional definition (example): at least one concrete instance that shows the idea
  applying to physical reality. Required alongside the intensional one for
  OBSERVATION-type musings — intension alone stays abstract.
- Good-definition checks: not too broad, not too narrow, not circular, not needlessly
  obscure, not resting on an irrelevant characteristic.

## Fallacies (ARGUMENT type only)

When flagging, name the fallacy, quote or point to the exact passage, state why it fails,
and note what's missing — never write the fix.

**Fallacies of irrelevance**
- Ad hominem (abusive / circumstantial / tu quoque) — attacking the arguer, not the
  argument. Legitimate only when the person's reliability is itself the question at issue
  (e.g. an appeal to authority whose authority is in doubt).
- Appeal to force (ad baculum) — a threat standing in for a reason.
- Appeal to the people (ad populum) — group belonging standing in for a reason.
- Appeal to pity (ad misericordiam) — sympathy standing in for a reason.
- Appeal to ignorance (ad ignorantiam) — "not proven false" therefore true, or vice versa.
  Exception: genuine absence-of-evidence reasoning (noseeum) can be legitimate when
  absence would actually be expected if the claim were true.
- Red herring — premises support one topic, the conclusion jumps to another.

**Fallacies of ambiguity**
- Equivocation (see above).
- Amphiboly — the sentence structure itself, not a word, creates the ambiguity.
- Composition — inferring a property of the whole from properties of the parts, or of a
  group from properties of its members.
- Division — the reverse: inferring a property of a part or member from a property of the
  whole or group.

**Fallacies of unwarranted assumption**
- Begging the question — the conclusion is smuggled into the premises in different words.
- False dilemma — presenting two options as exhaustive when they aren't.
- Appeal to unreliable authority — the authority is doubtful, or is being cited outside
  their actual field of expertise.
- False cause — correlation treated as causation, with no ruling-out of alternative
  explanations. Slippery slope is the special case: an assumed chain reaction with no
  evidence it will actually occur.
- Complex question — a question that assumes an unestablished conclusion no matter how
  it's answered.

This list is not exhaustive. Do not force an observed flaw into one of these labels if it
genuinely doesn't fit — describe the actual problem instead.
