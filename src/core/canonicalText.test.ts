import { describe, expect, it } from "vitest";
import { canonicalText, wordCount } from "./canonicalText";
import type { BlockNode, DocTree, ParagraphNode } from "./docTree";
import { parseCanonical } from "./parseCanonical";

function doc(...content: BlockNode[]): DocTree {
  return { type: "doc", content };
}

function paragraph(text: string): ParagraphNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

describe("canonicalText", () => {
  it("renders blocks in document order, separated by one blank line", () => {
    const tree = doc(
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
      paragraph("First paragraph."),
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [paragraph("One")] },
          { type: "listItem", content: [paragraph("Two")] },
        ],
      },
    );

    expect(canonicalText(tree)).toBe(
      ["# Title", "", "First paragraph.", "", "- One", "- Two", ""].join("\n"),
    );
  });

  it("emits emphasis, strong, inline code and links as Markdown source", () => {
    const tree = doc({
      type: "paragraph",
      content: [
        { type: "text", text: "plain " },
        { type: "text", text: "italic", marks: [{ type: "italic" }] },
        { type: "text", text: " " },
        { type: "text", text: "strong", marks: [{ type: "bold" }] },
        { type: "text", text: " " },
        { type: "text", text: "both", marks: [{ type: "bold" }, { type: "italic" }] },
        { type: "text", text: " " },
        { type: "text", text: "code", marks: [{ type: "code" }] },
        { type: "text", text: " " },
        {
          type: "text",
          text: "link",
          marks: [{ type: "link", attrs: { href: "https://example.com" } }],
        },
      ],
    });

    expect(canonicalText(tree)).toBe(
      "plain *italic* **strong** ***both*** ` code ` [link](https://example.com)\n",
    );
  });

  it("collapses a paragraph-internal line break to a single space", () => {
    const tree = doc({
      type: "paragraph",
      content: [
        { type: "text", text: "before" },
        { type: "hardBreak" },
        { type: "text", text: "after" },
      ],
    });

    expect(canonicalText(tree)).toBe("before after\n");
  });

  it("renders a block quote with a marker on every line", () => {
    const tree = doc({
      type: "blockquote",
      content: [paragraph("One"), paragraph("Two")],
    });

    expect(canonicalText(tree)).toBe("> One\n>\n> Two\n");
  });

  it("renders a code block as a fenced block", () => {
    const tree = doc({
      type: "codeBlock",
      attrs: { language: "ts" },
      content: [{ type: "text", text: "const a = 1;\nconst b = 2;" }],
    });

    expect(canonicalText(tree)).toBe("```ts\nconst a = 1;\nconst b = 2;\n```\n");
  });

  it("has no trailing whitespace on any line and ends with exactly one newline", () => {
    const tree = doc(paragraph("text with trailing spaces   "), paragraph(""));
    const result = canonicalText(tree);

    expect(result.endsWith("\n")).toBe(true);
    expect(result.endsWith("\n\n")).toBe(false);
    for (const line of result.split("\n")) {
      expect(line).toBe(line.replace(/[ \t]+$/, ""));
    }
  });

  it("is deterministic: the same tree always produces the same string", () => {
    const tree = doc(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "H" }] },
      {
        type: "orderedList",
        attrs: { start: 3 },
        content: [{ type: "listItem", content: [paragraph("item")] }],
      },
    );

    expect(canonicalText(tree)).toBe(canonicalText(tree));
  });

  it("returns a lone newline for an empty document", () => {
    expect(canonicalText({ type: "doc", content: [] })).toBe("\n");
  });

  it("round-trips through parsing and serialising unchanged", () => {
    const trees: DocTree[] = [
      doc(),
      doc(paragraph("A plain paragraph.")),
      doc(
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
        paragraph("Body text."),
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [paragraph("one")] },
            { type: "listItem", content: [paragraph("two")] },
          ],
        },
      ),
      doc({
        type: "paragraph",
        content: [
          { type: "text", text: "em", marks: [{ type: "italic" }] },
          { type: "text", text: " and " },
          { type: "text", text: "strong", marks: [{ type: "bold" }] },
          { type: "text", text: " and " },
          { type: "text", text: "code", marks: [{ type: "code" }] },
          { type: "text", text: " and " },
          { type: "text", text: "link", marks: [{ type: "link", attrs: { href: "https://x.test" } }] },
        ],
      }),
      doc({ type: "blockquote", content: [paragraph("quoted"), paragraph("more")] }),
      doc({ type: "codeBlock", attrs: { language: "js" }, content: [{ type: "text", text: "a\n\nb" }] }),
      doc({
        type: "orderedList",
        attrs: { start: 2 },
        content: [
          { type: "listItem", content: [paragraph("second")] },
          { type: "listItem", content: [paragraph("third")] },
        ],
      }),
      doc({
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              paragraph("parent"),
              {
                type: "bulletList",
                content: [{ type: "listItem", content: [paragraph("child")] }],
              },
            ],
          },
        ],
      }),
    ];

    for (const tree of trees) {
      const once = canonicalText(tree);
      const twice = canonicalText(parseCanonical(once));
      expect(twice).toBe(once);
    }
  });

  it("round-trips even when plain text contains Markdown punctuation", () => {
    const trees: DocTree[] = [
      doc(paragraph("literal *stars* and **doubles** and a lone * and # hashes")),
      doc(paragraph("a - dash, 1. a number, a > quote, and [brackets]")),
      doc(paragraph("backticks ` and `` and a stray [bracket")),
      doc(paragraph("trailing punctuation! and a link-ish [text](not-a-url)")),
      doc(paragraph("spaces   inside   text")),
      doc(paragraph("a backslash \\ and an escaped \\* star")),
      doc({ type: "paragraph", content: [{ type: "hardBreak" }, { type: "text", text: "after" }] }),
    ];

    for (const tree of trees) {
      const once = canonicalText(tree);
      expect(canonicalText(parseCanonical(once))).toBe(once);
    }
  });

  it("round-trips a fuzz of adversarial prose", () => {
    const alphabet = ["\\", "`", "*", "[", "]", "#", ">", "-", "+", ".", ")", "1", " ", "a", "~"];
    let seed = 987_654_321;
    const next = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed;
    };

    for (let iteration = 0; iteration < 5_000; iteration++) {
      const length = next() % 14;
      let text = "";
      for (let position = 0; position < length; position++) {
        text += alphabet[next() % alphabet.length];
      }

      const once = canonicalText(doc(paragraph(text)));
      const twice = canonicalText(parseCanonical(once));
      expect(twice, `round-trip failed for ${JSON.stringify(text)}`).toBe(once);
    }
  });

  it("renders and round-trips every block kind nested in a list item", () => {
    const tree = doc({
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            paragraph("first"),
            { type: "blockquote", content: [paragraph("quoted")] },
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Nested heading" }] },
            { type: "codeBlock", content: [{ type: "text", text: "const x = 1;" }] },
          ],
        },
      ],
    });

    const once = canonicalText(tree);
    expect(once).toContain("quoted");
    expect(once).toContain("Nested heading");
    expect(once).toContain("const x = 1;");
    expect(canonicalText(parseCanonical(once))).toBe(once);
  });

  it("widen the fence when code contains an indented backtick line", () => {
    const tree = doc({ type: "codeBlock", content: [{ type: "text", text: "a\n  ```\nb" }] });
    const once = canonicalText(tree);

    expect(once).toBe("````\na\n  ```\nb\n````\n");
    expect(canonicalText(parseCanonical(once))).toBe(once);
  });

  it("keeps a blank line inside a code block nested in a list item", () => {
    const tree = doc({
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            paragraph("item"),
            { type: "codeBlock", content: [{ type: "text", text: "a\n\nb" }] },
          ],
        },
      ],
    });

    const once = canonicalText(tree);
    const reparsed = canonicalText(parseCanonical(once));
    expect(reparsed).toBe(once);
    expect(once).toContain("  a\n\n  b");
  });
});

describe("wordCount", () => {
  it("counts prose words without counting Markdown markers", () => {
    expect(wordCount("one two three")).toBe(3);
    expect(wordCount("   \n  ")).toBe(0);
    expect(wordCount("# Title\n\nBody words here.")).toBe(4);
    expect(wordCount("- one\n- two")).toBe(2);
  });
});
