# **Prose Linter**

Runs on finished prose. Never on an outline, a draft in progress, or a reference document.

---

## **Output contract**

Read this before anything else.

**Report. Do not rewrite** unless I ask for a rewrite.

**One table.** Columns: rule ID, severity, the offending text quoted to a maximum of ten words, the fix.

**Caps.** Report every E. Maximum fifteen W. Maximum ten N. If findings exceed the cap, state how many were suppressed and in which categories.

**Order.** Structure first, then mechanics, then words, then usage, punctuation, numbers, AI tells, honesty. Do not report a grammar fault inside a paragraph you have flagged for deletion.

**Do not** praise, summarise strengths, judge whether the piece was worth writing, or comment on the ideas. None of that is this document's job.

**Close with two lines.** The finding count by severity, and the single highest-value fix.

---

## **Severity**

* **E** — error. Breaks a rule with no exceptions.  
* **W** — warning. Breaks a rule that has exceptions. State why you think this is not one.  
* **N** — note. Judgment. I may disagree.

---

## **Profiles**

Declare the profile before running. If I have not stated one, ask.

* **essay** — published essays, book memos, observation pieces  
* **operator** — procedures, build logs, documentation, error messages  
* **rewrite** — converting older AI-generated text into my prose

Rules marked `[e]` run on essay only. `[o]` operator only. Unmarked rules run on all profiles.

---

## **S — Structure**

| ID | Trigger | Severity |
| ----- | ----- | ----- |
| S1 | Sentence over 20 words, or over 25 if descriptive | W |
| S2 | Paragraph over 4 sentences | N |
| S3 | Paragraph over 6 sentences | W |
| S4 | Paragraph carries more than one subject | W |
| S5 | Ideas within a paragraph do not run in sequence | W |
| S6 | More than two single-sentence paragraphs in the piece | N |
| S7 | Header inside the body `[e]` | E |
| S8 | Bullet or numbered list `[e]` | E |
| S9 | Procedure written as prose instead of numbered steps `[o]` | E |
| S10 | Theme changes without a horizontal rule `[e]` | N |
| S11&nbsp; | Problem not stated within the first two paragraphs `[e]` | W&nbsp; |
| S12 | Follow parallel construction for ideas in similar form | W |

---

## **M — Mechanics**

| ID | Trigger | Severity |
| ----- | ----- | ----- |
| M1 | Em dash | E |
| M2 | Passive voice `[o]` | E |
| M3 | Passive voice `[e]`. Do not flag when the passive puts the sentence's real topic in subject position and the agent is unknown or irrelevant. | N |
| M4 | "we", "us", "our" used for me `[e]` | E |
| M5 | An "-ing" main verb where simple tense works | W |
| M6 | Phrasal verb: spin up, shut down, fix up, roll out | E `[o]` / N `[e]` |
| M7 | The same object named by two different nouns | E `[o]` / W `[e]` |
| M8 | Command placed before its condition `[o]` | W |
| M9 | More than three contractions per 500 words | N |
| M10 | Adverb placed anywhere other than after the verb | N |
| M11 | A noun used as a verb, or a noun used as an adjective | W |
| M12 M13 | Fake warmth, filler, or conversational padding Make a definitive assertion. Avoid the negative.&nbsp; | E W&nbsp; |
| M14 | Be specific, concrete and definite. Avoid general or vague Language | W |

---

## **W — Banned words**

**W1. Banned word present. Severity E.** Deduplicated list:

align, additionally, catalyst, crushing it, deep dive, delve, demonstrate, democratize, disruptive, drive, driving, ecosystem, elevate, empower, ensure, facilitate, flywheel, foster, furthermore, game-changer, garner, guru, growth hack, harness, human capital, hustle, innovative, journey, landscape, leverage, moreover, ninja, north star, obtain, optimize, paradigm, platform, prior to, realm, regarding, reimagine, robust, rockstar, scalable, seamless, solutions, strategic, streamline, subsequent to, synergy, tapestry, testament, 10x, unlock, unleash, unparalleled, utilize, world-class

Two carve-outs. **Leverage** is allowed when it means financial leverage. **Platform** is allowed when naming a specific product by name.

**W2. Banned opener. Severity E.** "In a world where", "In today's fast-paced".

**W3. Banned analytical phrase. Severity E.** "It remains to be seen", "Time will tell", "There are many factors", "It depends" as a terminal answer, "Best practices suggest", "Industry benchmarks indicate" without a named source, "Experts believe" without a named expert.

**W4. Severity E.** "Significant" or "substantial" without a number attached.

**W5:Severity W:** would, should, could, may, might and can. These words need to be used involving real uncertainty

**W6: Severity W:** ‘Not’ needs to be used as a means of denial, never as a means for evasion

---

## **U — Usage**

Flag when the word appears in the wrong sense. Severity W throughout.

| Word | Flag when used to mean |
| ----- | ----- |
| alternate | one of two options. It means every other. |
| alternative | one of three or more. It means one of two. |
| anticipate | expect |
| appraise | inform. It means set a price on. |
| apprise | value. It means inform. |
| beg the question | raise the question. It means assume the conclusion. |
| challenge | a problem, obstacle or constraint. Name the thing. |
| circumstances | preceded by "under". Use "in the circumstances". |
| commit | followed by "to". Use "commit myself to". |
| contemporary | at this time. It means at the same time as the subject. |
| continuous | intermittent. It means uninterrupted. |
| convince | followed by "to". Persuade people to do things. |
| cost-effective | cheap. If it is cheap, say cheap. |
| deal | an agreement, where "distribute" is meant |
| decimate | destroy entirely. It means destroy a proportion. |
| deprecate | lower in value. It means argue against. |
| depreciate | argue against. It means lower in value. |
| discreet | separate. It means circumspect. |
| discrete | circumspect. It means separate. |
| disinterested | bored. It means impartial. |
| enormity | immensity. It means a crime. |
| environment | any context. Name the context. |
| finally | at last |
| flaunt | disdain. It means display. |
| flout | display. It means disdain. |
| forgo | predetermined. It means do without. |
| former, latter | at all. Repeat the noun. |
| fund | as a verb. Use finance or pay. |
| gender | sex |
| holistic | comprehensive |
| immolate | burn. It means sacrifice. |
| impracticable | not worth trying. It means cannot be done. |
| impractical | impossible. It means not worth trying. |
| issues | vaguely. Say concern, or say number. |
| last issue | the most recent one. Use latest. |
| likely | as an adverb. "He is likely to announce", not "he will likely announce". |
| masterful | skilled. It means imperious. |
| masterly | imperious. It means skilled. |
| metrics | figures or measurements |
| overwhelm | loosely. It means submerge utterly. |
| populace | population |
| positive | good. It means beyond doubt. |
| practicable | useful. It means feasible. |
| practical | feasible. It means useful. |
| presently | at present. It means soon. |
| pristine | clean. It means original. |
| prodigal | welcomed home. It means squandering an inheritance. |
| report | followed by "into". Use "report on". |
| same | in "on the same day that". Use "on the day that". |
| strategy, strategic | at all. Say what is being decided. |
| systemic | methodical. It means relating to a whole system. |
| systematic | system-wide. It means methodical. |
| uninterested | impartial. It means bored. |

Also flag: unexplained abbreviation on first use; untranslated foreign word; cliché, unless the cliché itself is the subject; euphemism; swearing outside a direct quotation.

---

## **G — Grammar**

| ID | Trigger | Severity |
| ----- | ----- | ----- |
| G1 | Verb disagrees with its subject, especially with words intervening | E |
| G2 | Subjects joined by "or" or "nor" where the verb does not match the nearest | E |
| G3 | Pronoun disagrees with its antecedent | E |
| G4 | "which" used to define, or "that" used to inform | W |
| G5 | Data, media, pair or couple treated as singular | W |
| G6 | "among" used for two, "between" used for three or more | E |
| G7 | Perfect tense avoided where it is the natural choice | N |

---

## **P — Punctuation**

| ID | Trigger | Severity |
| ----- | ----- | ----- |
| P1 | Dash used to introduce an explanation, amplification or paraphrase. Use a colon or a full stop. | E |
| P2 | More than two semi-colons per 1000 words | N |
| P3 | Full stop inside an abbreviation, or at the end of a heading | E |
| P4 | A whole sentence in brackets with the full stop outside | E |
| P5 | Interpolation in a quotation not in square brackets | E |
| P6 | Fraction without a hyphen | E |

---

## **N — Numbers**

| ID | Trigger | Severity |
| ----- | ----- | ----- |
| N1 | Sentence begins with a figure | E |
| N2 | A number with a decimal point written as a word | E |
| N3 | A fraction compared with a decimal | E |
| N4 | "many times cheaper", or any inverted multiple comparison | E |
| N5 | "compare to" used to draw out differences, or "compare with" used for similarity | W |
| N6 | Ratio written with a colon. Use "27 to 19". | E |
| N7 | Non-metric unit given first without a metric equivalent | W |
| N8 | Large Indian figure without lakh or crore | N |
| N9 | Non-rupee currency without a rupee conversion | N |
| N10 | A vague quantifier where a number exists, or is withheld without explanation | E |

---

## **A — AI tells**

| ID | Trigger | Severity |
| ----- | ----- | ----- |
| A1 | Manufactured significance: pivotal, broader shift, testament, landscape | E |
| A2 | Vague authority: experts say, industry reports, best practices | E |
| A3 | Three or more consecutive paragraphs sharing the same sentence count and shape | W |
| A4 | A triad whose third item adds nothing, or four or more triads in one piece | W |
| A5 | False depth: "at its core", "the real question is" | E |
| A6 | Generic ending: the future looks bright, time will tell | E |
| A7 | Chatbot residue: great question, hope this helps, let me know | E |
| A8 | An essay that persuades, motivates or impresses. An operator doc with a personal voice. | W |
| A9 | A lesson stated without the cost that produced it | W |
| A10 | A sentence opening with a crowd: "Many of us", "Most operators" | E |
| A11 | A category label standing where a specific person, moment or number belongs | W |
| A12 | A sentence that could have been written by someone who has never run a business | W |
| A13 | And, however, but or so used as a joiner where a full stop works | W |
| A14 | Tension resolved before the evidence resolves it | W |

---

## **H — Honesty**

Judgment checks. Run last. Severity W unless stated.

| ID | Trigger |
| ----- | ----- |
| H1 | A claim reaching past what the stated evidence supports. **E** |
| H2 | A working hypothesis presented as a finding |
| H3 | A prescription for something not actually tested. **E** |
| H4 | No adaptable specific a reader could use this week `[e]` |
| H5 | An abstraction standing in for an example that was never ready |

---

## **Still mine to decide**

The linter runs without these settled. Change them when I am ready.

**M3, passive voice in essays.** Currently a note with an exception. The old rule was absolute. Williams' position is that the passive is correct when it puts the right character in topic position, which is why I softened it. Restore the absolute rule if the exception gets abused.

**W1, banned words.** Ensure, obtain, demonstrate, regarding, additionally, drive and solutions are ordinary words. Zero tolerance on ordinary words produces circumlocution, which is its own tell. Consider splitting the list into words that are always empty, and words that are only empty when they replace a specific.

**G3, pronoun agreement.** The source rule says restructure to plural and use singular "they" only informally. That will distort meaning in some sentences. Consider allowing singular they.

**S8 against S9.** Essays ban lists. Operator docs require them. Build log summaries sit between the two. Decide which profile they run under.

---

## **Faults in the source list, worth correcting at some point**

"Brokers are singular" appears alongside data, media, pair and couple. It does not belong with them and reads like a transcription slip.

The current and contemporary entry merges two words into one rule. Contemporary means at the same time as the subject under discussion. Current does not mean that, and needs its own entry or none.

Garner and leverage appeared in both the usage table and the banned list. They are banned, so I have removed them from the usage table.

Ecosystem, flywheel, scalable, robust and optimize each appeared twice in the banned list. Deduplicated.

&nbsp;