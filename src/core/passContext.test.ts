import { describe, expect, it } from "vitest";
import { canonicalText } from "./canonicalText";
import type { BlockNode, DocTree } from "./docTree";
import {
  documentContext,
  passContext,
  sectionContext,
  targetForPass,
} from "./passContext";
import type { Pass } from "./pass";

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

describe("documentContext", () => {
  it("hands a structural Pass the whole Document, not one Paragraph", () => {
    const target = documentContext(FOUR_PARAGRAPHS, "My Title");

    expect(target).not.toBeNull();
    expect(target?.title).toBe("My Title");
    expect(target?.text).toBe(
      "# Title\n\nFirst paragraph.\n\nTarget paragraph.\n\nThird paragraph.\n",
    );
    expect(target?.outline).toBe("# Title");
  });

  it("names the whole canonical string as the target interval", () => {
    const canonical = canonicalText(FOUR_PARAGRAPHS);
    const target = documentContext(FOUR_PARAGRAPHS, "My Title");

    expect(target?.interval).toEqual({ start: 0, end: canonical.length });
  });

  it("gives no local context, because the whole Document is the target", () => {
    const target = documentContext(FOUR_PARAGRAPHS, "My Title");

    expect(target?.contextAbove).toBe("");
    expect(target?.contextBelow).toBe("");
  });

  it("returns null only when the Document has no text at all", () => {
    expect(documentContext(doc(heading(1, "Only a title")), "T")?.text).toBe("# Only a title\n");
    expect(documentContext({ type: "doc", content: [] }, "T")).toBeNull();
  });

  it("fills the document placeholder and a local target leaves it empty", () => {
    expect(documentContext(FOUR_PARAGRAPHS, "T")?.documentText).toBe(
      "# Title\n\nFirst paragraph.\n\nTarget paragraph.\n\nThird paragraph.\n",
    );
    expect(passContext(FOUR_PARAGRAPHS, 2, "T")?.documentText).toBe("");
  });
});

/** A Pass of a given scope, with just enough shape for the resolver. */
function pass(scope: Pass["scope"]): Pass {
  return {
    id: "p",
    name: "p",
    description: "p",
    kind: "model",
    scope,
    output: "findings",
    slot: "critic",
    enabled: true,
  };
}

describe("sectionContext", () => {
  it("bounds a section Pass to its heading plus the body that follows it", () => {
    const canonical = canonicalText(FOUR_PARAGRAPHS);
    const target = sectionContext(FOUR_PARAGRAPHS, 2, "My Title");

    expect(target).not.toBeNull();
    const { start, end } = target!.interval;
    expect(canonical.slice(start, end)).toBe(
      "# Title\n\nFirst paragraph.\n\nTarget paragraph.\n\nThird paragraph.",
    );
    expect(target?.documentText).toBe("");
  });

  it("returns null for a block before the first heading", () => {
    const withPreamble = doc(paragraph("Preamble."), heading(1, "Title"), paragraph("Alpha."));

    expect(sectionContext(withPreamble, 0, "T")).toBeNull();
    expect(sectionContext(withPreamble, 1, "T")).not.toBeNull();
  });
});

describe("targetForPass", () => {
  it("builds the Target the Pass's scope permits", () => {
    expect(targetForPass(pass("paragraph"), FOUR_PARAGRAPHS, 2, "T")?.text).toBe(
      "Target paragraph.",
    );
    const sectionTarget = targetForPass(pass("section"), FOUR_PARAGRAPHS, 2, "T");
    expect(sectionTarget?.text).toBe(
      "# Title\n\nFirst paragraph.\n\nTarget paragraph.\n\nThird paragraph.",
    );
    expect(targetForPass(pass("document"), FOUR_PARAGRAPHS, 2, "T")?.text).toBe(
      canonicalText(FOUR_PARAGRAPHS),
    );
  });
});
