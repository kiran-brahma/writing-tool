import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useReducer, useRef, type ReactNode } from "react";
import {
  canonicalIntervalForRange,
  projectHighlightsOnto,
  type HighlightInterval,
} from "../core/anchor";
import type { DocTree } from "../core/docTree";
import type { Interval } from "../core/finding";
import type { HighlightRect } from "./callout";
import {
  HighlightExtension,
  highlightsAt,
  restyleHighlights,
  setHighlightRanges,
} from "./highlight";
import { TYPING_PAUSE_MS } from "./persistence";

/** A click on a Highlight: the Findings it draws, and where it sits on screen. */
export interface HighlightHit {
  findingIds: string[];
  rect: HighlightRect;
}

export interface DocumentEditorProps {
  initialContent: DocTree;
  onChange: (tree: DocTree) => void;
  /** Canonical intervals Core resolved, each with whether it is the Current Finding. */
  highlights: HighlightInterval[];
  /**
   * The canonical string `highlights` were resolved against. Resolution waits
   * for the Writer to pause, so while they type this is older than the prose,
   * and the intervals must not be projected onto it.
   */
  highlightsResolvedAgainst: string;
  /**
   * The top-level block the cursor moved into. A paragraph-scope Pass targets
   * that Paragraph; the shell turns it into the Target and its context.
   */
  onTargetChange?: (blockIndex: number) => void;
  /**
   * The text selection as a canonical interval, so the Judge can compare the
   * Writer's chosen span across two Revisions: reported once it has held still
   * for `TYPING_PAUSE_MS`, and `null` as soon as it collapses.
   */
  onSelectionChange?: (interval: Interval | null) => void;
  /**
   * A Section heading the Writer asked to jump to, or the text a selected
   * Finding concerns. The `nonce` changes on every selection, so re-selecting
   * the same target still moves the cursor. `focus` is false when the rail sent
   * the request, so working the queue does not move the keyboard into the prose
   * and swallow the next `j`/`k` as a typed letter.
   */
  jumpRequest?: { blockIndex: number; nonce: number; focus?: boolean } | null;
  /**
   * A click landed on a Highlight, or the callout it opened should close
   * (`null`): the click was on plain prose, the Writer typed, or the Highlight
   * scrolled out of view. Reported again with a fresh `rect` as the prose
   * scrolls, so the callout stays beside its Highlight.
   */
  onHighlightClick?: (hit: HighlightHit | null) => void;
  /**
   * Whether the shell is showing the callout the last click opened. The shell
   * can close it on its own — Escape, a press elsewhere, the last Finding in it
   * leaving the queue — and once it is closed the Editor must stop reporting
   * that Highlight as the prose scrolls, or the callout would reopen.
   */
  calloutOpen?: boolean;
  /**
   * The head of the page: the Document's title field, set in the column above
   * the prose so it reads as the top of the Document (story 196).
   */
  pageHeading?: ReactNode;
}

/**
 * The Writer's WYSIWYG surface. It never shows markup: Markdown is emitted by
 * Core for model Passes, Anchors and Revisions, and is never what the Writer
 * edits. The editor owns no anchoring: Core resolves an Anchor to a canonical
 * interval and projects it to an Editor range; this component draws the range.
 */
export function DocumentEditor({
  initialContent,
  onChange,
  highlights,
  highlightsResolvedAgainst,
  onTargetChange,
  onSelectionChange,
  jumpRequest,
  onHighlightClick,
  calloutOpen = false,
  pageHeading,
}: DocumentEditorProps) {
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  const lastTargetRef = useRef(-1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** The open callout's Highlight: its Findings and where it starts. */
  const openHitRef = useRef<{ findingIds: string[]; from: number } | null>(null);
  const onHighlightClickRef = useRef(onHighlightClick);
  onHighlightClickRef.current = onHighlightClick;

  /** The screen rect of the open Highlight, or null once it has left the visible prose. */
  const openHitRect = (view: EditorView, from: number): HighlightRect | null => {
    const coords = view.coordsAtPos(from);
    const bounds = scrollRef.current?.getBoundingClientRect();
    if (bounds !== undefined && (coords.bottom < bounds.top || coords.top > bounds.bottom)) {
      return null;
    }
    return { left: coords.left, top: coords.top, bottom: coords.bottom };
  };

  const closeCallout = () => {
    if (openHitRef.current === null) return;
    openHitRef.current = null;
    onHighlightClickRef.current?.(null);
  };

  const reportTarget = (instance: Editor) => {
    if (onTargetChange === undefined) return;
    const index = instance.state.selection.$from.index(0);
    if (index === lastTargetRef.current) return;
    lastTargetRef.current = index;
    onTargetChange(index);
  };

  /** The pending report of a selection still being made. */
  const selectionTimerRef = useRef<number | null>(null);
  /** Whether the last report was a span, so a collapse is reported once. */
  const reportedSpanRef = useRef(false);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  /**
   * Reports the selection once it holds still. Projecting it to a canonical
   * interval costs a whole-document render, and the report re-renders the shell
   * and the Rail with every Finding row; a drag or a Shift-extend moves the
   * selection on every event, and a word selected to be retyped collapses at
   * the first key. The Judge is the only reader, and it waits for a settled
   * selection anyway. A collapse is reported at once, and only after a span.
   */
  const reportSelection = (instance: Editor) => {
    if (onSelectionChangeRef.current === undefined) return;
    if (selectionTimerRef.current !== null) window.clearTimeout(selectionTimerRef.current);
    selectionTimerRef.current = null;
    const { from, to } = instance.state.selection;
    if (from === to) {
      if (reportedSpanRef.current) {
        reportedSpanRef.current = false;
        onSelectionChangeRef.current(null);
      }
      return;
    }
    selectionTimerRef.current = window.setTimeout(() => {
      selectionTimerRef.current = null;
      if (instance.isDestroyed) return;
      const { from: start, to: end } = instance.state.selection;
      if (start === end) return;
      reportedSpanRef.current = true;
      onSelectionChangeRef.current?.(
        canonicalIntervalForRange(instance.getJSON() as unknown as DocTree, {
          from: start,
          to: end,
        }),
      );
    }, TYPING_PAUSE_MS);
  };

  // A pending selection report must not fire after the Editor unmounts.
  useEffect(
    () => () => {
      if (selectionTimerRef.current !== null) window.clearTimeout(selectionTimerRef.current);
    },
    [],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      HighlightExtension,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "obelus-editor min-h-[60vh] focus:outline-none",
        "aria-label": "Document",
        spellcheck: "true",
      },
      // A click that places the caret inside a Highlight also opens its
      // callout; the caret still moves, so the Writer can start typing at once.
      handleClick: (view, position) => {
        const hit = highlightsAt(view.state, position);
        const rect = hit === null ? null : openHitRect(view, hit.from);
        if (hit === null || rect === null) {
          closeCallout();
          return false;
        }
        openHitRef.current = hit;
        onHighlightClickRef.current?.({ findingIds: hit.findingIds, rect });
        return false;
      },
    },
    onUpdate: ({ editor: instance }) => {
      // Typing moves the prose out from under the callout; the Writer is
      // fixing it, so the callout gets out of the way.
      closeCallout();
      onChange(instance.getJSON() as unknown as DocTree);
      reportTarget(instance);
      reportSelection(instance);
      refresh();
    },
    onSelectionUpdate: ({ editor: instance }) => {
      reportTarget(instance);
      reportSelection(instance);
      refresh();
    },
  });

  // Draw the Highlights afresh when they were resolved against the prose as it
  // stands. Mid-pause they were resolved against older text: a change then —
  // the Current Finding moving, a Finding leaving the queue — restyles the
  // Highlights ProseMirror has kept mapped through the edits, and the next
  // resolution redraws them.
  useEffect(() => {
    if (editor === null) return;
    const ranges = projectHighlightsOnto(
      editor.getJSON() as unknown as DocTree,
      highlightsResolvedAgainst,
      highlights,
    );
    if (ranges !== null) {
      setHighlightRanges(editor, ranges);
      return;
    }
    restyleHighlights(
      editor,
      new Map(highlights.map((highlight) => [highlight.findingId, highlight.current])),
    );
  }, [editor, highlights, highlightsResolvedAgainst]);

  // The shell closed the callout: forget its Highlight, so scrolling does not
  // report it again and reopen what the Writer dismissed.
  useEffect(() => {
    if (!calloutOpen) openHitRef.current = null;
  }, [calloutOpen]);

  // Keep an open callout beside its Highlight as the prose scrolls or the
  // window resizes, and close it once the Highlight leaves the visible prose.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (editor === null || scroller === null) return;
    const follow = () => {
      const open = openHitRef.current;
      if (open === null) return;
      const rect = openHitRect(editor.view, open.from);
      if (rect === null) {
        closeCallout();
        return;
      }
      onHighlightClickRef.current?.({ findingIds: open.findingIds, rect });
    };
    scroller.addEventListener("scroll", follow, { passive: true });
    window.addEventListener("resize", follow);
    return () => {
      scroller.removeEventListener("scroll", follow);
      window.removeEventListener("resize", follow);
    };
    // Everything `follow` reads is a ref, so it needs no fresher closure.
  }, [editor]);

  useEffect(() => {
    if (editor === null || jumpRequest == null) return;
    const { blockIndex, focus = true } = jumpRequest;
    if (blockIndex < 0 || blockIndex >= editor.state.doc.childCount) return;

    // The Editor counts positions the way ProseMirror does: a top-level block's
    // inline content begins one position past its start, and each preceding
    // sibling costs its own node size.
    let position = 1;
    for (let index = 0; index < blockIndex; index += 1) {
      position += editor.state.doc.child(index).nodeSize;
    }
    if (focus) {
      editor.chain().focus().setTextSelection(position).scrollIntoView().run();
      return;
    }

    // The rail sent this: scroll the block into view without taking focus. The
    // DOM selection only follows ProseMirror's when the Editor has focus, so
    // ProseMirror's own scrollIntoView cannot help here, and focusing would let
    // the next `j`/`k` land in the prose as a typed letter instead of stepping
    // the queue. The caret moves only for a textblock: a list or block quote has
    // no inline content at its start, and a text selection there would be invalid.
    if (editor.state.doc.resolve(position).parent.inlineContent) {
      editor.commands.setTextSelection(position);
    }
    const { node } = editor.view.domAtPos(position);
    const element = node instanceof HTMLElement ? node : node.parentElement;
    element?.scrollIntoView({ block: "center" });
  }, [editor, jumpRequest]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar editor={editor} />
      {/*
       * The gutter is reserved on both edges, so a scrollbar never pulls the
       * centred column off the toolbar above it and the Status line below.
       */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto py-8 [scrollbar-gutter:stable_both-edges]"
      >
        <div className="obelus-column">
          {pageHeading}
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

/**
 * Stories 197–199: formatting that has no universal shortcut, aligned with the
 * column and quiet beside the prose. Undo and Redo are left to the keyboard
 * (⌘Z or Ctrl+Z, and ⇧⌘Z or Ctrl+Y): the history is StarterKit's, unchanged,
 * and so are its Markdown input rules.
 */
function Toolbar({ editor }: { editor: Editor | null }) {
  if (editor === null) {
    return <div className="h-9 border-b border-rule-faint" />;
  }

  return (
    <div className="border-b border-rule-faint">
      <div className="obelus-column">
        {/* Pulled left by a button's padding, so the first label lines up with the prose. */}
        <div
          role="toolbar"
          aria-label="Formatting"
          className="-ml-2 flex flex-wrap items-center gap-0.5 py-1"
        >
          <ToolbarButton
            label="Heading 1"
            active={editor.isActive("heading", { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            H1
          </ToolbarButton>
          <ToolbarButton
            label="Heading 2"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            label="Heading 3"
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            H3
          </ToolbarButton>

          <Separator />

          <ToolbarButton
            label="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <span className="font-bold">B</span>
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <span className="italic">I</span>
          </ToolbarButton>
          <ToolbarButton
            label="Inline code"
            active={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <span className="font-mono">{"<>"}</span>
          </ToolbarButton>

          <Separator />

          <ToolbarButton
            label="Bulleted list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            • List
          </ToolbarButton>
          <ToolbarButton
            label="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1. List
          </ToolbarButton>
          <ToolbarButton
            label="Block quote"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            Quote
          </ToolbarButton>
        </div>
      </div>
    </div>
  );
}

function Separator() {
  return <span className="mx-1 h-4 w-px bg-rule-soft" aria-hidden="true" />;
}

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToolbarButton({ label, active = false, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={[
        "rounded px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        active ? "bg-sunk-strong text-ink" : "text-muted-ink hover:bg-sunk hover:text-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
