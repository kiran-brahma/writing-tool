import { describe, expect, it } from "vitest";
import { canonicalText } from "./canonicalText";
import type { BlockNode, DocTree } from "./docTree";
import { sectionAt, sections } from "./sections";

function doc(...content: BlockNode[]): DocTree {
  return { type: "doc", content };
}

function paragraph(text: string): BlockNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function heading(level: number, text: string): BlockNode {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}

const TREE = doc(
  heading(1, "Title"),
  paragraph("Alpha."),
  heading(2, "Sub"),
  paragraph("Bravo."),
);

describe("sections", () => {
  it("derives a Section as its heading plus the body that follows it", () => {
    const canonical = canonicalText(TREE);
    const derived = sections(TREE);

    expect(derived).toHaveLength(2);
    expect(derived[0].heading).toBe("Title");
    expect(canonical.slice(derived[0].interval.start, derived[0].interval.end)).toBe(
      "# Title\n\nAlpha.",
    );
    expect(derived[1].heading).toBe("Sub");
    expect(canonical.slice(derived[1].interval.start, derived[1].interval.end)).toBe(
      "## Sub\n\nBravo.",
    );
  });

  it("finds the Section a block belongs to", () => {
    expect(sectionAt(TREE, 0)?.heading).toBe("Title");
    expect(sectionAt(TREE, 1)?.heading).toBe("Title");
    expect(sectionAt(TREE, 3)?.heading).toBe("Sub");
  });

  it("puts text before the first heading in no Section", () => {
    const withPreamble = doc(paragraph("Preamble."), heading(1, "Title"), paragraph("Alpha."));

    expect(sectionAt(withPreamble, 0)).toBeNull();
    expect(sectionAt(withPreamble, 1)?.heading).toBe("Title");
  });

  it("returns no Sections for a Document with no headings", () => {
    expect(sections(doc(paragraph("Just prose.")))).toEqual([]);
  });
});
