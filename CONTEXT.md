# Obelus

A browser-only writing tool that uses language models as a copyeditor and a judge, never as a
ghostwriter. This glossary is the project's shared language: code, tests, issues and commits use
these terms and no others.

## The work

**Writer**:
The person using Obelus, and the author of everything in it.
_Avoid_: user, author, owner, operator

**Document**:
One piece of writing. The only noun for a piece of work.
_Avoid_: draft, piece, article, text, file

**Section**:
A heading-delimited division of a Document.
_Avoid_: chapter, part

**Outline**:
The list of a Document's Sections, derived from its headings; the Writer jumps between Sections by
it, and a structural pass receives it.
_Avoid_: table of contents, headings list

**Paragraph**:
A block of prose within a Section, and the unit a local pass is examined against.
_Avoid_: block

**Revision**:
One saved point in a Document's history. An *auto-revision* is taken on a debounce; a *flagged
revision* is marked by the Writer as a milestone and carries a note.
_Avoid_: snapshot, version, save, checkpoint

**Status line**:
The line beneath the prose, at every width, that carries the Document's word count. It is the tool's,
not the Writer's, so it is set in the sans.
_Avoid_: status bar, footer, word counter

**Library**:
Every Document held in this browser.
_Avoid_: workspace, project, vault

**Backup**:
One file holding the whole Library, so an eviction is survivable. A backup excludes API keys unless
the Writer explicitly opts in.
_Avoid_: archive, dump, snapshot, export

**Restore**:
Replacing this browser's Library with a Backup, behind an explicit confirmation. The mechanism is an
import; the action is a restore.
_Avoid_: load, sync, recover

**Bundle**:
One Document as a single file, carrying its Revisions, Findings, Run results and Reader accounts, so
it can move intact.
_Avoid_: package, archive, export

## Analysis

**Pass**:
A configured analysis of a Document — a rule pass or a model pass — with a scope and an output shape.
_Avoid_: check, task, lint

**Rule pass**:
A Pass implemented as deterministic rules over text, so it can neither praise nor rewrite.
_Avoid_: Tier 1, mechanical pass, lint

**Exclusive rule pass**:
A Rule pass that runs alone: while it is on, the other rule passes are held, so its report is not
buried among theirs. George Orwell's rules is one.
_Avoid_: solo mode, profile, override

**Model pass**:
A Pass implemented as a call to a model.
_Avoid_: Tier 2, AI pass, LLM pass

**Rule config**:
The editable data behind a rule pass: its word lists, patterns and windows.
_Avoid_: settings, options, config

**Voice list**:
The words and phrases the Writer has declared as theirs, which no Pass may flag as a problem.
_Avoid_: allowlist, exemption list, ignore list, protected words

**Pass scope**:
How much of a Document a Pass is shown: `document`, `section` or `paragraph`. A *structural pass* is
`document`-scope; a *local pass* is `paragraph`-scope.
_Avoid_: range, coverage

**Working order**:
The recommended sequence in which the Writer works the Passes — structure, then paragraph, then
word — derived from Pass scope. A recommendation, never a gate.
_Avoid_: revision order, pass order, pass stage

**Band**:
One of the three divisions of the Working order — structure, paragraph, word — derived from a Pass's
kind and scope rather than stored. The Writer navigates by Band; every Band is one click away from
every other, and no Band is gated on another.
_Avoid_: stage, tier, phase, step, section

**Rail**:
The surface beside the prose, in two Rail modes. Findings mode holds the Band control, **All**, the
selected Band's Passes with their Findings and accounts, and the run controls; Judge mode holds the
Judge with milestones and Revisions (ADR 0012). It collapses so the prose has the width. Below 1024px
it overlays the prose instead of sitting beside it, and starts closed on every load.
_Avoid_: sidebar, panel, drawer, nav

**Rail mode**:
One of the Rail's two views — Findings or Judge — switched at its top. The Rail opens on Findings
each session, and the mode is never stored. The queue keys act only in Findings mode; the modifier
step switches to it first.
_Avoid_: tab, view, page, screen

**Target**:
The text a Run is asked about.
_Avoid_: selection, focus, scope

**Containment**:
The rule that a Finding anchored outside the Target is discarded, with the count reported.
_Avoid_: scope enforcement, filtering, pruning

**Run**:
One execution of a Pass against a Revision, producing Findings.
_Avoid_: pass run, critique, job, analysis

**Finding**:
One problem a Run reports about the prose, anchored to the text it concerns.
_Avoid_: comment, note, issue, suggestion, flag, error

**Current Finding**:
The one open Finding the queue's selection is on. Its Highlight is distinguished from the others and
the Editor scrolls to it, so the prose and the queue never disagree about where the Writer is.
_Avoid_: active finding, selected finding, focused finding

**Anchor**:
The data tying a Finding to its text: the quoted span, with an offset as a hint.
_Avoid_: position, range, mark

**Highlight**:
The visual rendering of an Anchor. The Current Finding's Highlight is distinguished from the rest.
_Avoid_: underline, marker

**Callout**:
The popover a click on a Highlight or a Margin mark opens beside the prose: the open Findings on that
text, with the queue's verdicts. It does not change the Current Finding, so the Rail stays where the
Writer left it (ADR 0011).
_Avoid_: tooltip, popup, card

**Margin mark**:
The obelus, with a count, in the right-hand margin beside a Paragraph where open Findings begin. A
Finding is counted once, beside the Paragraph it begins in; an Orphaned Finding has none. A click
opens the Callout with those Findings. Kept although the Anchor entry lists *mark* under _Avoid_: that
avoid is about naming an Anchor, and a Margin mark is not one.
_Avoid_: badge, pin, gutter icon, marker

**Orphaned**:
The condition of a Finding whose quoted text can no longer be found, so it points nowhere. A
condition, never a status.
_Avoid_: lost, stale, dangling

**Violation**:
Praise or rewrite-shaped content caught in model output. About the model misbehaving, never about the
prose.
_Avoid_: breach, infraction, error

**Praise**:
Encouragement in model output. Rule 2 forbids it, and the praise linter is the check for it.
_Avoid_: encouragement, positive feedback

**Quarantined rewrite**:
Model-written prose that is displayed but can never enter a Document.
_Avoid_: diagnostic rewrite, proposed text, suggestion, draft

**Starter pack**:
The default Pass set that ships with Obelus.
_Avoid_: presets, defaults, built-ins

## Roles and connections

**Provider**:
A vendor that serves models: OpenAI, Anthropic, Google, OpenRouter, Ollama.
_Avoid_: vendor, service, backend

**Protocol**:
A wire format: `openai-shaped`, `anthropic-shaped` or `gemini-native`.
_Avoid_: API, dialect, provider API

**Connection**:
A configured route the Writer creates: a Protocol, a base URL, a key and a concurrency cap. The
model a Run uses is chosen per Slot, not on the Connection; a Connection's own model is only a
fallback for a Slot that names none.
_Avoid_: provider config, provider, endpoint, credentials

**Slot**:
A named place a Connection and a model are assigned. There are two: `critic` and `judge`. The two
Slots may share one Connection while naming different models, so the Judge can be independent
without a second route to the Provider. An empty model inherits the Connection's own.
_Avoid_: role, position, model slot

**Critic**:
The Slot that runs model passes and finds problems.
_Avoid_: reviewer, editor, coach

**Judge**:
The Slot that compares two versions of a passage and answers which is clearer, receiving the two
passages and nothing else.
_Avoid_: evaluator, scorer, arbiter

**Screening frame**:
The Critic's standing instruction to read the piece as an editor screening a submission. It applies
to the Critic only.
_Avoid_: persona, system prompt

**Skimmer**:
A screening frame: a reader with no time and no patience.
_Avoid_: busy reader, skimming

**Skeptic**:
A screening frame: a hostile domain expert who doubts the claim.
_Avoid_: adversary, critic

**Practitioner**:
A screening frame: someone who has to act on this advice this week.
_Avoid_: operator, user

**reader**:
The human who reads the finished prose. Always the human.
_Avoid_: audience, consumer

**Reader pass**:
The model pass that reconstructs what a reader takes away from a Section.
_Avoid_: Reader, reconstruction, takeaway

**Reader account**:
A Reader pass's output: what a Section says, what a distracted reader would miss, and the gap
between the two.
_Avoid_: summary, reader report

**Audit pass**:
The model pass that examines whether a piece's reasoning holds up.
_Avoid_: review, critique, argument pass

**Audit account**:
An Audit pass's output: the piece's argument map, any fallacies or definition gaps, and the findings
that matter most.
_Avoid_: report, notes, argument account

**Lard Factor**:
The share of an earlier Revision's words that a later Revision removes, so progress is visible rather
than felt; it is negative when the later Revision is longer. A signal, not a verdict: it gates
nothing.
_Avoid_: lard score, cut ratio, reduction

## The judge's answers

**Verdict**:
The Judge's answer: which passage is clearer, how confident it is, and its reasons with quoted
evidence.
_Avoid_: score, rating, result, judgment

**Unstable**:
The condition of a Verdict that changes when the passage labels are swapped. Reported as unstable
rather than as a preference.
_Avoid_: flaky, inconsistent, tie

**Prediction**:
The Writer's own call, recorded before a Judge run, of which passage is clearer. Held in memory for
the session only, never persisted, never sent to a model, and never a gate on the run; shown beside
the Verdict so the Writer can see whether their judgment agrees with the Judge's.
_Avoid_: guess, bet, expectation

## Status

**Finding status**:
One of exactly three: `open`, `addressed`, `declined`. A declined Finding records why — the advice
was rejected, or the model breached the constitution.
_Avoid_: resolved, rejected, dismissed, closed, done

**Document status**:
One of exactly three: `draft`, `revising`, `done`.
_Avoid_: state, stage, progress

## The constitution

**Constitution**:
Obelus's standing constraints: model output is analysis and never prose, and every request leaves the
Writer's browser.
_Avoid_: invariants, principles, rules, guidelines

**Rule 1**:
The source method's first rule — the Writer may not use a single word a model suggests.
_Avoid_: the rules, the suggestion ban

**Rule 2**:
The source method's second rule — avoid encouragement.
_Avoid_: the rules, the praise ban
