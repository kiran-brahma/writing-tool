import { describe, expect, it } from "vitest";
import type { Target } from "./target";
import {
  fillPrompt,
  findUnknownPlaceholders,
  PROMPT_PLACEHOLDERS,
  promptCharacters,
  promptValues,
} from "./prompt";

describe("findUnknownPlaceholders", () => {
  it("returns nothing when every placeholder is one Obelus can fill", () => {
    const template = PROMPT_PLACEHOLDERS.map((name) => `{{${name}}}`).join(" ");
    expect(findUnknownPlaceholders(template)).toEqual([]);
  });

  it("finds an unknown placeholder, in first-seen order and deduplicated", () => {
    const template = "{{title}} {{context}} {{target}} {{context}} {{TITLE}}";

    expect(findUnknownPlaceholders(template)).toEqual(["context", "TITLE"]);
  });

  it("accepts a known placeholder written with surrounding spaces", () => {
    expect(findUnknownPlaceholders("{{ title }} {{ context_above }}")).toEqual([]);
  });

  it("treats the empty placeholder as unknown rather than ignoring it", () => {
    expect(findUnknownPlaceholders("{{}}")).toEqual([""]);
  });

  it("ignores single braces and prose that merely mentions a name", () => {
    expect(findUnknownPlaceholders("{title} title document")).toEqual([]);
  });
});

describe("fillPrompt", () => {
  it("fills the known placeholders and leaves unknown text verbatim", () => {
    const filled = fillPrompt("Title: {{title}}\nTarget: {{target}}\n{{typo}}", {
      title: "A Title",
      target: "Some text",
    });

    expect(filled).toBe("Title: A Title\nTarget: Some text\n{{typo}}");
  });
});

/** A local Target: one Paragraph with one Paragraph of context either side. */
function paragraphTarget(overrides: Partial<Target> = {}): Target {
  // A long tail stands in for the rest of the Document, so a local Pass is
  // unmistakably far smaller than the whole thing.
  const tail = Array.from({ length: 40 }, () => "Filler paragraph.").join("\n\n");
  const canonical = `Above paragraph.\n\nThe target paragraph.\n\nBelow paragraph.\n\n${tail}\n`;
  return {
    canonical,
    interval: { start: 18, end: 39 },
    text: "The target paragraph.",
    title: "A Title",
    outline: "",
    contextAbove: "Above paragraph.",
    contextBelow: "Below paragraph.",
    documentText: "",
    ...overrides,
  };
}

describe("promptCharacters", () => {
  it("prices a local Pass by its filled prompt, not the whole Document", () => {
    const target = paragraphTarget();
    const template = "Above:{{context_above}}\nTarget:{{target}}\nBelow:{{context_below}}";

    expect(promptCharacters(template, target)).toBe(
      fillPrompt(template, promptValues(target)).length,
    );
    // The same Pass without context is smaller, and both are far below the
    // whole Document, which is the bug M1 fixes.
    expect(promptCharacters("Target:{{target}}", target)).toBeLessThan(
      promptCharacters(template, target),
    );
    expect(promptCharacters(template, target)).toBeLessThan(target.canonical.length);
  });

  it("prices a structural Pass by the whole Document it sends", () => {
    const target = paragraphTarget();
    const structural = paragraphTarget({
      interval: { start: 0, end: target.canonical.length },
      text: target.canonical,
      documentText: target.canonical,
      contextAbove: "",
      contextBelow: "",
    });

    expect(promptCharacters("{{document}}", structural)).toBe(target.canonical.length);
  });
});
