/**
 * `DocTree` is Obelus's editor-agnostic document model, and the input to
 * `canonicalText`. Its shape is the JSON that the rich text editor serialises to
 * (ProseMirror's node form), so the Editor can hand its document straight to Core
 * without Core knowing TipTap exists. Core is pure and DOM-free; these are plain
 * data, so they are testable with no browser.
 */

export interface DocTree {
  type: "doc";
  content?: BlockNode[];
}

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | BulletListNode
  | OrderedListNode
  | BlockquoteNode
  | CodeBlockNode;

export interface ParagraphNode {
  type: "paragraph";
  content?: InlineNode[];
}

export interface HeadingNode {
  type: "heading";
  attrs?: { level?: number };
  content?: InlineNode[];
}

export interface BulletListNode {
  type: "bulletList";
  content?: ListItemNode[];
}

export interface OrderedListNode {
  type: "orderedList";
  attrs?: { start?: number };
  content?: ListItemNode[];
}

export interface ListItemNode {
  type: "listItem";
  /** A list item holds any block, including a nested list. */
  content?: BlockNode[];
}

export interface BlockquoteNode {
  type: "blockquote";
  content?: BlockNode[];
}

export interface CodeBlockNode {
  type: "codeBlock";
  attrs?: { language?: string | null };
  content?: TextNode[];
}

export type InlineNode = TextNode | HardBreakNode;

export interface TextNode {
  type: "text";
  text: string;
  marks?: Mark[];
}

/** A paragraph-internal line break. Canonical text collapses it to a space. */
export interface HardBreakNode {
  type: "hardBreak";
}

export type Mark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "code" }
  | { type: "link"; attrs?: { href?: string } };

/** An empty Document, the tree a Writer starts from. */
export function emptyDocTree(): DocTree {
  return { type: "doc", content: [{ type: "paragraph" }] };
}
