import { describe, expect, it } from "vitest";
import { FINDINGS_SCHEMA, FINDING_FIELDS } from "./findingsSchema";
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
        violations: [],
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

  it("does not quarantine a bare-array response's own candidate fields", () => {
    const raw =
      '[{"issue":"Hype","diagnosis":"Too grand.","quote":"revolutionary","offset":0}]';

    const parsed = parseFindings(raw, "findings");

    expect(parsed.findings[0].violations).toEqual([]);
    expect(parsed.violations).toEqual([]);
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

  it("attributes a violation to the Finding whose returned string carried it", () => {
    const raw = JSON.stringify({
      findings: [
        { issue: "This is great writing", diagnosis: "Neutral.", quote: "one", offset: 0 },
        { issue: "Neutral", diagnosis: "Also neutral.", quote: "two", offset: 0 },
      ],
    });

    const parsed = parseFindings(raw, "findings");

    expect(parsed.findings[0].violations).toContainEqual({
      kind: "praise",
      text: "great writing",
    });
    expect(parsed.findings[1].violations).toEqual([]);
  });

  it("scans a field other than the diagnosis, so a smuggled violation is still caught", () => {
    const raw = JSON.stringify({
      findings: [
        {
          issue: "Cliché",
          diagnosis: "Neutral.",
          pattern: "consider rewriting this",
          quote: "one",
          offset: 0,
        },
      ],
    });

    const parsed = parseFindings(raw, "findings");

    expect(parsed.findings[0].violations).toContainEqual({ kind: "rewrite", text: "consider rewriting" });
  });

  it("captures a smuggled rewrite field as a quarantined rewrite the Finding carries", () => {
    const prose = "The cat sat on the mat in the morning light.";
    const raw = JSON.stringify({
      findings: [{ issue: "I", diagnosis: "D", quote: "one", offset: 0, rewrite: prose }],
    });

    const parsed = parseFindings(raw, "findings");

    expect(parsed.findings[0].violations).toContainEqual({ kind: "rewrite", text: prose });
    expect(Object.keys(parsed.findings[0])).not.toContain("rewrite");
  });

  it("quarantines any string outside the findings schema, whatever its field name", () => {
    const prose = "A smoother sentence.";
    const raw = JSON.stringify({
      findings: [
        { issue: "I", diagnosis: "D", quote: "one", offset: 0, suggested_rewrite: prose },
      ],
    });

    expect(parseFindings(raw, "findings").findings[0].violations).toContainEqual({
      kind: "rewrite",
      text: prose,
    });
  });

  it("finds a smuggled rewrite nested in an object or an array", () => {
    const prose = "A whole new sentence.";
    const raw = JSON.stringify({
      findings: [
        {
          issue: "I",
          diagnosis: "D",
          quote: "one",
          offset: 0,
          extra: { suggested: prose },
          options: [prose],
        },
      ],
    });

    const parsed = parseFindings(raw, "findings");

    expect(parsed.findings[0].violations).toContainEqual({ kind: "rewrite", text: prose });
  });

  it("does not treat the Writer's quoted prose as a model Violation", () => {
    const raw = JSON.stringify({
      findings: [
        { issue: "Praise", diagnosis: "Clean diagnosis.", quote: "great writing", offset: 0 },
      ],
    });

    const parsed = parseFindings(raw, "findings");

    expect(parsed.findings[0].violations).toEqual([]);
    expect(parsed.violations).toEqual([]);
  });

  it("quarantines a rewrite smuggled beside the findings array", () => {
    const prose = "A whole new sentence.";
    const raw = JSON.stringify({
      findings: [{ issue: "I", diagnosis: "D", quote: "one", offset: 0 }],
      rewrite: prose,
    });

    expect(parseFindings(raw, "findings").violations).toContainEqual({
      kind: "rewrite",
      text: prose,
    });
  });

  it("quarantines a rewrite in a candidate too malformed to become a Finding", () => {
    const prose = "A whole new sentence.";
    const raw = JSON.stringify({
      findings: [{ issue: "I", diagnosis: "D", rewrite: prose }],
    });

    expect(parseFindings(raw, "findings").violations).toContainEqual({
      kind: "rewrite",
      text: prose,
    });
  });

  it.each([
    ["an array of strings where Findings belong", '{"findings":["A smoother sentence."]}'],
    ["a bare array of strings", '["A smoother sentence."]'],
    ["a findings value that is itself a string", '{"findings":"A smoother sentence."}'],
  ])("quarantines a string smuggled as %s", (_label, raw) => {
    expect(parseFindings(raw, "findings").violations).toContainEqual({
      kind: "rewrite",
      text: "A smoother sentence.",
    });
  });

  it("names praise in an out-of-schema field as praise, not only a rewrite", () => {
    const raw = JSON.stringify({
      findings: [
        { issue: "I", diagnosis: "D", quote: "one", offset: 0, comment: "This is great writing." },
      ],
    });

    const parsed = parseFindings(raw, "findings");

    expect(parsed.findings[0].violations).toContainEqual({
      kind: "praise",
      text: "great writing",
    });
    expect(parsed.findings[0].violations).toContainEqual({
      kind: "rewrite",
      text: "This is great writing.",
    });
  });

  it("does not manufacture a phrase across two adjacent fields", () => {
    const raw = JSON.stringify({
      findings: [{ issue: "great", diagnosis: "writing tips", quote: "one", offset: 0 }],
    });

    expect(parseFindings(raw, "findings").violations).toEqual([]);
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

  it("publishes exactly the fields the parser treats as known", () => {
    expect(FINDING_FIELDS).toEqual(["issue", "diagnosis", "pattern", "quote", "offset"]);
  });

  it("exposes issue, diagnosis, pattern, quote and offset", () => {
    const serialized = JSON.stringify(FINDINGS_SCHEMA);
    for (const field of ["issue", "diagnosis", "pattern", "quote", "offset"]) {
      expect(serialized).toContain(`"${field}"`);
    }
  });
});
