import type {
  BlockNode,
  BulletListNode,
  DocTree,
  InlineNode,
  ListItemNode,
  Mark,
  OrderedListNode,
} from "./docTree";

/**
 * The inverse of `canonicalText` over exactly the grammar `canonicalText`
 * emits: backtick fences, `-` bullets, `N.` ordered items, `#` headings, `>`
 * quotes, and the four inline marks. Nothing wider, so the two halves cannot
 * drift into two grammars. It exists so the round-trip contract is testable —
 * re-parsing canonical output and serialising again returns the same string.
 *
 * Markdown import (story 18) is a separate concern with real-world fixtures; it
 * must not be smuggled in here as speculative generality.
 */
export function parseCanonical(markdown: string): DocTree {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  // canonicalText terminates with exactly one newline; drop that empty tail so
  // it is not mistaken for content.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return { type: "doc", content: parseBlocks(lines) };
}

function parseBlocks(lines: string[]): BlockNode[] {
  const blocks: BlockNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") {
      index++;
      continue;
    }

    const fence = matchFence(line);
    if (fence !== null) {
      const parsed = parseCodeBlock(lines, index, fence);
      blocks.push(parsed.node);
      index = parsed.next;
      continue;
    }

    const heading = matchHeading(line);
    if (heading !== null) {
      blocks.push({
        type: "heading",
        attrs: { level: heading.level },
        content: parseInline(heading.text),
      });
      index++;
      continue;
    }

    if (isBlockquoteLine(line)) {
      const parsed = parseBlockquote(lines, index);
      blocks.push(parsed.node);
      index = parsed.next;
      continue;
    }

    if (isListStart(line.trim())) {
      const parsed = parseList(lines, index);
      blocks.push(parsed.node);
      index = parsed.next;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim() !== "" && !startsBlock(lines[index])) {
      paragraphLines.push(lines[index].trim());
      index++;
    }
    blocks.push({ type: "paragraph", content: parseInline(paragraphLines.join(" ")) });
  }

  return blocks;
}

function startsBlock(line: string): boolean {
  return (
    matchFence(line) !== null ||
    matchHeading(line) !== null ||
    isBlockquoteLine(line) ||
    isListStart(line.trim())
  );
}

interface Fence {
  length: number;
  info: string;
}

function matchFence(line: string): Fence | null {
  const match = /^(`{3,})(.*)$/.exec(line.trim());
  if (match === null) return null;
  return { length: match[1].length, info: match[2] };
}

function isClosingFence(line: string, fence: Fence): boolean {
  const trimmed = line.trim();
  return /^`+$/.test(trimmed) && trimmed.length >= fence.length;
}

function parseCodeBlock(
  lines: string[],
  start: number,
  fence: Fence,
): { node: BlockNode; next: number } {
  const content: string[] = [];
  let index = start + 1;
  while (index < lines.length && !isClosingFence(lines[index], fence)) {
    content.push(lines[index]);
    index++;
  }
  if (index < lines.length) index++; // consume the closing fence

  const text = content.join("\n");
  const language = fence.info.trim();
  const node: BlockNode = {
    type: "codeBlock",
    ...(language === "" ? {} : { attrs: { language } }),
    ...(text === "" ? {} : { content: [{ type: "text", text }] }),
  };
  return { node, next: index };
}

function matchHeading(line: string): { level: number; text: string } | null {
  const match = /^(#{1,6})(?:\s+(.*))?$/.exec(line);
  if (match === null) return null;
  return { level: match[1].length, text: match[2] ?? "" };
}

function isBlockquoteLine(line: string): boolean {
  return /^>(?: |$)/.test(line);
}

function stripBlockquoteMarker(line: string): string {
  if (line === ">") return "";
  return line.startsWith("> ") ? line.slice(2) : line.slice(1);
}

function parseBlockquote(lines: string[], start: number): { node: BlockNode; next: number } {
  const inner: string[] = [];
  let index = start;
  while (index < lines.length && isBlockquoteLine(lines[index])) {
    inner.push(stripBlockquoteMarker(lines[index]));
    index++;
  }
  return { node: { type: "blockquote", content: parseBlocks(inner) }, next: index };
}

function indentOf(line: string): number {
  const match = /^ */.exec(line);
  return match === null ? 0 : match[0].length;
}

function isBulletStart(text: string): boolean {
  return /^-(?:\s|$)/.test(text);
}

function isOrderedStart(text: string): boolean {
  return /^\d+\.(?:\s|$)/.test(text);
}

function isListStart(text: string): boolean {
  return isBulletStart(text) || isOrderedStart(text);
}

function makeList(ordered: boolean, start = 1): BulletListNode | OrderedListNode {
  if (!ordered) return { type: "bulletList", content: [] };
  return start === 1
    ? { type: "orderedList", content: [] }
    : { type: "orderedList", attrs: { start }, content: [] };
}

function orderedStart(text: string): number {
  const match = /^(\d+)/.exec(text);
  return match === null ? 1 : Number.parseInt(match[1], 10);
}

function listItemText(rest: string, ordered: boolean): string {
  const match = ordered ? /^\d+\.\s*(.*)$/.exec(rest) : /^-\s*(.*)$/.exec(rest);
  return match === null ? rest : match[1];
}

/**
 * A list block is a run of items at one indent. Each item's body is every
 * following line more indented than the marker (nested lists, paragraphs, code
 * blocks and their blank lines included), de-indented and parsed as blocks. A
 * blank line stays inside the item only when more-indented content follows, so
 * a code block's internal blank line survives while a genuine list break does
 * not.
 */
function parseList(lines: string[], start: number): { node: BlockNode; next: number } {
  const baseIndent = indentOf(lines[start]);
  const firstRest = lines[start].slice(baseIndent);
  const rootOrdered = isOrderedStart(firstRest);
  const root = makeList(rootOrdered, rootOrdered ? orderedStart(firstRest) : 1);

  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") break;
    const indent = indentOf(line);
    if (indent !== baseIndent) break;
    const rest = line.slice(indent);
    if (!isListStart(rest) || isOrderedStart(rest) !== rootOrdered) break;

    const item: ListItemNode = { type: "listItem", content: [] };
    root.content = [...(root.content ?? []), item];
    const text = listItemText(rest, rootOrdered).trim();
    if (text !== "") item.content = [{ type: "paragraph", content: parseInline(text) }];
    index++;

    const region: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index];
      if (candidate.trim() === "") {
        let lookahead = index;
        while (lookahead < lines.length && lines[lookahead].trim() === "") lookahead++;
        if (lookahead >= lines.length || indentOf(lines[lookahead]) <= baseIndent) break;
        region.push("");
        index++;
        continue;
      }
      if (indentOf(candidate) <= baseIndent) break;
      region.push(candidate.slice(baseIndent + 2));
      index++;
    }

    for (const block of parseBlocks(region)) {
      item.content = [...(item.content ?? []), block];
    }
  }

  return { node: root, next: index };
}

/**
 * Parses inline Markdown. Closing delimiters are found greedily but skip
 * backslash-escaped characters, which is exact for the nesting `canonicalText`
 * emits and stable for its output.
 */
function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = "";
  let index = 0;

  const flush = (): void => {
    if (buffer === "") return;
    nodes.push({ type: "text", text: buffer });
    buffer = "";
  };

  while (index < text.length) {
    const char = text[index];

    if (char === "\\" && index + 1 < text.length && isEscapable(text[index + 1])) {
      buffer += text[index + 1];
      index += 2;
      continue;
    }

    if (char === "`") {
      const run = countRun(text, index, "`");
      const delimiter = "`".repeat(run);
      const close = text.indexOf(delimiter, index + run);
      if (close !== -1) {
        const code = stripCodePadding(text.slice(index + run, close));
        flush();
        nodes.push({ type: "text", text: code, marks: [{ type: "code" }] });
        index = close + run;
        continue;
      }
    }

    if (char === "*") {
      const run = countRun(text, index, "*");
      if (run >= 1 && run <= 3) {
        const close = findDelimiter(text, index + run, "*".repeat(run));
        if (close !== -1) {
          const marks: Mark[] = [];
          if (run >= 2) marks.push({ type: "bold" });
          if (run === 1 || run === 3) marks.push({ type: "italic" });
          flush();
          nodes.push(...applyMarks(parseInline(text.slice(index + run, close)), marks));
          index = close + run;
          continue;
        }
      }
    }

    if (char === "[") {
      const link = parseLink(text, index);
      if (link !== null) {
        flush();
        nodes.push(
          ...applyMarks(parseInline(link.label), [{ type: "link", attrs: { href: link.href } }]),
        );
        index = link.next;
        continue;
      }
    }

    buffer += char;
    index++;
  }

  flush();
  return nodes;
}

/** Finds `delimiter` at or after `from`, ignoring backslash-escaped characters. */
function findDelimiter(text: string, from: number, delimiter: string): number {
  let index = from;
  while (index <= text.length - delimiter.length) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }
    if (text.startsWith(delimiter, index)) return index;
    index++;
  }
  return -1;
}

function applyMarks(nodes: InlineNode[], marks: Mark[]): InlineNode[] {
  return nodes.map((node) =>
    node.type === "text" ? { ...node, marks: [...(node.marks ?? []), ...marks] } : node,
  );
}

function parseLink(
  text: string,
  start: number,
): { label: string; href: string; next: number } | null {
  let depth = 0;
  let index = start;
  for (; index < text.length; index++) {
    if (text[index] === "\\") {
      index++;
      continue;
    }
    if (text[index] === "[") depth++;
    else if (text[index] === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (index >= text.length || text[index] !== "]") return null;
  if (text[index + 1] !== "(") return null;

  const label = text.slice(start + 1, index);
  let close = index + 2;
  let parens = 1;
  for (; close < text.length; close++) {
    if (text[close] === "(") parens++;
    else if (text[close] === ")") {
      parens--;
      if (parens === 0) break;
    }
  }
  if (close >= text.length) return null;

  return { label, href: text.slice(index + 2, close), next: close + 1 };
}

function countRun(text: string, start: number, character: string): number {
  let count = 0;
  while (text[start + count] === character) count++;
  return count;
}

function stripCodePadding(raw: string): string {
  if (raw.length >= 2 && raw.startsWith(" ") && raw.endsWith(" ")) return raw.slice(1, -1);
  return raw;
}

/**
 * The characters `canonicalText` escapes. A backslash before anything else is
 * literal, so an imported Markdown backslash is not silently dropped.
 */
function isEscapable(char: string): boolean {
  return "\\`*[]#>+-.)".includes(char);
}
