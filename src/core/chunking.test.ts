import { describe, expect, it } from "vitest";
import { canonicalText } from "./canonicalText";
import { CHUNK_OVERLAP, chunkTarget } from "./chunking";
import type { BlockNode, DocTree } from "./docTree";
import { documentContext } from "./passContext";
import type { Target } from "./target";

function doc(...content: BlockNode[]): DocTree {
  return { type: "doc", content };
}

function heading(text: string): BlockNode {
  return { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text }] };
}

function paragraph(text: string): BlockNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

/**
 * Three Sections of ~100 characters each, every block comfortably under the
 * 250-character limit the tests use, so an over-limit chunk can only ever be a
 * whole block rather than a bug in the packing.
 */
const THREE_SECTIONS = doc(
  heading("One"),
  paragraph("alpha ".repeat(15).trim()),
  heading("Two"),
  paragraph("bravo ".repeat(15).trim()),
  heading("Three"),
  paragraph("charlie ".repeat(15).trim()),
);

const NO_HEADINGS = doc(
  paragraph("alpha ".repeat(15).trim()),
  paragraph("bravo ".repeat(15).trim()),
  paragraph("charlie ".repeat(15).trim()),
);

function targetFor(tree: DocTree): Target {
  const target = documentContext(tree, "My Title");
  if (target === null) throw new Error("fixture has no document text");
  return target;
}

describe("chunkTarget", () => {
  it("returns the Target unchanged when it fits under the limit", () => {
    const target = targetFor(THREE_SECTIONS);

    const chunks = chunkTarget(target, canonicalText(THREE_SECTIONS).length + 1);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(target);
  });

  it("chunks a Document past the limit rather than refusing or truncating it", () => {
    const target = targetFor(THREE_SECTIONS);
    const canonical = canonicalText(THREE_SECTIONS);

    const chunks = chunkTarget(target, 250, 0);

    expect(chunks.length).toBeGreaterThan(1);
    // The whole Document is covered: nothing is dropped off the end.
    expect(chunks[0].interval.start).toBe(0);
    expect(chunks[chunks.length - 1].interval.end).toBe(canonical.length);
  });

  it("keeps every chunk under the limit", () => {
    const target = targetFor(THREE_SECTIONS);

    const chunks = chunkTarget(target, 250, 30);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(250);
    }
  });

  it("keeps every chunk's text a non-empty slice of the one canonical string", () => {
    const target = targetFor(THREE_SECTIONS);
    const canonical = canonicalText(THREE_SECTIONS);

    for (const chunk of chunkTarget(target, 250, 0)) {
      const { start, end } = chunk.interval;
      expect(chunk.text.length).toBe(end - start);
      expect(chunk.text.length).toBeGreaterThan(0);
      // Coordinates stay global: the canonical string is never re-based.
      expect(chunk.canonical).toBe(canonical);
    }
  });

  it("splits Section by Section when the Document has headings", () => {
    const target = targetFor(THREE_SECTIONS);

    // No overlap, so every boundary falls exactly on a Section's heading.
    const chunks = chunkTarget(target, 250, 0);

    for (const chunk of chunks) {
      expect(chunk.text.startsWith("# ")).toBe(true);
    }
  });

  it("repeats a whole preceding block at every boundary", () => {
    const target = targetFor(THREE_SECTIONS);

    const chunks = chunkTarget(target, 250, 30);

    expect(chunks.length).toBeGreaterThan(1);
    for (let index = 1; index < chunks.length; index++) {
      // The fixture's Paragraphs exceed the 30-char budget, so a character-only
      // overlap would leave a gap here; whole blocks do not.
      expect(chunks[index].interval.start).toBeLessThan(chunks[index - 1].interval.end);
    }
  });

  it("does not overlap when the overlap is zero", () => {
    const target = targetFor(THREE_SECTIONS);

    const chunks = chunkTarget(target, 250, 0);

    for (let index = 1; index < chunks.length; index++) {
      expect(chunks[index].interval.start).toBeGreaterThanOrEqual(chunks[index - 1].interval.end);
    }
  });

  it("falls back to Paragraph boundaries when the Document has no headings", () => {
    const target = targetFor(NO_HEADINGS);

    const chunks = chunkTarget(target, 250, 0);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[chunks.length - 1].interval.end).toBe(canonicalText(NO_HEADINGS).length);
    // No heading exists, so the first block of the first chunk is prose.
    expect(chunks[0].text).toContain("alpha");
  });

  it("splits a single Section longer than the limit at its Paragraphs", () => {
    const longSection = doc(
      heading("Only"),
      paragraph("alpha ".repeat(15).trim()),
      paragraph("bravo ".repeat(15).trim()),
      paragraph("charlie ".repeat(15).trim()),
    );
    const target = targetFor(longSection);

    const chunks = chunkTarget(target, 150, 0);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[chunks.length - 1].interval.end).toBe(canonicalText(longSection).length);
  });

  it("does not re-chunk a Target that is already one chunk", () => {
    const target = targetFor(THREE_SECTIONS);

    const [first] = chunkTarget(target, 250, 0);
    expect(first).toBeDefined();

    expect(chunkTarget(first, 10)).toEqual([first]);
  });

  it("falls back to the default overlap when none is given", () => {
    const chunks = chunkTarget(targetFor(THREE_SECTIONS), 250);

    expect(CHUNK_OVERLAP).toBeGreaterThan(0);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1].interval.start).toBeLessThan(chunks[0].interval.end);
  });
});
