# Spec — Obelus v1

The implementation contract for the whole of v1. The design record is `DESIGN.md`; where the two
disagree, `DESIGN.md` is the reasoning and this is the requirement.

## Problem Statement

Writers who use frontier models to improve a draft get quietly worse. Two things cause it, and
neither feels like a problem while it is happening:

1. Models are supernaturally good at selecting pleasing turns of phrase. Accept one and the draft
   stops sounding like its author — readers detect it instantly even when they cannot name it.
2. Models praise. Told that a weak first draft is strong, a writer doubles down on first-draft
   impulses instead of rethinking the paragraphs that needed rethinking. The rethinking was the
   voice.

So the writer is left with a choice between two bad options: an LLM that improves the prose and
dissolves the voice, or no LLM at all, which means doing the tedious error-finding by hand — the
exact work a model never gets tired of.

There is a method that gets the labor without the damage: the model finds flaws, the writer
rewrites, and a model with no knowledge of the editing process judges old against new. It works,
and it is exhausting to run by hand — multiple tabs, per-pass prompt juggling, and an endless
argument with the model about whether it is the author.

## Solution

Obelus: a writing tool that uses models as a copyeditor and a judge and never as a ghostwriter. It
marks. It never holds the pen.

The writer drafts in a Notion-style editor. Rule-based passes run free and instantly on every save,
flagging mechanical problems. Model passes run on demand and return findings anchored to exact
quotes in the text, listed beside the prose in a sidebar grouped by pass. The writer rewrites in
their own words, marks findings addressed or declined, and steps forward and back through what is
left. When a paragraph has been rewritten, the writer asks the judge: two versions of the passage,
labels randomised, no document, no history, no mention that anyone edited anything. The judge runs
twice with the labels swapped; if it changes its mind, the tool says so.

Three properties make this safe rather than merely convenient. There is no insert button anywhere —
the only way text enters a document is the writer's keyboard. Praise is prompt-banned and then
linted on the way in, and when it appears it is shown struck through rather than hidden, so prompt
drift is visible. Rule passes are regular expressions, which cannot flatter or rewrite anyone.

Everything runs in the browser. Documents, revisions, findings and API keys live in IndexedDB; the
only outbound requests go to the Connection the writer configured. There is no account, no
sync, no telemetry, and no server of ours — because there is no server. The privacy page does not
ask to be trusted; it explains how to check.

## User Stories

### Getting set up

1. As a writer, I want to open a URL and start writing immediately, so that I do not have to create an account to use a tool that stores nothing about me.
2. As a writer, I want to configure an OpenAI-shaped Connection by supplying only an API key and a model, so that the base URL, auth header and protocol are not my problem.
3. As a writer, I want to configure Anthropic by supplying only an API key and a model, so that the required version header and browser-access header are handled for me.
4. As a writer, I want to configure Google Gemini by supplying only an API key and a model, so that I do not need to know whether it takes a header or a query parameter.
5. As a writer, I want to configure OpenRouter by supplying only an API key and a model, so that I can reach many models through one provider.
6. As a writer, I want to configure a local Ollama instance, so that I can run passes with no key and no cost.
7. As a writer, I want to add a Custom Connection with an editable base URL, so that I can point Obelus at my own self-hosted proxy.
8. As a writer, I want the model field to accept free text, so that a model released this morning works without waiting for an app update.
9. As a writer, I want a "list models" action that queries my Connection, so that I can discover a model id without leaving the app.
10. As a writer, I want a "test connection" action on every Connection, so that I learn about a bad URL or key immediately rather than in the middle of a Run.
11. As a writer, I want my API keys stored in this browser only, so that no third party ever holds them.
12. As a writer, I want an option to keep my key in memory only and re-enter it each session, so that I can choose the more secure mode when I need it.
13. As a writer, I want a clear statement that my key is sent only to the Connection I configured, so that I know what the app does with it.
14. As a writer, I want to choose which Connection acts as the Critic and which acts as the Judge, so that I can pair a cheap critic with a strong judge or the reverse.
15. As a writer, I want to be warned when the critic and the judge are the same model, so that I understand why the judge may not be independent.

### Writing

16. As a writer, I want a rich text editor with headings, emphasis, lists and quotes, so that I can structure a piece without fighting markup.
17. As a writer, I want my work saved automatically, so that I never lose a paragraph to a closed tab.
18. As a writer, I want to import an existing document as markdown, so that I can bring work I started elsewhere.
19. As a writer, I want to export any document as markdown, so that my words are never trapped in this tool.
20. As a writer, I want a library of my documents showing title, word count, last edited and how many findings are still open, so that I can see at a glance what needs attention.
21. As a writer, I want to search my documents by title and body text, so that I can find a piece I half-remember.
22. As a writer, I want to tag documents and filter by tag, so that I can group related pieces without a folder hierarchy.
23. As a writer, I want to mark a document draft, revising or done, so that I know where I left it.
24. As a writer, I want a scratchpad document to exist automatically, so that I have somewhere to put a thought without naming a file.
25. As a writer, I want the document outline derived from my headings, so that I can jump between sections and so that passes can reason about sections.

### Rule-based passes

26. As a writer, I want hedges and intensifiers flagged as I write, so that the sawdust gets swept without me reading for it.
27. As a writer, I want nominalizations flagged, so that I notice where an action has been buried in a noun.
28. As a writer, I want expletive and throat-clearing openers flagged, so that sentences start where the content starts.
29. As a writer, I want wordy constructions flagged, so that "in order to" becomes "to".
30. As a writer, I want repeated words and repeated sentence openers flagged, so that I catch the tics I cannot hear.
31. As a writer, I want sentence length and variance and adverb density shown, so that I can see a monotone rhythm rather than feel vaguely uneasy about it.
32. As a writer, I want rule passes to run automatically on save, so that the cheapest class of problem is always current.
33. As a writer, I want rule passes to run with no API key at all, so that the tool is useful before I have configured anything.
34. As a writer, I want to edit the word lists and patterns behind rule passes, so that the tool flags the words I actually overuse.
35. As a writer, I want to disable any individual rule pass, so that I can ignore advice I deliberately decline.

### Model passes

36. As a writer, I want to run a single pass on demand, so that I can work one kind of problem at a time.
37. As a writer, I want to run the structural set in one action, so that I do not have to trigger six passes by hand.
38. As a writer, I want the list of passes to ship with a starter pack, so that I have something to run before I have invented my own.
39. As a writer, I want to enable or disable any pass, so that the default set matches how I work.
40. As a writer, I want a pass that flags characters and actions, so that I can see where the actor is missing from the subject position.
41. As a writer, I want a pass that examines topic strings and stress position, so that I can see where consecutive sentences fail to cohere.
42. As a writer, I want a pass that proposes paragraphs which could move, so that I get the satisfying structural wins without hunting for them.
43. As a writer, I want a pass that questions paragraph unity, so that paragraphs carrying two ideas get split.
44. As a writer, I want a pass that proposes sentences which add nothing, so that I can find the words I do not need.
45. As a writer, I want a pass that flags cliché and headline-ese, so that the tool catches the specific failure of sounding like a magazine headline on every line.
46. As a writer, I want a pass that distinguishes undercutting hedges from unsupported confidence, so that I know whether to commit or to substantiate.
47. As a writer, I want local passes to receive my paragraph plus one paragraph either side and the heading outline, so that judgments about wordiness or cliché are made in context.
48. As a writer, I want structural passes to receive the whole document, so that advice about paragraph order is not given by something that cannot see the order.
49. As a writer, I want findings that fall outside the paragraph a pass was asked about to be discarded, so that running six passes does not produce six copies of one finding.
50. As a writer, I want a warning and a chunked alternative when a document is too long for a single call, so that long pieces still get structural passes.
51. As a writer, I want an estimate of the cost of a run before I trigger it, so that I am never surprised by a bill.
52. As a writer, I want a running total of what this session has cost, so that I can tell when to stop.
53. As a writer, I want repeated runs of the same pass on unchanged text not to be re-billed, so that re-running costs nothing.
54. As a writer, I want a run to be cancellable, so that a slow model does not hold the tool hostage.
55. As a writer, I want provider errors shown to me verbatim wherever the browser can read them, so that I can act on what the provider actually said — and an unreadable auth failure reported honestly as such, so that I am not shown a guess.
56. As a writer, I want a failed call to retry on rate limits and server errors, so that a transient failure does not lose me a run.
57. As a writer, I want no more than a small number of requests in flight per provider, so that I do not trip rate limits by running passes in parallel.

### Findings

58. As a writer, I want every finding anchored to a highlight over the exact text it concerns, so that I can see what is being talked about.
59. As a writer, I want the anchor to follow the text when I rewrite it, so that comments do not go stale the moment I act on them.
60. As a writer, I want the sidebar grouped by pass rather than by location, so that I can complete one pass over the work before starting the next.
61. As a writer, I want findings listed in document order within a pass, so that I can work top to bottom.
62. As a writer, I want to step forward and back through open findings with the keyboard, so that reviewing is not a mouse hunt.
63. As a writer, I want to mark a finding addressed, so that addressed problems leave the queue.
64. As a writer, I want to decline a finding without justifying it, so that declining advice stays cheap.
65. As a writer, I want declined findings remembered, so that a pass does not raise the same objection twice.
66. As a writer, I want each finding to record which pass, which model, when and which revision produced it, so that I can tell whether advice came from a model I now distrust.

### The constitution

67. As a writer, I want no apply, accept or insert button anywhere in the app, so that there is no moment of weakness at eleven at night when I paste in a model's sentence.
68. As a writer, I want model responses constrained to a findings schema with no field for rewritten prose, so that the tool cannot hand me a sentence even if it wants to.
69. As a writer, I want a quarantined rewrite available only behind an explicit reveal, so that I can see what the model would have written without it being usable.
70. As a writer, I want the quarantined rewrite pane to be unselectable and to offer no insertion path, so that the only way its text enters my document is if I type it myself.
71. As a writer, I want praise detected and struck through rather than silently removed, so that I can see when a model ignores the instruction and can tell that my prompts have drifted.
72. As a writer, I want to decline a finding whose text was praise or a smuggled rewrite, so that polluted findings leave my queue.
73. As a writer, I want to view the raw provider response for any finding, so that I can debug a prompt or a provider rather than guess.
74. As a writer, I want no generation features at all — no continue writing, no rewrite, no title or outline generation — so that the tool has exactly one job.
75. As a writer, I want no paste policing and no minimum-length gate, so that the tool does not treat me as a suspect or a student.
76. As a writer, I want the critic to be framed as an editor screening a submission, so that it evaluates the piece rather than flattering the author.
77. As a writer, I want that screening frame to be switchable off, so that I can compare how the model behaves with and without it.

### The judge

78. As a writer, I want to compare two versions of a passage and get a verdict, so that I can tell whether my rewrite is actually better.
79. As a writer, I want the judge to receive nothing but the two passages and a neutral question, so that it cannot know I wrote either one.
80. As a writer, I want the judge to be told never to assume which passage is newer, so that recency does not masquerade as quality.
81. As a writer, I want the labels A and B randomised per call, so that position bias is not mistaken for a preference.
82. As a writer, I want the judge to run a second time with the labels swapped, so that a biased or indifferent verdict can be detected.
83. As a writer, I want a verdict that flips when the labels swap to be surfaced as unstable rather than reported as a preference, so that I am not fooled by a coin toss.
84. As a writer, I want the judge to receive no document, no history, no authorship and none of the findings, so that it cannot be anchored by the editing process.
85. As a writer, I want the judge to explain itself with quoted evidence from each passage, so that I can evaluate the reasoning rather than the verdict.
86. As a writer, I want the judge to list problems in each version separately, so that a single verdict still gives me actionable detail.
87. As a writer, I want to pick the two versions being compared from any two revisions, so that I can compare before a pass against now rather than only consecutive saves.
88. As a writer, I want to select a span or a section to judge, so that the comparison is the unit I am actually working on.
89. As a writer, I want to see both extracted passages before anything is sent, so that no text I have not read goes to a model.
90. As a writer, I want the judge to use a different model from the critic by default, so that independent judgment is the default rather than something I have to arrange.

### The reader

91. As a writer, I want a reader's account of what each section communicates, so that I can see the gap between what I meant and what arrives.
92. As a writer, I want that account to name what a distracted reader would miss, so that I find the places where I assumed too much.
93. As a writer, I want reader output shown in its own tab, so that it does not get mixed up with findings that still need work.

### Revisions

94. As a writer, I want auto-revisions of my document, so that I can return to a point from before a bad afternoon.
95. As a writer, I want to flag a major revision with a note, so that milestones in the document are findable later.
96. As a writer, I want to view a word-level diff between any two revisions, so that I can see what actually changed.
97. As a writer, I want to judge any two revisions, so that the comparison I care about is available.

### The pass workbench

98. As a writer, I want to write my own pass prompts, so that my own list of passes beats anyone else's default.
99. As a writer, I want to edit prompt text with placeholders for the document, target, context and outline, so that custom passes receive the right material.
100. As a writer, I want an unknown placeholder refused on save, so that a typo does not silently send the wrong text to a model.
101. As a writer, I want to choose a pass's scope and output shape, so that a custom pass can be local or structural, and can return findings or a summary.
102. As a writer, I want to import and export my pass set as JSON, so that my prompt work is portable and backed up.
103. As a writer, I want to restore the default pass set, so that I can recover from an experiment.
104. As a writer, I want help authoring pass prompts from a model, so that writing a good pass is easier than staring at a blank field.
105. As a writer, I want that assistant to work on my prompts and never on my prose, so that the assistance is legal under the tool's own rules.

### Privacy and durability

106. As a writer, I want a privacy page in plain language, so that I understand what happens to my words without reading a policy.
107. As a writer, I want instructions for verifying those claims myself, so that I do not have to take anyone's word for it.
108. As a writer, I want to open browser devtools and read my own documents out of IndexedDB, so that I can confirm my work is on my machine.
109. As a writer, I want to watch the network tab and see that requests go only to my Connection, so that I can confirm nothing is phoning home.
110. As a writer, I want the app to make zero outbound requests before I configure a Connection, so that a fresh install is provably silent.
111. As a writer, I want a whole-Library backup as a single file, so that clearing my browser does not destroy months of work.
112. As a writer, I want API keys excluded from backups unless I explicitly opt in, so that I do not accidentally publish my keys.
113. As a writer, I want a visible reminder of when I last backed up, so that an eviction is not the thing that teaches me to back up.
114. As a writer, I want a single-document export that includes revisions and findings, so that I can move one piece intact.
115. As a writer, I want the app to open offline with my existing documents, so that I can write on a plane.
116. As a writer, I want the app to refuse to open a database newer than the running code, so that a stale deployment cannot corrupt the Library.
117. As a writer, I want no analytics, no crash reporting and no usage counters, so that the privacy page describes the whole system.

## Implementation Decisions

### Module boundaries

Five modules, defined by responsibility. No file paths here; they will move.

- **Transport.** The single seam, and the only module that knows a wire format. `send(ModelRequest) -> Promise<string>`. Owns the Protocol table, one adapter per Protocol (`openai-shaped`, `anthropic-shaped`, `gemini-native`), retry honouring `Retry-After`, connection testing and model listing. The test implementation is a fixture player that records every request. Nothing above this seam knows which Provider is in use — the Provider layer is deliberately *not* a separate module, because a boundary that only rearranged request construction would be incidental complexity.
- **Core.** Everything that reasons about prose, with no wire shapes and no storage: `canonicalText`, tolerant parsing, the praise linter, Containment, the Run cache, `critique`, `judge`, `runRulePass`, `lintViolations`, `parseFindings`, and Anchor resolution (`resolveAnchor`, `projectInterval`). Pure and DOM-free.
- **Rule engine.** Pure functions from the canonical string plus Rule config to findings. Deterministic. Never touches the Transport.
- **Storage.** Dexie repositories for Documents, Revisions, Passes, Connections, Findings, judge runs and the Run cache. Forward-only migrations. One database, versioned.
- **Editor.** TipTap wiring, and rendering a resolved interval as a Highlight. It does not own Anchoring, does not match quotes, and never sees model output.

Entry points above the seam:

```
critique(target: Target, pass: Pass, connection: Connection, config: RunConfig): Promise<RunResult>
readSection(target: Target, pass: Pass, connection: Connection, config: RunConfig): Promise<ReaderRunResult>
judge(before: string, after: string, connection: Connection, config: JudgeConfig): Promise<JudgeResult>
resolveAnchor(anchor: Anchor, current: string, provenance: string): Interval | Orphaned
projectInterval(tree: DocTree, interval: Interval): EditorRange
canonicalText(tree: DocTree): string
runRulePass(canonical: string, ruleConfig: RuleConfig): Finding[]
lintViolations(raw: string): Violation[]
parseFindings(raw: string, shape: OutputShape): Finding[]
parseReaderAccount(raw: string): ParsedReaderAccount
```

### Protocols — verified facts

These were probed against live endpoints on 2026-09-19. Full detail, including streaming shapes and listing endpoints, is in `notes/provider-api-facts.md`. **Re-verify before implementing, and never hardcode a model list.**

| Prefilled Connection | Base URL | Protocol | Auth | Extra headers |
|---|---|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `openai-shaped` | `Authorization: Bearer` | — |
| Anthropic | `https://api.anthropic.com/v1` | `anthropic-shaped` | `x-api-key` | `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta` | `gemini-native` | `x-goog-api-key` | — |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai-shaped` | `Authorization: Bearer` | optional `HTTP-Referer`, `X-OpenRouter-Title` |
| Ollama local | `http://localhost:11434/v1` | `openai-shaped` | none | user sets `OLLAMA_ORIGINS` to the app origin |
| Custom | user-supplied | `openai-shaped` | user-supplied | — |

Gemini and Ollama both expose an OpenAI-compatible surface as well as their native one. Prefer the
native Gemini surface for `responseSchema` fidelity; the OpenAI-compatible surfaces of OpenRouter
and Ollama are handled by the OpenAI adapter.

**Ollama Cloud is deliberately not supported.** `ollama.com` returns `405` to CORS preflight with no
`Access-Control-Allow-Origin`, so a browser `fetch` is blocked, and Ollama's own documentation says
to keep API keys out of browser code. Cloud models remain reachable through a local Ollama daemon
after signing in, using the `:cloud` model suffix, with no key in the browser at all. A writer who
wants the hosted endpoint can point a Custom Connection at their own proxy. **No proxy is hosted by
this project** — a proxy that handles a user's key would falsify the central privacy claim.

### Provider-agnostic request

This shape is the contract between Core and the Transport, and it is where the
provider differences are absorbed.

```
ModelRequest {
  connection: Connection      // protocol, baseUrl, apiKey and extraHeaders live on the Connection
  model: string
  system?: string
  messages: { role: "user" | "assistant"; content: string }[]
  maxOutputTokens: number
  temperature?: number
  jsonSchema?: object
}
```

The request carries the **Connection**, not a loose protocol/base URL/key/header bag. That is what
makes "nothing above this seam knows which Provider is in use" true rather than aspirational: the
fixture player records the Connection's base URL, which is the property the privacy assertion
actually tests.

The transport returns **text only**. No streaming in v1: a Run result is a parsed object and a
partial object is not useful, so runs show a spinner, an elapsed timer and a cancel button.

### Passes are data

Passes are records, editable in the app, exported and imported as JSON, shipped with a read-only
starter pack and a restore-defaults action.

```
Pass {
  id: string
  name: string
  description: string
  kind: "rule" | "model"
  scope: "document" | "section" | "paragraph"
  output: "findings" | "section-summary" | "note"
  prompt?: string
  slot: "critic"
  enabled: boolean
  ruleConfig?: {
    hedges?: string[]
    wordiness?: [string, string][]
    repetitionWindow?: number
    openers?: string[]
    nominalizationSuffixes?: string[]
  }
}
```

Prompt placeholders are `{{title}}`, `{{outline}}`, `{{document}}`, `{{target}}`,
`{{context_above}}`, `{{context_below}}`. An unknown placeholder is a hard error on save. Output
shapes are the three fixed ones above — a user-editable JSON Schema is explicitly not supported.

Rule passes carry their word lists and patterns as editable data, so the writer extends the hedge
list rather than the developer.

`promptHash` replaces a hand-bumped version integer: it is derived from the Pass's prompt, output
shape and scope when the Pass is run, and recorded on the Finding. A version number that a human must
remember to increment drifts silently; a hash cannot.

### The canonical string

`canonicalText(tree)` is the **one coordinate system** in Obelus. It is simultaneously what every
model Pass receives as Target and context, what an Anchor's quote matches against, what Containment
measures, what chunking splits, what a Revision stores, and what the Judge extracts from. **No second
coordinate system may exist** — a second one lets a quote the model returned from formatted prose fail
to match the string Anchors search, which drops valid Findings silently.

It is Markdown source, and these rules are part of the contract:

- Blocks in document order, each rendered as source Markdown, separated by exactly one blank line.
- A Heading, a list item, a block quote, a code block and a Paragraph each start a new line.
- Paragraph-internal line breaks collapse to single spaces.
- Emphasis, strong emphasis, inline code and links are emitted as their Markdown source, so a quote
taken from the model's view of formatted prose exists verbatim in the string Anchors match.
- Sections are heading lines; a Section is its heading's text plus the body that follows it.
- No trailing whitespace on any line, and the string ends with exactly one newline.
- Deterministic: the same tree always produces the same string, and re-parsing the string and
serializing it again produces it unchanged.

Everything downstream — Containment, Anchor offsets, chunking, Judge extraction — is expressed
against this string and nothing else.

### Containment

Local passes receive the target paragraph, one paragraph either side, and the heading outline
(headings only, never body text). Structural passes receive the whole document. Two rules are
implemented in Core, not in the prompt:

- The prompt states that surrounding text is context and not target.
- **Any finding whose anchor falls outside the target is dropped**, and the count of dropped
  anchors is reported.

Without the second rule, running six passes on one document produces six copies of one finding.

### Finding shape

```
Finding {
  id: string
  passId: string
  promptHash: string
  anchor: {
    quote: string
    offset: number                    // a hint for the first resolution; never the sole basis
    state: "attached" | "orphaned"     // computed on re-resolution; never authored
  }
  issue: string
  diagnosis: string
  pattern?: string
  status: "open" | "addressed" | "declined"
  declineReason?: "advice" | "violation"   // present only when declined
  provenance: { providerId: string; model: string; at: number; revisionId: string }
  violations?: Violation[]
}
```

Anchors resolve in **Core**, never in the Editor, and never by offset alone. Three steps, in order:

1. **Diff-projection.** Project the Anchor's interval from the canonical string of
   `provenance.revisionId` to the current canonical string through a character diff. This is the
   common case: the Writer edits *inside* the anchored span, so the quote no longer exists verbatim
   and the Finding must still follow the text.
2. **Quote match.** If projection fails, match the quote exactly. If it matches more than once,
   prefer the occurrence nearest the projected position, then the first.
3. **Orphaned.** If neither holds, the Finding is Orphaned.

Quote match alone is not enough: it orphans a Finding the moment a single character changes inside the
anchored span, which is exactly the case story 59 promises to handle.

`resolveAnchor(anchor, currentCanonical, provenanceCanonical) -> Interval | Orphaned` is pure and
DOM-free. `projectInterval(tree, interval) -> EditorRange` converts a resolved interval into something
the Editor can render. The Editor draws the result and knows nothing else.

An Orphaned Finding stays `open` and actionable; it simply has no Highlight. Its `anchor.state` is
computed on every re-resolution and persisted for rendering — never authored by a model, never set by
hand.

### Run result

```
RunResult {
  findings: Finding[]
  violations: Violation[]
  droppedAnchors: number
  rawResponse: string
  fromCache: boolean
  chunks: number
  usage?: { inputTokens?: number; outputTokens?: number }
}
```

`violations` carries praise and rewrite-shaped strings detected by the linter. They are **rendered
struck through, not removed**, so prompt drift stays visible. A global "show raw response" toggle
exposes `rawResponse` for any finding. `chunks` is story 50's: a document-scope Run past the
character limit is sent Section by Section, and this reports how many calls it took (`1` when the
Document fit in a single call).

### Reader account

The `section-summary` output shape, and the Reader pass's output instead of Findings. One model
call per Section returns the three fields below, and the account is stored as its own record kind —
it never enters the Findings queue. A Reader account is analysis, so its schema is closed like the
Findings schema and carries no field for rewritten prose.

```
ReaderAccount {
  section: { heading: string; level: number; headingBlockIndex: number }
  whatItSays: string
  whatIsMissed: string
  gap: string
  provenance: { providerId: string; model: string; at: number; revisionId: string }
  violations?: Violation[]
}
```

`ReaderRunResult` carries the account, the whole response's `violations`, and `rawResponse`. A
Reader account's `violations` are **struck through on display**, and a rewrite caught by the linter
is quarantined like any other.

### Judge protocol

The judge is the mechanism the whole tool is built to protect, so its inputs are specified as a
closed list.

**The judge request contains:** two passages labelled `A` and `B`; a neutral instruction — "Two
versions of the same passage. Which is clearer and more effective prose? Do not assume either is
newer or better."; a `jsonSchema` for the response.

**The judge request contains none of:** the document, the surrounding context, prior turns, the
findings, the pass that produced them, any statement that an edit occurred, any statement about who
wrote either passage, any statement that a model was involved, the screening frame, and any
publication or persona.

**Response shape and the double call:**

```
JudgeResult {
  first:   { preference: "A"|"B"|"tie"; confidence: number; reasons: Reason[];
             problemsInA: string[]; problemsInB: string[] }
  swapped: { same shape, labels swapped }
  stable: boolean            // false => surfaced as "unstable"
  labelOrder: ["A"|"B", "A"|"B"]   // local mapping; never revealed to the model
}
```

The second call swaps the labels, then the result is unmapped back to the writer's view. If the two
calls disagree, `stable` is false and the UI reports **unstable** rather than a preference — a judge
that flips with the labels is telling the writer the passages are equivalent or that it is
position-biased. Both extracted passages are displayed before either call is made.

The judge defaults to a different provider and model from the critic; a same-model pairing raises a
soft warning, never a block.

### The constitution, mechanically

- The findings schema has no field for rewritten prose. This is a schema decision, not a prompt
  instruction.
- No UI affordance inserts model-derived text. There is no exception and no debug build that adds one.
- **A static source check fails the build** on the forbidden affordance names in the UI module. It
  observes source, not behaviour, so it is not a second test seam — but without it the line above is
  enforced by review alone, and a future contributor could add an Apply button and every test would
  still pass.
- Diagnosis text is selectable; the quarantined-rewrite pane is `user-select: none` and reachable
  only behind an explicit reveal.
- Praise and rewrite-shaped content is prompt-banned and then linted client-side, struck through on
  display, with a per-finding decline and a global raw-response toggle.
- There is no clipboard policing and no minimum-length gate.
- The screening frame applies to critic passes only, and is a settable toggle.

### Caching, concurrency, cost, failure

- Findings are cached under hash(canonical string) + pass id + promptHash + Connection + model. The
  Connection belongs in the key because two Connections can serve the same model id. A repeat run on
  unchanged text costs nothing and returns `fromCache: true`.
- Runs are on demand, one pass at a time, with "run local passes" (free, no key) and "run structural
  set" shortcuts. Concurrency is capped per Connection, default three, configurable, with a visible
  queue.
- A pre-run estimate (characters ÷ 4 for tokens, times an editable per-model price table) and a
  running session total are always shown and never block.
- Retries use exponential backoff honouring `Retry-After` on 429 and 5xx. Provider error text is
  surfaced verbatim wherever the browser can read it. Errors are never swallowed.
- **One case is unreadable, and is reported as such.** OpenAI returns `401` for a bad key without
  `Access-Control-Allow-Origin`, so the browser surfaces an opaque network failure and the body cannot
  be read. That is reported as an unreachable Connection pointing at "Test connection" — never as a
  guess at what the Provider said.
- The parser is tolerant: extract JSON from surrounding prose, validate, then lint. `strict: true`
  is a promise models still break, and OpenRouter's schema support is a passthrough requiring
  `require_parameters: true`.

### Key handling

Plaintext in IndexedDB by default, with a session-only mode that holds the key in memory and never
persists it. No passphrase encryption in v1 — the decryption code would ship to the same browser
that holds the documents, which makes it largely theatre, while "never persisted" is the honest form of
more secure. Regardless of mode: keys are never logged, never placed in a URL, and never sent to any
origin other than the provider's configured base URL. Keys are excluded from exports by default.

### Revisions and durability

- **Document persistence and Revisions are different things, and the spec had them conflated.** The
  Document is persisted on a short debounce **plus** `visibilitychange`/`pagehide`, so a closed tab
  cannot lose a Paragraph — that is story 17. A Revision is a history point taken on a slower debounce
  (roughly sixty seconds idle, or N saved keystrokes), pruned; plus a flagged Revision the Writer marks
  as a milestone, carrying an optional note.
- A Revision is immutable prose plus metadata: parent id, timestamp, word count, flag, and the
  canonical string. It never carries a join to mutable or ephemeral state — no "Findings addressed",
  no "Run in progress".
- Call `navigator.storage.persist()` on first save. The last-backed-up reminder remains the real
  defence against eviction, because `persist()` is a request, not a guarantee.
- Word-level diff between any two Revisions, in v1.
- The judge can compare any two Revisions. The comparison unit is a selected span or a heading-delimited
  Section; the selection is projected across Revisions **by the same diff-projection that re-locates an
  Anchor**, not by a separate fuzzy alignment. Both extracted strings are displayed before sending.
- Markdown export always. A single-Document JSON bundle carries the Document, Revisions, Findings and
  Run results. A whole-Library backup in JSON excludes keys unless explicitly opted in, with a visible
  last-backed-up indicator — **and it must be importable, or it is not a recovery path.**
- Migrations are forward-only and versioned. A database newer than the running code refuses to open and
  says so, rather than risking the Library. **A migration is not rollback-safe**: a deploy that migrates
  the Library cannot be reversed by code alone, so never ship a migration and a behaviour change
  together.

### Privacy surface

A plain-language privacy page plus a "verify this yourself" section containing actual steps: read your
own data at devtools → application → IndexedDB; watch requests at devtools → network with preserve-log
enabled; confirm `script-src 'self'` means no third-party script origin can load. Zero analytics, zero
crash reporting, zero counters. **A fresh install makes no outbound request at all before a Connection
is configured**, and that property is testable at the single seam.

**Two claims must not be conflated.** `script-src 'self'` is enforced by the header. "Only your
Connection" is **not** — `connect-src` cannot enumerate a Writer-supplied base URL or a local Ollama
origin, so it must be broad, and the single-origin property is enforced by the code path and its test.
The privacy page says which is which.

### Stack and hosting

Vite, React, TypeScript, Tailwind, TipTap, Dexie. Markdown is the import and export format, not the
internal source of truth — internal positions come from the rich text model, which is what makes
anchors survive rewriting. Deployed to Cloudflare Workers static assets with a thin Worker that sets
CSP and security headers and nothing else. No Astro. GPLv3. PWA manifest and service worker so the
shell and existing Documents open offline; no push and no background sync.

### Build order

Vertical tracer bullets, each cutting a complete path through every layer it needs, demoable on its
own, and sized for one fresh context window. This replaces the spec's original eight-stage order,
which began with a horizontal slab that bundled the editor, Library, Dexie, Markdown, Connections,
keys, CSP and deploy while landing none of the product's risk.

**The toolchain is part of slice 1, not a separate stage.** There is no `package.json`, no test runner,
no fixture transport, no harness scaffold, no `scripts/agent-gates` and no pre-commit hook, so AGENTS.md's
"new behaviour has a test through the seam" and "the constitution harness runs before any pass-prompt
change" are currently unenforceable. Slice 1 must produce the build and test toolchain, the in-memory
IndexedDB test setup, the deploy pipeline with CSP, and Dexie migration 1 with the newer-database
refusal. **Anchor survival is slice 4 rather than a late stage**, because it is the highest-risk and
least-specified behaviour in the design.

1. **Spine — write, mark, highlight, step.** Document of record in IndexedDB; TipTap with headings,
   emphasis, lists and quotes; persistence on a short debounce plus `pagehide`; one Revision;
   `canonicalText`; one rule Pass (hedges); Finding and Anchor; a Highlight; sidebar grouped by Pass;
   Finding status; `j/k/a/x`; Markdown export; deployed with CSP. No Provider, no network.
   *Blocked by: none.*
2. **Connection and the seam.** Connection records with all prefills and Custom; both key modes;
   connection test; model listing; `send` with the Protocol table and three adapters; the fixture
   player; the privacy assertion that the seam never sees a base URL other than the Connection's.
   *Blocked by: 1.*
3. **Constitution core.** Findings schema and tolerant parser; praise linter; Containment with the
   dropped-anchor count; one paragraph-scope model Pass end to end; Run cache with `promptHash`;
   raw-response toggle; Quarantined rewrite pane; the affordance source check. *Blocked by: 2.*
4. **Anchor survival.** `resolveAnchor` with diff-projection from `provenance.revisionId`, quote
   fallback, ambiguous-quote tie-break, Orphaned state and its sidebar placement; `projectInterval`;
   re-resolution on every change; pure tests for a rewrite inside the quote and for deletion.
   *Blocked by: 1 (the pure function), 3 (the wiring).*
5. **Rule engine.** Every rule Pass; editable Rule config; auto-run on save; metrics panel.
   *Blocked by: 1.*
6. **Structure.** Section model from headings; outline; document-scope Passes; chunking, limits and
   the too-long-for-one-call path. *Blocked by: 3, 5.*
7. **Library.** Many Documents; Scratchpad; tags; search; Document status; open-Finding count.
   *Blocked by: 1.*
8. **Judge.** Any two Revisions; word-level diff; span and Section extraction with both strings shown
   before sending; swapped double call; `Unstable`; Screening frame toggle; same-model warning.
   *Blocked by: 3, 4.*
9. **Workbench.** Pass editor with placeholder validation and output shapes; Rule config editor;
   pass-set JSON import and export; restore the Starter pack; the prompt-authoring assistant.
   *Blocked by: 5, 6.*
10. **Reader pass.** Reader account schema; the Reader tab. *Blocked by: 6.*
11. **Durability.** Library backup with keys excluded by default and explicit opt-in; import;
    last-backed-up indicator; single-Document JSON bundle; `storage.persist()`; the migration policy
    and newer-database refusal; service worker and offline shell. *Blocked by: 1, 7.*

Slices 3, 4, 6 and 8 cannot be implemented independently until the `canonicalText` contract and the
Orphaned representation are settled, or each fresh context window will invent its own coordinate
system and the seams will not meet.

## Testing Decisions

### What makes a good test here

Tests assert on **external behaviour observed through the core entry points**, never on internal
structure. A good test says "given this document and this pass, with the model returning this text,
the writer sees these findings" — not "the parser called `parseFindings` once". Anything that can
only be asserted by reaching into a module's internals is a sign the seam is in the wrong place.

Two properties get special treatment because they are the product:

- **The constitution is a test suite, not a style guide.** No test may permit model-derived text to
  reach a document, and no test may assert on a UI affordance that would insert it.
- **The privacy claim is asserted, not asserted about.** Through the single seam we can prove that
  the transport is never invoked with a base URL other than the configured Connection's.

### The single seam

One seam: **the transport**, `send(ModelRequest) -> Promise<string>`. Everything above it is pure
and exercised through `critique(target, pass, connection, config)` and `judge(before, after,
connection, config)`. The test implementation records every request it receives and replays fixture
responses. This is preferred to any new seam, and it is deliberately the *highest* useful one: it sits
above all Protocol differences and below all reasoning about prose.

Two boundaries are deliberately **not** seams, to keep the count at one:

- **IndexedDB.** Dexie repositories are exercised against an in-memory IndexedDB implementation
  installed in test setup. No injected interface, so no production code is shaped by testing.
- **The DOM.** No browser-driving test layer in v1. It would be a second seam, it would be slower
  and flakier, and it would test the constitution no better than the seam already does.
- **The UI source.** The affordance check reads source rather than observing behaviour, so it is a
  build gate, not a seam.

### What the seam cannot test

Stated so nobody assumes coverage that does not exist:

- Whether a Highlight lands on the right prose, and whether the Quarantined rewrite pane is genuinely
  unselectable. `projectInterval` is testable; the rendered result is not.
- The service worker, the CSP header and offline opening — deploy-time properties, verified by the
  manual steps on the privacy page.
- Migrations against a real browser IndexedDB. The in-memory implementation tests logic, not quota,
  eviction or a partial migration.
- Real Provider CORS behaviour. An auth failure whose body the browser cannot read is
  indistinguishable at the adapter from a handled response.

### Modules under test

- **Core.** Tolerant parsing of messy model output; praise detection and struck-through surfacing;
  declining of smuggled rewrites; Containment including the dropped-anchor count; cache hits returning
  `fromCache: true` on unchanged text; the unreadable-auth-failure path. Plus the two pure functions the
  whole loop rests on: `canonicalText` (determinism, and the round-trip that re-parsing its output
  serializes back to the same string) and `resolveAnchor` (a rewrite inside the anchor's span, a move of
  the containing Paragraph, a quote that appears twice, and a deletion that orphans it).
- **Judge protocol.** That the request contains a closed list of inputs and none of the forbidden
  ones (document, history, authorship, findings, screening frame); that label order is randomised
  and the local mapping is never revealed to the model; that a swapped disagreement yields
  `stable: false`; that both extracted strings are produced before the call.
- **Rule engine.** Pure-function tests: a fixture document and a rule configuration in, a known set
  of findings out. Determinism asserted by running twice and comparing.
- **Storage.** Document, revision, pass, Connection and Run-cache repositories against in-memory
  IndexedDB, including forward migration behaviour and the refusal to open a newer schema.
- **Transport adapters.** Request construction and response parsing per Protocol, with no network:
  correct header names and auth placement per the table above, correct system-prompt placement per
  protocol, and correct extraction of text from each response shape.

### Constitution regression harness

The constitution lives in prompt text, and prompt text drifts silently when a pass is edited. The
harness is **three fixture documents × three model passes**, run manually before any prompt change,
with results stored locally and timestamped. It asserts that output parses; that no un-flagged praise
token survives the linter; that no rewrite field ever appears in a response; and that findings anchor
inside their Target. It never ships to the UI.

This is the most valuable test in the project, because it is the only thing standing between "the
tool cannot do that" and "the tool cannot do that today".

### Prior art

None. This is the first code in the repository, so there are no existing test patterns to follow and
the constitution harness is the seed of that prior art. The rule engine's pure-function tests and the
storage tests against in-memory IndexedDB are the two patterns later work should copy.

## Out of Scope

- Any generation of prose: continue-writing, rewriting, expanding, summarising for insertion, titles,
  outlines. The quarantined rewrite pane is display-only and is the sole exception anywhere in the app.
- Streaming responses. A parsed object is the unit of value.
- Prompt-editable JSON Schema. Three fixed output shapes only.
- Hosting any proxy that handles a user's API key, including one for Ollama Cloud.
- Direct calling of Ollama Cloud from the browser.
- Accounts, authentication, sync, sharing, collaboration, or any multi-user concept.
- Folders and nested containers; the Library is flat with tags.
- PDF, DOCX or HTML export in v1.
- Clipboard policing, paste quarantine, attribution tracking, authorship disclosure, and any
  minimum-length or completeness gating.
- Prompt-injection defences beyond treating model output as untrusted data. This app sends the
  writer's own text to the writer's own provider; injection theatre would be disproportionate.
- Analytics, telemetry, crash reporting, usage counters, and any request to any origin other than
  the configured provider.
- Browser-driving (DOM/E2E) tests, and any second test seam.
- Localisation, theming beyond a single considered default, and keybinding remapping.

## Further Notes

**Relationship to the design record.** `DESIGN.md` holds the reasoning, including why the constitution
is enforced structurally rather than by prompt, why rule passes are regular expressions, why
Ollama Cloud is excluded, and why containment is enforced in code rather than trusted to the model.
Read it before arguing with a decision here.

**Domain vocabulary.** `CONTEXT.md` is the glossary and the authority on terms — pass, Run, Finding,
Anchor, Target, Containment, Document, Revision, Connection, Slot, Verdict, and the rest. Read it
before naming anything in code, a test, an issue title or a commit.

**Decisions recorded as ADRs.** Five load-bearing decisions live in `docs/adr/`: 0001 the constitution
is enforced structurally; 0002 every request leaves the Writer's browser, which is also why Ollama
Cloud is excluded; 0003 mechanical passes are rules rather than model calls; 0004 the Judge answers
twice with the labels swapped; 0005 Markdown is an interchange format. Read the relevant one before
reopening a decision it covers.

**Facts that will drift.** The protocol table, the required headers and the model identifiers were
verified against live endpoints on 2026-09-19 and are recorded with sources in
`notes/provider-api-facts.md`. Anthropic's required version string, the browser-access header, and
every model id are the things most likely to change first. Re-verify at the start of implementation
rather than trusting this spec.

**Repository naming.** The app is Obelus; the repository is `writing-tool`. Renaming to `obelus` is
optional and cheap now, and progressively less cheap later.

**Process.** Setup is complete: `docs/agents/` records the issue tracker, the canonical triage labels
and the domain-doc layout, and the five canonical labels exist in the tracker.

**Goldilocks review.** The mandatory design gate before tickets ran against this spec and is recorded
in `docs/decisions/obelus-v1-goldilocks.md`. It selected the shape this spec now describes — one
canonical string, Anchor resolution in Core, five modules, diff-projection re-location — and found the
genine flaws corrected above. Read it before reopening any of them.
