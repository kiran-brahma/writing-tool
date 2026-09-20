import { leadingSyntaxLength } from "./sentences";
import { countWords } from "./tokens";
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
 *
 * The renderer carries a *map* alongside the string: for every canonical
 * character, the ProseMirror position of the source character it came from, or
 * `null` for syntax this function inserted. `projectInterval` reads the map to
 * turn a resolved Anchor interval into an Editor range. There is one renderer,
 * so the string and the map cannot drift apart.
 */
export interface CanonicalMap {
  text: string;
  /** `positions[i]` is the Editor position of `text[i]`, or `null` for syntax. */
  positions: (number | null)[];
}

interface Rendered {
  value: CanonicalMap;
  /**
   * The ProseMirror size of what was rendered. Carried beside the text so the
   * same traversal that renders a block also places the next one; there is no
   * second walk that could disagree about a node's size.
   */
  size: number;
}

/** A source character and the index it held before any normalisation. */
interface SourceChar {
  char: string;
  original: number;
}

export function canonicalText(tree: DocTree): string {
  return canonicalTextWithMap(tree).text;
}

/**
 * The canonical string plus its source-to-Editor position map. PM positions are
 * counted the way ProseMirror counts them: the first top-level block starts at
 * 0, a Paragraph or Heading holds its inline content one position in, and every
 * non-leaf node costs two positions of its own.
 */
export function canonicalTextWithMap(tree: DocTree): CanonicalMap {
  const blocks: CanonicalMap[] = [];
  let position = 0;

  for (const block of tree.content ?? []) {
    const rendered = renderBlock(block, position);
    if (rendered.value.text.length > 0) blocks.push(rendered.value);
    position += rendered.size;
  }

  const body = trimTrailingWhitespace(join(blocks, syntax("\n\n")));
  return concat([body, syntax("\n")]);
}

/**
 * One top-level block's place in the canonical string. `start` and the length of
 * `text` name the block's half-open interval, which is how a paragraph-scope
 * Pass knows the Target and how Containment measures against it, without a
 * second coordinate system.
 */
export interface CanonicalBlock {
  block: BlockNode;
  /** The block's index in `tree.content`. */
  index: number;
  /** The canonical offset the block starts at. */
  start: number;
  /** The canonical offset just past the block's text, before its separator. */
  end: number;
  /** The block's canonical source, without the blank-line separator. */
  text: string;
}

/**
 * The top-level blocks with their canonical offsets. Empty blocks are omitted,
 * exactly as `canonicalText` omits them, so the offsets and text match the one
 * canonical string. Trailing whitespace is trimmed per block; because the
 * renderer trims per line, this is the same result as trimming the joined body.
 */
export function canonicalBlocks(tree: DocTree): CanonicalBlock[] {
  const blocks: CanonicalBlock[] = [];
  let position = 0;
  let start = 0;

  for (const [index, block] of (tree.content ?? []).entries()) {
    const rendered = renderBlock(block, position);
    position += rendered.size;
    if (rendered.value.text.length === 0) continue;

    const text = trimTrailingWhitespace(rendered.value).text;
    blocks.push({ block, index, start, end: start + text.length, text });
    start += text.length + 2;
  }

  return blocks;
}

/**
 * Word count over a canonical string. A line's leading block marker (`#`, `>`,
 * `-`, `N.`) is syntax, not prose, so it is skipped, and the words are then
 * counted by the one token definition in `tokens.ts`. The header word count and
 * the metrics panel's sentence lengths therefore agree on what a word is.
 */
export function wordCount(canonical: string): number {
  const prose = canonical
    .split("\n")
    .map((line) => line.slice(leadingSyntaxLength(line)))
    .join("\n");
  return countWords(prose);
}

// ---------------------------------------------------------------------------
// Annotated output
// ---------------------------------------------------------------------------

const EMPTY: CanonicalMap = { text: "", positions: [] };

/** A run this renderer inserted: Markdown markers, separators, escapes. */
function syntax(text: string): CanonicalMap {
  return { text, positions: new Array<number | null>(text.length).fill(null) };
}

/** A run of source prose: char `i` sits at Editor position `pmStart + i`. */
function source(text: string, pmStart: number): CanonicalMap {
  return {
    text,
    positions: Array.from({ length: text.length }, (_, index) => pmStart + index),
  };
}

function concat(parts: CanonicalMap[]): CanonicalMap {
  let length = 0;
  for (const part of parts) length += part.text.length;

  const positions = new Array<number | null>(length);
  let text = "";
  let offset = 0;
  for (const part of parts) {
    text += part.text;
    const partPositions = part.positions;
    for (let index = 0; index < partPositions.length; index++) {
      positions[offset + index] = partPositions[index];
    }
    offset += partPositions.length;
  }
  return { text, positions };
}

/** Joins annotated runs with a syntax separator. */
function join(parts: CanonicalMap[], separator: CanonicalMap): CanonicalMap {
  const out: CanonicalMap[] = [];
  parts.forEach((part, index) => {
    if (index > 0) out.push(separator);
    out.push(part);
  });
  return concat(out);
}

/** Splits annotated output on `\n`, keeping each character's position. */
function splitLines(value: CanonicalMap): CanonicalMap[] {
  const lines: CanonicalMap[] = [];
  let start = 0;
  for (let index = 0; index <= value.text.length; index++) {
    if (index === value.text.length || value.text[index] === "\n") {
      lines.push(slice(value, start, index));
      start = index + 1;
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function renderBlock(block: BlockNode, position: number): Rendered {
  switch (block.type) {
    case "paragraph": {
      const inline = renderInlines(block.content, position + 1);
      return { value: inline.value, size: inline.size + 2 };
    }
    case "heading": {
      const inline = renderInlines(block.content, position + 1);
      return {
        value: concat([
          syntax(`${"#".repeat(clampHeadingLevel(block.attrs?.level))} `),
          inline.value,
        ]),
        size: inline.size + 2,
      };
    }
    case "bulletList":
    case "orderedList":
      return renderList(block, position, 0);
    case "blockquote":
      return renderBlockquote(block.content ?? [], position);
    case "codeBlock":
      return renderCodeBlock(block, position);
  }
}

function clampHeadingLevel(level: number | undefined): number {
  if (level === undefined || !Number.isFinite(level)) return 1;
  return Math.min(6, Math.max(1, Math.round(level)));
}

/**
 * A list item holds a first paragraph on the marker line and every later block
 * (paragraph, heading, block quote, code block or nested list) indented beneath
 * it. A non-paragraph first block puts the marker on its own line. Every block
 * is rendered; none is silently dropped.
 */
function renderList(
  node: BulletListNode | OrderedListNode,
  position: number,
  depth: number,
): Rendered {
  const ordered = node.type === "orderedList";
  const start = ordered ? node.attrs?.start ?? 1 : 1;
  const lines: CanonicalMap[] = [];
  let itemPosition = position + 1;
  let size = 0;

  (node.content ?? []).forEach((item, index) => {
    const marker = ordered ? `${start + index}.` : "-";
    const rendered = renderListItem(item, marker, depth, itemPosition);
    lines.push(rendered.value);
    itemPosition += rendered.size;
    size += rendered.size;
  });

  return { value: join(lines, syntax("\n")), size: size + 2 };
}

function renderListItem(
  item: ListItemNode,
  marker: string,
  depth: number,
  position: number,
): Rendered {
  const pad = "  ".repeat(depth);
  const lines: CanonicalMap[] = [];
  let markerPlaced = false;
  let childPosition = position + 1;
  let size = 0;

  for (const block of item.content ?? []) {
    if (block.type === "paragraph") {
      const inline = renderInlines(block.content, childPosition + 1);
      const prefix = markerPlaced ? `${pad}  ` : `${pad}${marker} `;
      lines.push(concat([syntax(prefix), inline.value]));
      markerPlaced = true;
      size += inline.size + 2;
      childPosition += inline.size + 2;
      continue;
    }

    if (block.type === "bulletList" || block.type === "orderedList") {
      if (!markerPlaced) {
        lines.push(syntax(`${pad}${marker}`));
        markerPlaced = true;
      }
      const rendered = renderList(block, childPosition, depth + 1);
      lines.push(rendered.value);
      size += rendered.size;
      childPosition += rendered.size;
      continue;
    }

    if (!markerPlaced) {
      lines.push(syntax(`${pad}${marker}`));
      markerPlaced = true;
    }
    const rendered = renderBlock(block, childPosition);
    lines.push(prefixLines(rendered.value, `${pad}  `));
    size += rendered.size;
    childPosition += rendered.size;
  }

  if (!markerPlaced) lines.push(syntax(`${pad}${marker}`));
  return { value: join(lines, syntax("\n")), size: size + 2 };
}

function renderBlockquote(blocks: BlockNode[], position: number): Rendered {
  const inner: CanonicalMap[] = [];
  let blockPosition = position + 1;
  let size = 0;

  for (const block of blocks) {
    const rendered = renderBlock(block, blockPosition);
    if (rendered.value.text.length > 0) inner.push(rendered.value);
    blockPosition += rendered.size;
    size += rendered.size;
  }

  const lines = splitLines(join(inner, syntax("\n\n"))).map((line) =>
    concat([syntax(line.text === "" ? ">" : "> "), line]),
  );
  return { value: join(lines, syntax("\n")), size: size + 2 };
}

function renderCodeBlock(block: CodeBlockNode, position: number): Rendered {
  const { text, positions } = codeTextWithPositions(block, position + 1);
  const language = (block.attrs?.language ?? "").trim();
  const fence = "`".repeat(Math.max(3, longestBacktickRunAtLineStart(text) + 1));
  // ProseMirror sizes a block from its stored content, not its canonical
  // rendering: trailing newlines are stripped from the string but still occupy
  // positions, so the next block must advance past them.
  const size = (block.content ?? []).reduce((length, node) => length + node.text.length, 0) + 2;
  return {
    value: concat([syntax(`${fence}${language}\n`), { text, positions }, syntax(`\n${fence}`)]),
    size,
  };
}

function codeTextWithPositions(
  block: CodeBlockNode,
  start: number,
): { text: string; positions: number[] } {
  const entries = normalizeCode(block);
  return {
    text: entries.map((entry) => entry.char).join(""),
    positions: entries.map((entry) => start + entry.original),
  };
}

/**
 * Code block source, with line endings normalised and trailing blank lines
 * dropped, each character keeping the index it had in the joined content.
 */
function normalizeCode(block: CodeBlockNode): SourceChar[] {
  const raw = (block.content ?? []).map((node) => node.text).join("");
  const entries: SourceChar[] = [];
  for (let index = 0; index < raw.length; index++) {
    const char = raw[index];
    if (char === "\r") {
      entries.push({ char: "\n", original: index });
      if (raw[index + 1] === "\n") index++;
    } else {
      entries.push({ char, original: index });
    }
  }
  while (entries.length > 0 && entries[entries.length - 1].char === "\n") entries.pop();
  return entries;
}

// ---------------------------------------------------------------------------
// Inline content
// ---------------------------------------------------------------------------

function renderInlines(nodes: InlineNode[] | undefined, position: number): Rendered {
  const parts: CanonicalMap[] = [];
  let pm = position;
  let size = 0;

  for (const node of nodes ?? []) {
    if (node.type === "text") {
      parts.push(renderText(node, pm));
      pm += node.text.length;
      size += node.text.length;
    } else {
      // A paragraph-internal line break collapses to a single space.
      parts.push(syntax(" "));
      pm += 1;
      size += 1;
    }
  }

  return { value: escapeBlockStart(dropLeadingWhitespace(concat(parts))), size };
}

function renderText(node: TextNode, position: number): CanonicalMap {
  const chars = collapseWhitespace(node.text);
  const marks = node.marks ?? [];
  if (marks.some((mark) => mark.type === "code")) {
    return renderInlineCode(chars, position);
  }

  const body = concat(
    chars.map((entry) => {
      const escaped = escapePlainCharacter(entry.char);
      const sourceChar = source(entry.char, position + entry.original);
      return escaped === entry.char
        ? sourceChar
        : concat([syntax(escaped.slice(0, -1)), sourceChar]);
    }),
  );

  // Fixed nesting, outermost first, so the same marks always serialise to the
  // same source: italic, then bold, then link.
  const link = marks.find((mark) => mark.type === "link");
  let prefix = "";
  let suffix = "";
  if (link !== undefined) {
    prefix = "[";
    suffix = `](${link.attrs?.href ?? ""})`;
  }
  if (marks.some((mark) => mark.type === "bold")) {
    prefix = `**${prefix}`;
    suffix = `${suffix}**`;
  }
  if (marks.some((mark) => mark.type === "italic")) {
    prefix = `*${prefix}`;
    suffix = `${suffix}*`;
  }
  return concat([syntax(prefix), body, syntax(suffix)]);
}

function collapseWhitespace(text: string): SourceChar[] {
  const chars: SourceChar[] = [];
  let last = 0;
  const pattern = /\s*\n\s*/g;
  let match = pattern.exec(text);

  const copy = (from: number, to: number): void => {
    for (let index = from; index < to; index++) {
      chars.push({ char: text[index], original: index });
    }
  };

  while (match !== null) {
    copy(last, match.index);
    chars.push({ char: " ", original: match.index });
    last = match.index + match[0].length;
    if (match[0].length === 0) pattern.lastIndex++;
    match = pattern.exec(text);
  }
  copy(last, text.length);
  return chars;
}

function escapePlainCharacter(char: string): string {
  return /[\\`*[\]]/.test(char) ? `\\${char}` : char;
}

/**
 * A Paragraph whose first character would otherwise be read as a block marker
 * is escaped, so prose such as "- not a list" or "1. not a list" round-trips as
 * prose. Inline markers are already escaped by the text renderer.
 */
function escapeBlockStart(line: CanonicalMap): CanonicalMap {
  if (line.text === "") return line;
  if (/^[#>+\-]/.test(line.text)) return concat([syntax("\\"), line]);
  if (/^\d+\./.test(line.text)) {
    const dot = line.text.indexOf(".");
    return concat([slice(line, 0, dot), syntax("\\"), slice(line, dot)]);
  }
  return line;
}

function dropLeadingWhitespace(value: CanonicalMap): CanonicalMap {
  let index = 0;
  while (index < value.text.length && /\s/.test(value.text[index])) index++;
  return slice(value, index);
}

function renderInlineCode(chars: SourceChar[], position: number): CanonicalMap {
  const text = chars.map((entry) => entry.char).join("");
  if (text === "") return EMPTY;

  const body: CanonicalMap = {
    text,
    positions: chars.map((entry) => position + entry.original),
  };
  const delimiter = "`".repeat(longestRun(text, "`") + 1);
  // Pad only when needed for the code span to be unambiguous, so ordinary code
  // is emitted as its source (`` `foo` `` rather than `` ` foo ` ``) and a quote
  // from the model's view exists verbatim. The parser strips one padded space
  // from each end on exactly these cases.
  const needsPadding =
    text.trim() !== "" &&
    (text.startsWith(" ") || text.endsWith(" ") || text.startsWith("`") || text.endsWith("`"));

  return concat([
    syntax(delimiter),
    ...(needsPadding ? [syntax(" ")] : []),
    body,
    ...(needsPadding ? [syntax(" ")] : []),
    syntax(delimiter),
  ]);
}

// ---------------------------------------------------------------------------
// Small annotated helpers
// ---------------------------------------------------------------------------

function slice(value: CanonicalMap, from: number, to: number = value.text.length): CanonicalMap {
  return { text: value.text.slice(from, to), positions: value.positions.slice(from, to) };
}

/** Prefixes every line of an annotated run, e.g. when indenting a nested block. */
function prefixLines(value: CanonicalMap, prefix: string): CanonicalMap {
  const lines = splitLines(value).map((line) => concat([syntax(prefix), line]));
  return join(lines, syntax("\n"));
}

/** Removes trailing spaces and tabs from every line, dropping their positions. */
function trimTrailingWhitespace(value: CanonicalMap): CanonicalMap {
  const lines = splitLines(value).map((line) => {
    let end = line.text.length;
    while (end > 0 && (line.text[end - 1] === " " || line.text[end - 1] === "\t")) end--;
    return slice(line, 0, end);
  });
  return join(lines, syntax("\n"));
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
