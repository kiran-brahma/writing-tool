import { describe, expect, it } from "vitest";
import { FINDINGS_SCHEMA } from "./findingsSchema";
import { extractJson, parseFindings, UnsupportedOutputShapeError } from "./parseFindings";

describe("parseFindings", () => {
  it("parses a clean findings object", () => {
    const raw = JSON.stringify({
      findings: [
        { issue: "Cliché", diagnosis: "Worn smooth.", quote: "at the end of the day", offset: 4 },
      ],
    });

    const parsed = parseFindings(raw, "findings");

    expect(parsed.findings).toEqual([
      {
        issue: "Cliché",
        diagnosis: "Worn smooth.",
        quote: "at the end of the day",
        offset: 4,
      },
    ]);
  });

  it("extracts JSON from a fenced block with surrounding prose", () => {
    const raw = [
      "Sure! Here are the findings:",
      "```json",
      '{"findings":[{"issue":"Hype","diagnosis":"Too grand.","quote":"revolutionary","offset":0}]}',
      "```",
      "Let me know if you want more.",
    ].join("\n");

    const parsed = parseFindings(raw, "findings");

    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0].quote).toBe("revolutionary");
  });

  it("accepts a JSON array when a model skips the wrapper", () => {
    const raw = '[{"issue":"Hype","diagnosis":"Too grand.","quote":"revolutionary","offset":0}]';

    expect(parseFindings(raw, "findings").findings).toHaveLength(1);
  });

  it("skips an invalid entry rather than losing the whole response", () => {
    const raw = JSON.stringify({
      findings: [
        { issue: "Good", diagnosis: "Fine.", quote: "one", offset: 0 },
        { issue: "Missing quote", diagnosis: "Fine." },
        { diagnosis: "No issue.", quote: "two" },
        "not an object",
      ],
    });

    const parsed = parseFindings(raw, "findings");

    expect(parsed.findings.map((finding) => finding.quote)).toEqual(["one"]);
  });

  it("defaults a missing or non-numeric offset to zero, the offset being only a hint", () => {
    const raw = JSON.stringify({
      findings: [{ issue: "I", diagnosis: "D", quote: "q", offset: "later" }],
    });

    expect(parseFindings(raw, "findings").findings[0].offset).toBe(0);
  });

  it("lints the returned strings and surfaces violation text", () => {
    const raw = JSON.stringify({
      findings: [
        { issue: "Praise", diagnosis: "This is great writing.", quote: "one", offset: 0 },
      ],
    });

    const parsed = parseFindings(raw, "findings");

    expect(parsed.violations).toContainEqual({ kind: "praise", text: "great writing" });
  });

  it("raises for an output shape it does not implement yet", () => {
    expect(() => parseFindings("{}", "section-summary")).toThrow(UnsupportedOutputShapeError);
  });
});

describe("extractJson", () => {
  it("finds a balanced object after noise containing braces in strings", () => {
    const raw = 'The span "a { b" is fine. {"findings":[]} trailing';

    expect(extractJson(raw)).toEqual({ findings: [] });
  });

  it("fails loudly when there is no JSON at all", () => {
    expect(() => extractJson("no structure here")).toThrow(/no JSON/);
  });
});

describe("the findings schema", () => {
  it("has no field for rewritten prose", () => {
    expect(JSON.stringify(FINDINGS_SCHEMA).toLowerCase()).not.toContain("rewrite");
    expect(JSON.stringify(FINDINGS_SCHEMA).toLowerCase()).not.toContain("replacement");
  });

  it("exposes issue, diagnosis, pattern, quote and offset", () => {
    const serialized = JSON.stringify(FINDINGS_SCHEMA);
    for (const field of ["issue", "diagnosis", "pattern", "quote", "offset"]) {
      expect(serialized).toContain(`"${field}"`);
    }
  });
});
