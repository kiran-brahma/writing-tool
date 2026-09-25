import { Extension, type Editor } from "@tiptap/react";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node } from "@tiptap/pm/model";
import type { ProjectedHighlight } from "../core/anchor";

/**
 * The Highlight layer. It draws ranges Core resolved and projected; it never
 * matches quotes and never decides where an Anchor points. Between saves the
 * decorations are mapped through edits by ProseMirror, and the next Run
 * replaces them.
 */

const HIGHLIGHT_PLUGIN_KEY = new PluginKey<DecorationSet>("obelusHighlight");

export const HighlightExtension = Extension.create({
  name: "obelusHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: HIGHLIGHT_PLUGIN_KEY,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, current) {
            const update = transaction.getMeta(HIGHLIGHT_PLUGIN_KEY) as HighlightUpdate | undefined;
            if (update?.kind === "project") return buildDecorations(transaction.doc, update.ranges);
            const mapped = current.map(transaction.mapping, transaction.doc);
            if (update?.kind === "restyle") return restyle(transaction.doc, mapped, update.current);
            return mapped;
          },
        },
        props: {
          decorations(state) {
            return HIGHLIGHT_PLUGIN_KEY.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

/** The Highlights under a document position: the Findings they draw, and where the latest-starting one begins. */
export interface HighlightsAt {
  findingIds: string[];
  from: number;
}

/**
 * The Highlights covering a document position, or null over plain prose. A
 * click reports the Finding ids and nothing more: the shell looks the Findings
 * up, so the Editor never holds a Finding's text.
 */
export function highlightsAt(state: EditorState, position: number): HighlightsAt | null {
  const decorations = (HIGHLIGHT_PLUGIN_KEY.getState(state)?.find(position, position) ?? []).filter(
    (decoration) => decoration.from <= position && position <= decoration.to,
  );
  if (decorations.length === 0) return null;
  return {
    findingIds: decorations.map((decoration) => (decoration.spec as HighlightSpec).findingId),
    from: Math.max(...decorations.map((decoration) => decoration.from)),
  };
}

/**
 * How the drawn Highlights change: replaced by a fresh projection, or — while
 * the Writer's edits are newer than the resolved intervals — kept where
 * ProseMirror has mapped them, with only the set and the current flag updated.
 */
type HighlightUpdate =
  | { kind: "project"; ranges: ProjectedHighlight[] }
  | { kind: "restyle"; current: ReadonlyMap<string, boolean> };

/** Replaces the drawn Highlight ranges with a fresh projection. */
export function setHighlightRanges(editor: Editor, ranges: ProjectedHighlight[]): void {
  dispatchUpdate(editor, { kind: "project", ranges });
}

/**
 * Keeps each drawn Highlight where it is and updates only which Findings are
 * drawn and which is current. For a change that arrives mid-pause, when the
 * resolved intervals are older than the prose: ProseMirror has mapped the drawn
 * ranges through every edit, so they are right where a projection would not be.
 * A Finding not already drawn waits for the next resolution.
 */
export function restyleHighlights(editor: Editor, current: ReadonlyMap<string, boolean>): void {
  dispatchUpdate(editor, { kind: "restyle", current });
}

function dispatchUpdate(editor: Editor, update: HighlightUpdate): void {
  editor.view.dispatch(editor.state.tr.setMeta(HIGHLIGHT_PLUGIN_KEY, update));
}

function restyle(
  doc: Node,
  drawn: DecorationSet,
  current: ReadonlyMap<string, boolean>,
): DecorationSet {
  const ranges: ProjectedHighlight[] = [];
  for (const decoration of drawn.find()) {
    const { findingId } = decoration.spec as HighlightSpec;
    const isCurrent = current.get(findingId);
    if (isCurrent === undefined) continue;
    ranges.push({ findingId, from: decoration.from, to: decoration.to, current: isCurrent });
  }
  return buildDecorations(doc, ranges);
}

/** What a Highlight decoration carries beyond its look: the Finding it draws. */
interface HighlightSpec {
  findingId: string;
}

function buildDecorations(doc: Node, ranges: ProjectedHighlight[]): DecorationSet {
  const decorations = ranges.map((range) =>
    Decoration.inline(
      range.from,
      range.to,
      {
        // The Current Finding's Highlight is a second class beside the shared
        // one, not a replacement, so it keeps the Highlight's own look.
        class: range.current
          ? "obelus-highlight obelus-highlight-current"
          : "obelus-highlight",
      },
      { findingId: range.findingId } satisfies HighlightSpec,
    ),
  );
  return DecorationSet.create(doc, decorations);
}
