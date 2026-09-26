import { Extension, type Editor } from "@tiptap/react";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node } from "@tiptap/pm/model";
import type { ProjectedHighlight } from "../core/anchor";
import type { MarginMark } from "./callout";

/**
 * The Highlight layer. It draws ranges Core resolved and projected; it never
 * matches quotes and never decides where an Anchor points. Between saves the
 * decorations are mapped through edits by ProseMirror, and the next Run
 * replaces them.
 *
 * It draws the Margin marks too, as widgets between top-level blocks, so they
 * are mapped through the Writer's typing with the Highlights and follow their
 * Paragraphs with no measuring (story 224).
 */

const HIGHLIGHT_PLUGIN_KEY = new PluginKey<DecorationSet>("obelusHighlight");

/** A click on a Margin mark: the Findings it counts, and where the block it sits beside begins. */
export interface MarginMarkClick {
  findingIds: string[];
  blockStart: number;
}

export interface HighlightOptions {
  /**
   * A Margin mark was clicked. Like a Highlight click it reports Finding ids
   * and nothing more, so the Editor never holds a Finding's text.
   */
  onMarginMarkClick: ((click: MarginMarkClick) => void) | null;
}

export const HighlightExtension = Extension.create<HighlightOptions>({
  name: "obelusHighlight",
  addOptions() {
    return { onMarginMarkClick: null };
  },
  addProseMirrorPlugins() {
    const report = (click: MarginMarkClick) => this.options.onMarginMarkClick?.(click);
    return [
      new Plugin<DecorationSet>({
        key: HIGHLIGHT_PLUGIN_KEY,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, current) {
            const update = transaction.getMeta(HIGHLIGHT_PLUGIN_KEY) as HighlightUpdate | undefined;
            if (update?.kind === "project") {
              const marks = marksAtBlocks(transaction.doc, update.marks);
              return buildDecorations(transaction.doc, update.ranges, marks, report);
            }
            const mapped = current.map(transaction.mapping, transaction.doc);
            if (update?.kind === "restyle") {
              return restyle(transaction.doc, mapped, update.current, report);
            }
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
  const decorations = (
    HIGHLIGHT_PLUGIN_KEY.getState(state)?.find(position, position, isHighlightSpec) ?? []
  ).filter((decoration) => decoration.from <= position && position <= decoration.to);
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
  | { kind: "project"; ranges: ProjectedHighlight[]; marks: MarginMark[] }
  | { kind: "restyle"; current: ReadonlyMap<string, boolean> };

/** Replaces the drawn Highlight ranges and Margin marks with a fresh projection. */
export function setHighlightRanges(
  editor: Editor,
  ranges: ProjectedHighlight[],
  marks: MarginMark[],
): void {
  dispatchUpdate(editor, { kind: "project", ranges, marks });
}

/**
 * Keeps each drawn Highlight where it is and updates only which Findings are
 * drawn and which is current. For a change that arrives mid-pause, when the
 * resolved intervals are older than the prose: ProseMirror has mapped the drawn
 * ranges through every edit, so they are right where a projection would not be.
 * A Finding not already drawn waits for the next resolution. Margin marks keep
 * their mapped places the same way and drop the Findings no longer drawn, so a
 * mark whose last Finding left the queue goes at once (story 227).
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
  report: (click: MarginMarkClick) => void,
): DecorationSet {
  const ranges: ProjectedHighlight[] = [];
  const marks: PlacedMark[] = [];
  for (const decoration of drawn.find()) {
    const spec = decoration.spec as HighlightSpec | MarginMarkSpec;
    if (isHighlightSpec(spec)) {
      const isCurrent = current.get(spec.findingId);
      if (isCurrent === undefined) continue;
      const { from, to } = decoration;
      ranges.push({ findingId: spec.findingId, from, to, current: isCurrent });
      continue;
    }
    const findingIds = spec.findingIds.filter((id) => current.has(id));
    if (findingIds.length > 0) marks.push({ position: decoration.from, findingIds });
  }
  return buildDecorations(doc, ranges, marks, report);
}

/** What a Highlight decoration carries beyond its look: the Finding it draws. */
interface HighlightSpec {
  findingId: string;
}

/** What a Margin mark's widget carries beyond its element: the Findings it counts. */
interface MarginMarkSpec {
  findingIds: string[];
  key: string;
  side: number;
  ignoreSelection: boolean;
  stopEvent: () => boolean;
}

function isHighlightSpec(spec: object): spec is HighlightSpec {
  return "findingId" in spec;
}

/** A Margin mark at a document position: the boundary before the block it sits beside. */
interface PlacedMark {
  position: number;
  findingIds: string[];
}

/** Each Margin mark where its top-level block begins, between that block and the one before. */
function marksAtBlocks(doc: Node, marks: MarginMark[]): PlacedMark[] {
  const starts: number[] = [];
  doc.forEach((_block, offset) => starts.push(offset));
  return marks.flatMap(({ blockIndex, findingIds }) =>
    blockIndex < starts.length ? [{ position: starts[blockIndex], findingIds }] : [],
  );
}

function buildDecorations(
  doc: Node,
  ranges: ProjectedHighlight[],
  marks: PlacedMark[],
  report: (click: MarginMarkClick) => void,
): DecorationSet {
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
  for (const { position, findingIds } of marks) {
    const beside = besideClass(doc.nodeAt(position));
    decorations.push(
      Decoration.widget(position, marginMarkElement(findingIds, beside, report), {
        findingIds,
        // The same Findings beside the same kind of block draw the same
        // element, so a redraw after a pause keeps the marks' DOM rather than
        // replacing every one of them.
        key: `margin-mark:${beside}:${findingIds.join(",")}`,
        // It stays before the block it marks when a block is inserted above it.
        side: 1,
        ignoreSelection: true,
        // A press on the mark is the mark's own, never a caret move in the prose.
        stopEvent: () => true,
      } satisfies MarginMarkSpec),
    );
  }
  return DecorationSet.create(doc, decorations);
}

/**
 * The kind of block a Margin mark sits beside, as a class on its holder: a
 * heading's top margin differs from a Paragraph's, and the mark aligns with the
 * block's first line. A class set here costs nothing as the Writer types,
 * where a stylesheet asking what follows each mark would be matched again.
 */
function besideClass(block: Node | null): string {
  const level: unknown = block?.type.name === "heading" ? block.attrs.level : null;
  return typeof level === "number" ? `obelus-margin-mark-h${level}` : "";
}

/**
 * A Margin mark: the obelus and its count, in the right-hand margin beside the
 * block that follows it (story 223). The widget sits between top-level blocks,
 * never inside a textblock, where a widget disturbs Safari's caret; it has no
 * height, and the button inside is positioned out into the margin.
 *
 * It is left out of the Tab order, since the queue keys already reach every
 * Finding (story 225), and labelled with its count (story 226). A press takes
 * no focus and leaves the caret where it was; the click reports the Findings,
 * as a click on a Highlight does, and the shell opens the Callout.
 */
function marginMarkElement(
  findingIds: string[],
  beside: string,
  report: (click: MarginMarkClick) => void,
): (view: EditorView, getPos: () => number | undefined) => HTMLElement {
  return (view, getPos) => {
    const page = view.dom.ownerDocument;
    const holder = page.createElement("div");
    holder.className = `obelus-margin-mark ${beside}`.trim();
    holder.contentEditable = "false";

    const count = findingIds.length;
    const button = page.createElement("button");
    button.type = "button";
    button.tabIndex = -1;
    button.setAttribute("aria-label", count === 1 ? "1 Finding" : `${count} Findings`);
    const glyph = page.createElement("span");
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = `÷${count}`;
    button.append(glyph);
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      const blockStart = getPos();
      if (blockStart !== undefined) report({ findingIds, blockStart });
    });

    holder.append(button);
    return holder;
  };
}
