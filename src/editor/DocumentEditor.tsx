import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useReducer, type ReactNode } from "react";
import type { DocTree } from "../core/docTree";

export interface DocumentEditorProps {
  initialContent: DocTree;
  onChange: (tree: DocTree) => void;
}

/**
 * The Writer's WYSIWYG surface. It never shows markup: Markdown is emitted by
 * Core for model Passes, Anchors and Revisions, and is never what the Writer
 * edits. The editor owns no anchoring and never sees model output.
 */
export function DocumentEditor({ initialContent, onChange }: DocumentEditorProps) {
  const [, refresh] = useReducer((count: number) => count + 1, 0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
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
      refresh();
    },
    onSelectionUpdate: () => refresh(),
  });

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
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToolbarButton({ label, active = false, disabled = false, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={[
        "rounded px-2 py-1 text-sm transition-colors",
        active ? "bg-stone-900 text-stone-50" : "text-stone-700 hover:bg-stone-100",
        disabled ? "cursor-not-allowed opacity-40" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
