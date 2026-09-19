import type {
  BlockNode,
  BulletListNode,
  CodeBlockNode,
  DocTree,
  InlineNode,
  ListItemNode,
  OrderedListNode,
  TextNode,
} from "./docTree";

/**
 * `canonicalText` is Obelus's one coordinate system. It renders a `DocTree` to
 * Markdown source, and that string is simultaneously what model Passes receive,
 * what an Anchor's quote matches against, what Containment measures, what a
 * Revision stores and what the Judge extracts from. There must be no second
 * coordinate system.
 *
 * Contract (spec §"The canonical string"):
 * - Blocks in document order, each rendered as source Markdown, separated by
 *   exactly one blank line.
 * - A Heading, a list item, a block quote, a code block and a Paragraph each
 *   start a new line.
 * - Paragraph-internal line breaks collapse to single spaces.
 * - Emphasis, strong emphasis, inline code and links are emitted as their
 *   Markdown source.
 * - No trailing whitespace on any line, and the string ends with exactly one
 *   newline.
 * - Deterministic, and stable under parse-and-reserialise: `parseCanonical` is
 *   the inverse of this function over the grammar it emits.
 *
 * Stability requires escaping. Plain text that contains an inline metacharacter
 * (`\`, backtick, `*`, `[`, `]`) or that would otherwise start a block marker
 * is backslash-escaped, so the parser reads it back as the same prose. Nothing a
 * Writer can type is silently reinterpreted.
 */
export function canonicalText(tree: DocTree): string {
  const blocks = (tree.content ?? []).map(renderBlock).filter((block) => block.length > 0);
  const body = blocks.join("\n\n").replace(/[ \t]+$/gm, "");
  return `${body}\n`;
}

/**
 * Word count over a canonical string. Markdown markers such as `#` and `-` are
 * syntax, not prose, and escapes are not words, so only tokens carrying a letter
 * or a digit are counted.
 */
export function wordCount(canonical: string): number {
  return canonical
    .trim()
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token.replace(/\\/g, ""))).length;
}

function renderBlock(block: BlockNode): string {
  switch (block.type) {
    case "paragraph":
      return renderInlines(block.content);
    case "heading":
      return `${"#".repeat(clampHeadingLevel(block.attrs?.level))} ${renderInlines(block.content)}`;
    case "bulletList":
    case "orderedList":
      return renderList(block, 0);
    case "blockquote":
      return renderBlockquote(block.content ?? []);
    case "codeBlock":
      return renderCodeBlock(block);
  }
}

function clampHeadingLevel(level: number | undefined): number {
  if (level === undefined || !Number.isFinite(level)) return 1;
  return Math.min(6, Math.max(1, Math.round(level)));
}

function renderList(node: BulletListNode | OrderedListNode, depth: number): string {
  const ordered = node.type === "orderedList";
  const start = ordered ? node.attrs?.start ?? 1 : 1;
  return (node.content ?? [])
    .map((item, index) => renderListItem(item, ordered ? `${start + index}.` : "-", depth))
    .join("\n");
}

/**
 * A list item holds a first paragraph on the marker line and every later block
 * (paragraph, heading, block quote, code block or nested list) indented beneath
 * it. A non-paragraph first block puts the marker on its own line. Every block
 * is rendered; none is silently dropped.
 */
function renderListItem(item: ListItemNode, marker: string, depth: number): string {
  const pad = "  ".repeat(depth);
  const lines: string[] = [];
  let markerPlaced = false;

  for (const block of item.content ?? []) {
    if (block.type === "paragraph") {
      const inline = renderInlines(block.content);
      lines.push(markerPlaced ? `${pad}  ${inline}` : `${pad}${marker} ${inline}`);
      markerPlaced = true;
      continue;
    }

    if (block.type === "bulletList" || block.type === "orderedList") {
      if (!markerPlaced) {
        lines.push(`${pad}${marker}`);
        markerPlaced = true;
      }
      lines.push(renderList(block, depth + 1));
      continue;
    }

    if (!markerPlaced) {
      lines.push(`${pad}${marker}`);
      markerPlaced = true;
    }
    for (const line of renderBlock(block).split("\n")) lines.push(`${pad}  ${line}`);
  }

  if (!markerPlaced) lines.push(`${pad}${marker}`);
  return lines.join("\n");
}

function renderBlockquote(blocks: BlockNode[]): string {
  const inner = blocks.map(renderBlock).filter((block) => block.length > 0).join("\n\n");
  return inner
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
}

function renderCodeBlock(block: CodeBlockNode): string {
  const text = (block.content ?? [])
    .map((node) => node.text)
    .join("")
    .replace(/\r\n?/g, "\n")
    .replace(/\n+$/, "");
  const language = (block.attrs?.language ?? "").trim();
  const fence = "`".repeat(Math.max(3, longestBacktickRunAtLineStart(text) + 1));
  return `${fence}${language}\n${text}\n${fence}`;
}

function renderInlines(nodes: InlineNode[] | undefined): string {
  let out = "";
  for (const node of nodes ?? []) {
    if (node.type === "text") {
      out += renderText(node);
    } else {
      // A paragraph-internal line break collapses to a single space.
      out += " ";
    }
  }
  const collapsed = out.replace(/\s*\n\s*/g, " ").replace(/^\s+/, "");
  return escapeBlockStart(collapsed);
}

function renderText(node: TextNode): string {
  const text = node.text.replace(/\s*\n\s*/g, " ");
  const marks = node.marks ?? [];
  if (marks.some((mark) => mark.type === "code")) return renderInlineCode(text);

  // Fixed nesting, outermost first, so the same marks always serialise to the
  // same source: italic, then bold, then link.
  let out = escapePlainText(text);
  const link = marks.find((mark) => mark.type === "link");
  if (link !== undefined) out = `[${out}](${link.attrs?.href ?? ""})`;
  if (marks.some((mark) => mark.type === "bold")) out = `**${out}**`;
  if (marks.some((mark) => mark.type === "italic")) out = `*${out}*`;
  return out;
}

function escapePlainText(text: string): string {
  return text.replace(/([\\`*\[\]])/g, "\\$1");
}

/**
 * A Paragraph whose first character would otherwise be read as a block marker
 * is escaped, so prose such as "- not a list" or "1. not a list" round-trips as
 * prose. Inline markers are already escaped by `escapePlainText`.
 */
function escapeBlockStart(line: string): string {
  if (line === "") return line;
  if (/^[#>+\-]/.test(line)) return `\\${line}`;
  if (/^\d+\./.test(line)) return line.replace(/^(\d+)\./, "$1\\.");
  return line;
}

function renderInlineCode(text: string): string {
  if (text === "") return "";
  const delimiter = "`".repeat(longestRun(text, "`") + 1);
  return `${delimiter} ${text} ${delimiter}`;
}

function longestRun(text: string, character: string): number {
  let longest = 0;
  let current = 0;
  for (const char of text) {
    current = char === character ? current + 1 : 0;
    if (current > longest) longest = current;
  }
  return longest;
}

/** A fenced block cannot contain a line that would close an equal-length fence. */
function longestBacktickRunAtLineStart(text: string): number {
  let longest = 0;
  for (const line of text.split("\n")) {
    const match = /^`+/.exec(line.trimStart());
    if (match !== null && match[0].length > longest) longest = match[0].length;
  }
  return longest;
}
