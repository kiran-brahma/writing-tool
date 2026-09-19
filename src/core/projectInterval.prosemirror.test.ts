import { getSchema } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Node as PMNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { projectInterval, resolveAnchor } from "./anchor";
import { canonicalText } from "./canonicalText";
import type { DocTree } from "./docTree";

/**
 * `projectInterval` has to agree with ProseMirror's own position model, or a
 * Highlight lands on the wrong prose. This test builds the real editor schema
 * and checks that the projected range covers the anchored text — the DOM result
 * cannot be asserted, but the range can.
 */
const schema = getSchema([StarterKit.configure({ heading: { levels: [1, 2, 3] } })]);

function textAt(tree: DocTree, quote: string, occurrence = 0): string | null {
  const canonical = canonicalText(tree);
  let offset = -1;
  for (let index = 0; index <= occurrence; index++) {
    offset = canonical.indexOf(quote, offset + 1);
  }
  const interval = resolveAnchor({ quote, offset }, canonical);
  if (interval === null) throw new Error(`quote "${quote}" not found`);

  const range = projectInterval(tree, interval);
  if (range === null) return null;

  const doc = PMNode.fromJSON(schema, tree);
  return doc.textBetween(range.from, range.to);
}

function doc(...content: NonNullable<DocTree["content"]>): DocTree {
  return { type: "doc", content };
}

describe("projectInterval against ProseMirror", () => {
  it("covers a plain Paragraph's prose", () => {
    const tree = doc({ type: "paragraph", content: [{ type: "text", text: "This is very good." }] });
    expect(textAt(tree, "very")).toBe("very");
  });

  it("covers prose in a later Paragraph", () => {
    const tree = doc(
      { type: "paragraph", content: [{ type: "text", text: "First paragraph." }] },
      { type: "paragraph", content: [{ type: "text", text: "This is quite good." }] },
    );
    expect(textAt(tree, "quite")).toBe("quite");
  });

  it("covers prose inside strong emphasis", () => {
    const tree = doc({
      type: "paragraph",
      content: [
        { type: "text", text: "This is " },
        { type: "text", text: "very", marks: [{ type: "bold" }] },
        { type: "text", text: " good." },
      ],
    });
    expect(textAt(tree, "very")).toBe("very");
  });

  it("covers prose in a Heading", () => {
    const tree = doc({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "A very good title" }],
    });
    expect(textAt(tree, "very")).toBe("very");
  });

  it("covers prose in a list item", () => {
    const tree = doc({
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "This is very good." }] }],
        },
      ],
    });
    expect(textAt(tree, "very")).toBe("very");
  });

  it("covers prose in a block quote", () => {
    const tree = doc({
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: "This is very good." }] }],
    });
    expect(textAt(tree, "very")).toBe("very");
  });

  it("covers prose after a code block whose content ends with a newline", () => {
    const tree = doc(
      { type: "codeBlock", content: [{ type: "text", text: "line\n" }] },
      { type: "paragraph", content: [{ type: "text", text: "This is very good." }] },
    );
    expect(textAt(tree, "very")).toBe("very");
  });
});
