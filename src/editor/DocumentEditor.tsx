import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useReducer, useRef, type ReactNode } from "react";
import { canonicalIntervalForRange, projectIntervals } from "../core/anchor";
import type { DocTree } from "../core/docTree";
import type { Interval } from "../core/finding";
import { HighlightExtension, setHighlightRanges } from "./highlight";

export interface DocumentEditorProps {
  initialContent: DocTree;
  onChange: (tree: DocTree) => void;
  /** Canonical intervals Core resolved; the Editor only draws them. */
  highlights: Interval[];
  /**
   * The top-level block the cursor moved into. A paragraph-scope Pass targets
   * that Paragraph; the shell turns it into the Target and its context.
   */
  onTargetChange?: (blockIndex: number) => void;
  /**
   * The current text selection as a canonical interval, so the Judge can
   * compare the Writer's chosen span across two Revisions. `null` when the
   * selection is collapsed.
   */
  onSelectionChange?: (interval: Interval | null) => void;
  /**
   * A Section heading the Writer asked to jump to. The `nonce` changes on every
   * click, so clicking the same heading twice still moves the cursor.
   */
  jumpRequest?: { blockIndex: number; nonce: number } | null;
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
  onTargetChange,
  onSelectionChange,
  jumpRequest,
}: DocumentEditorProps) {
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  const lastTargetRef = useRef(-1);

  const reportTarget = (instance: Editor) => {
    if (onTargetChange === undefined) return;
    const index = instance.state.selection.$from.index(0);
    if (index === lastTargetRef.current) return;
    lastTargetRef.current = index;
    onTargetChange(index);
  };

  const reportSelection = (instance: Editor) => {
    if (onSelectionChange === undefined) return;
    const { from, to } = instance.state.selection;
    onSelectionChange(
      canonicalIntervalForRange(instance.getJSON() as unknown as DocTree, { from, to }),
    );
  };

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
    },
    onUpdate: ({ editor: instance }) => {
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

  useEffect(() => {
    if (editor === null) return;
    const ranges = projectIntervals(editor.getJSON() as unknown as DocTree, highlights);
    setHighlightRanges(editor, ranges);
  }, [editor, highlights]);

  useEffect(() => {
    if (editor === null || jumpRequest == null) return;
    const { blockIndex } = jumpRequest;
    if (blockIndex < 0 || blockIndex >= editor.state.doc.childCount) return;

    // The Editor counts positions the way ProseMirror does: a top-level block's
    // inline content begins one position past its start, and each preceding
    // sibling costs its own node size.
    let position = 1;
    for (let index = 0; index < blockIndex; index += 1) {
      position += editor.state.doc.child(index).nodeSize;
    }
    editor.chain().focus().setTextSelection(position).scrollIntoView().run();
  }, [editor, jumpRequest]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="min-h-0 flex-1 overflow-y-auto px-8 py-6" />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (editor === null) {
    return <div className="h-11 border-b border-stone-200" />;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-stone-200 px-3 py-1.5">
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

      <Separator />

      <ToolbarButton
        label="Undo"
        onClick={() => editor.chain().focus().undo().run()}
      >
        Undo
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        onClick={() => editor.chain().focus().redo().run()}
      >
        Redo
      </ToolbarButton>
    </div>
  );
}

function Separator() {
  return <span className="mx-1 h-5 w-px bg-stone-200" aria-hidden="true" />;
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
        "rounded px-2 py-1 text-sm transition-colors",
        active ? "bg-stone-900 text-stone-50" : "text-stone-700 hover:bg-stone-100",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
