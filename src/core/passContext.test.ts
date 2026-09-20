import { describe, expect, it } from "vitest";
import { canonicalText } from "./canonicalText";
import type { BlockNode, DocTree } from "./docTree";
import { passContext } from "./passContext";

function doc(...content: BlockNode[]): DocTree {
  return { type: "doc", content };
}

function heading(level: number, text: string): BlockNode {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}

function paragraph(text: string): BlockNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

const FOUR_PARAGRAPHS = doc(
  heading(1, "Title"),
  paragraph("First paragraph."),
  paragraph("Target paragraph."),
  paragraph("Third paragraph."),
);

describe("passContext", () => {
  it("names the target Paragraph, its neighbours and the heading outline", () => {
    const target = passContext(FOUR_PARAGRAPHS, 2, "My Title");

    expect(target).not.toBeNull();
    expect(target?.title).toBe("My Title");
    expect(target?.text).toBe("Target paragraph.");
    expect(target?.contextAbove).toBe("First paragraph.");
    expect(target?.contextBelow).toBe("Third paragraph.");
    expect(target?.outline).toBe("# Title");
  });

  it("places the target interval in the one canonical string", () => {
    const target = passContext(FOUR_PARAGRAPHS, 2, "My Title");

    expect(target).not.toBeNull();
    expect(target?.canonical).toBe(canonicalText(FOUR_PARAGRAPHS));
    const { start, end } = target!.interval;
    expect(target!.canonical.slice(start, end)).toBe("Target paragraph.");
  });

  it("never puts body text in the outline", () => {
    const target = passContext(FOUR_PARAGRAPHS, 2, "My Title");

    expect(target?.outline).toBe("# Title");
    expect(target?.outline).not.toContain("First paragraph.");
  });

  it("falls back to the nearest Paragraph when the cursor is on a heading", () => {
    const target = passContext(FOUR_PARAGRAPHS, 0, "My Title");

    expect(target?.text).toBe("First paragraph.");
    expect(target?.contextAbove).toBe("");
    expect(target?.contextBelow).toBe("Target paragraph.");
  });

  it("returns null only when the Document has no Paragraph", () => {
    expect(passContext(doc(heading(1, "Only a title")), 0, "T")).toBeNull();
    expect(passContext({ type: "doc", content: [] }, 0, "T")).toBeNull();
  });
});
