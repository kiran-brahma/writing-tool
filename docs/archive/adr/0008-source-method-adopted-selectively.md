# The source method is adopted selectively

The Audit is built from the `musings-reviewer` skill, and that skill was written for a different job:
a short daily musing. It carries an atomicity gate that allows exactly one final conclusion, a
300-word cap enforced on finals, and a prose audit. Adopting it whole would import a length gate and a
one-idea rule into a tool whose spec says plainly there is "no length gate and no completeness check,"
and whose Documents are essays that may legitimately carry several conclusions.

So Obelus takes the parts that answer a gap it actually has — the argument structure, definition and
fallacy audits — and leaves the rest. The prose audit is dropped because `Prose Linter.md` and the
style guide already cover it. The skill lives at `docs/reference/musings-reviewer/` as the record of
what was adopted and what was not; because the browser cannot read files at runtime, the Audit prompt
carries a condensed taxonomy rather than the skill being loaded.

## Considered Options

- **Adopt the skill whole.** Faithful to the source, and wrong: it would add a length cap the spec
  forbids and misjudge every multi-conclusion Document.
- **Write a fresh argument audit.** Possible, but the skill's `logic-notes.md` is good, tested by use,
  and already the Writer's own standard.

## Consequences

The Audit's report has no `WORD COUNT` field and no atomicity verdict, so it differs from the skill's
output format. That difference is deliberate and is the reason this ADR exists.
