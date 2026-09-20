import { describe, expect, it } from "vitest";
import { fillPrompt, findUnknownPlaceholders, PROMPT_PLACEHOLDERS } from "./prompt";

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
