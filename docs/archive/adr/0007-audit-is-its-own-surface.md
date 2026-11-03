# The Audit is its own surface

v1 was a copyeditor: every problem it reported was a problem in the words, anchored to a quote, and
worked in one Findings queue. v1.1 adds checks on whether the reasoning holds up — argument structure,
validity versus soundness, enthymemes, definitions, fallacies — and those are whole-piece judgments
that usually cannot anchor to a quote at all. Forcing them into the Findings queue would break its one
quote, one problem shape and the `j`/`k`/`a`/`x` loop it exists for.

So the Audit gets its own surface. An **Audit pass** produces an **Audit account**, shown on its own
tab beside Findings and Reader accounts, and a reasoning problem never mixes with a copyedit finding —
the same separation the Reader account already has. The Audit is analysis and never prose, so the
constitution is unchanged; only where the analysis is shown changes.

## Considered Options

- **One Findings queue for everything.** Consistent with the existing interaction model, but atomicity
  and the argument map have no quote to anchor to, and a writer working hedges does not want an
  unsupported claim in the same list.
- **A single report attached to the Document with no Pass.** Simpler, but loses caching, cost estimates,
  cancellation and the Workbench, all of which the Pass engine already provides.

## Consequences

The Audit reuses the Run engine, so caching, pricing, retry and the Workbench work unchanged. It cannot
use the `j`/`k`/`a`/`x` queue, and it does not need to: an account is read, not worked. Anchored fallacy
Findings are a later increment, not a replacement.
