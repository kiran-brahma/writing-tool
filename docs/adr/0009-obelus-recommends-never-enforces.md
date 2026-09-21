# Obelus recommends, never enforces

v1.1 adds three things whose only job is to shape what the Writer attends to: **Working order**, which
offers the Passes structure-first; **per-pass screening frames**, which change who a critic pass is
written for; and **Judge calibration**, which invites the Writer to predict the verdict before seeing
it. Each is a recommendation, and each is skippable by construction. None blocks a run, gates a queue,
or refuses a Document.

The spec already draws this line — "there is no length gate and no completeness check: those would be a
nanny" — and it is the line that keeps the tool on the writer's side. A default is not a gate: the
Starter pack has always shipped passes on and off, and switching one on changes what is one click away,
not what is permitted. A gate would be the nanny this tool refuses to be.

## Considered Options

- **Enforce the order, holding local passes until structural ones are worked.** Arguably better advice,
  and a gate: it would refuse the Writer the choice to work a hedge before a paragraph.
- **No recommendation at all.** Keeps the letter of "no nanny" but leaves the method's most satisfying
  edits hidden behind an off-by-default pass, which is the worse failure.

## Consequences

The v1.1 defaults change: `characters-actions` and `paragraph-reorder` ship enabled. Because model
passes run on demand, enabling one spends nothing until it is run, so the change is to discoverability
rather than to cost. This ADR is the reason to revisit if a future change wants to make any of these
blocking.
