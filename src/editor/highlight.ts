import { Extension, type Editor } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
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
            const ranges = transaction.getMeta(HIGHLIGHT_PLUGIN_KEY) as
              | ProjectedHighlight[]
              | undefined;
            if (ranges !== undefined) return buildDecorations(transaction.doc, ranges);
            return current.map(transaction.mapping, transaction.doc);
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

/** Replaces the drawn Highlight ranges with a fresh projection. */
export function setHighlightRanges(editor: Editor, ranges: ProjectedHighlight[]): void {
  editor.view.dispatch(editor.state.tr.setMeta(HIGHLIGHT_PLUGIN_KEY, ranges));
}

function buildDecorations(doc: Node, ranges: ProjectedHighlight[]): DecorationSet {
  const decorations = ranges.map((range) =>
    Decoration.inline(range.from, range.to, {
      // The Current Finding's Highlight is a second class beside the shared
      // one, not a replacement, so it keeps the Highlight's own look.
      class: range.current
        ? "obelus-highlight obelus-highlight-current"
        : "obelus-highlight",
    }),
  );
  return DecorationSet.create(doc, decorations);
}
