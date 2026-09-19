# Markdown is an interchange format, not the source of truth

Findings are anchored to quoted text, and the Writer rewrites the sentences those Anchors point at,
so positions have to survive editing. The editor's own document model holds positions; Markdown is
import and export only.

## Considered Options

- **A plain textarea over Markdown.** Far simpler to build, and character offsets rot on the first
  keystroke, which would break anchoring — the mechanism the whole loop depends on.

## Consequences

Obelus is locked to a rich-text editor, and swapping it later is expensive. Markdown import and
export are lossy in both directions and need their own tests.
