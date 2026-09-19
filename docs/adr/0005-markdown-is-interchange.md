# Markdown is an interchange format, not the source of truth

Obelus needs a WYSIWYG surface: the Writer should not fight markup (story 16), Highlights must land on
the prose they annotate (story 58), and Pass scope needs structural blocks to derive Sections from. The
editor's document model is therefore the Document of record, and Markdown is import and export only.

**Correction, recorded after the v1 Goldilocks review.** This ADR originally justified the rich-text
model with *"character offsets rot on the first keystroke, which would break anchoring."* That premise
is refuted. An Anchor's offset is only a hint, and Anchor survival is a pure re-location over stored
prose — diff-projection from the Finding's provenance Revision, then quote match, then Orphaned — which
owes nothing to the editor's position model. The outcome stands on the reasons above; the original
reason does not.

## Considered Options

- **A plain textarea over Markdown.** Simpler, swappable without a data migration, and — see the
  correction — it would not weaken anchoring at all. Rejected because it fails story 16: the Writer
  fights markup, and WYSIWYG over Markdown costs more than the tree-and-string projection it would
  delete.
- **Anchoring requires the editor's position model.** Rejected as unsound, for the reasons in the
  correction.

## Consequences

Obelus is locked to a rich-text editor, and swapping it later is expensive — though cheaper than this
ADR first implied, since no Anchor depends on the editor's positions. `canonicalText(tree)` is the one
coordinate system for model input, Anchor matching, Containment, chunking and Judge extraction.
Markdown import and export are lossy in both directions and need their own tests.
