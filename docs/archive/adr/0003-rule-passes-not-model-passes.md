# Mechanical passes are rules, not model calls

The source method lists problems that can be spotted mechanically — intensifiers, nominalizations,
throat-clearing openers, wordiness, repetition, sentence rhythm — and its author reached for a model
only because he had no rule engine. Obelus implements them as deterministic rules instead.

## Considered Options

- **Run the mechanical checks as model passes.** Catches context-sensitive instances that a list
  misses, in exchange for a key requirement, a bill, a network round trip, and the risk of the model
  praising or rewriting. Rejected: the mechanical tier should cost nothing and be incapable of
  breaking the constitution.

## Consequences

Rule passes match lists rather than meaning, so their word lists and patterns are editable data the
Writer maintains. Obelus is useful with no API key at all.
