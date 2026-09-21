import { describe, expect, it } from "vitest";
import { CONNECTION_PREFILLS, connectionFromPrefill, type Connection } from "../wire/connection";
import { createFixtureTransport, type FixtureTransport } from "../wire/fixtureTransport";
import type { RunConfig } from "./critique";
import type { BlockNode, DocTree } from "./docTree";
import type { Pass } from "./pass";
import { sectionContext } from "./passContext";
import { UnsupportedOutputShapeError } from "./parseFindings";
import { parseReaderAccount, READER_SCHEMA, readSection } from "./reader";

function doc(...content: BlockNode[]): DocTree {
  return { type: "doc", content };
}

function heading(level: number, text: string): BlockNode {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}

function paragraph(text: string): BlockNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

const TREE = doc(
  heading(1, "Title"),
  paragraph("Alpha body."),
  heading(2, "Sub"),
  paragraph("Bravo body."),
);

/** The first Section's heading block. */
const SECTION_BLOCK = 0;

function target() {
  const built = sectionContext(TREE, SECTION_BLOCK, "My Title");
  if (built === null) throw new Error("fixture has no section");
  return built;
}

function connection(): Connection {
  const prefill = CONNECTION_PREFILLS.find((entry) => entry.id === "openai");
  if (prefill === undefined) throw new Error("no openai prefill");
  return { ...connectionFromPrefill(prefill), model: "gpt-test", apiKey: "secret" };
}

const READER_PASS: Pass = {
  id: "reader",
  name: "Reader pass",
  description: "Reconstructs what a Section communicates.",
  kind: "model",
  scope: "section",
  output: "section-summary",
  slot: "critic",
  enabled: true,
  prompt: [
    "Read one section.",
    "Title: {{title}}",
    "Outline: {{outline}}",
    "Analyze only the section: {{target}}",
    "Do not praise the writing and do not suggest replacement prose.",
  ].join("\n"),
};

const RESPONSE = JSON.stringify({
  what_this_section_says: "It introduces the argument.",
  what_a_distracted_reader_would_miss: "The turn near the end.",
  gap_between_intent_and_effect: "The claim arrives before its reason.",
});

function fixture(respond: string, screeningFrame = true): { transport: FixtureTransport; config: RunConfig } {
  const transport = createFixtureTransport({ respond: () => respond });
  return {
    transport,
    config: { transport, screeningFrame, revisionId: "rev-1", now: 1_000 },
  };
}

function userMessage(body: unknown): string {
  const messages = (body as { messages: { role: string; content: string }[] }).messages;
  const user = messages.find((message) => message.role === "user");
  if (user === undefined) throw new Error("no user message");
  return user.content;
}

function systemMessage(body: unknown): string | undefined {
  const messages = (body as { messages: { role: string; content: string }[] }).messages;
  return messages.find((message) => message.role === "system")?.content;
}

describe("readSection", () => {
  it("runs one section-scope Reader pass end to end through the seam", async () => {
    const { transport, config } = fixture(RESPONSE);

    const run = await readSection(target(), READER_PASS, connection(), config);

    expect(transport.requests).toHaveLength(1);
    expect(run.account).toMatchObject({
      whatItSays: "It introduces the argument.",
      whatIsMissed: "The turn near the end.",
      gap: "The claim arrives before its reason.",
      provenance: { providerId: "openai", model: "gpt-test", at: 1_000, revisionId: "rev-1" },
    });
    expect(run.rawResponse).toBe(RESPONSE);
  });

  it("sends the Section and its heading outline, never a neighbouring Section", async () => {
    const { transport, config } = fixture(RESPONSE);

    await readSection(target(), READER_PASS, connection(), config);

    const prompt = userMessage(transport.requests[0].body);
    expect(prompt).toContain("# Title\n\nAlpha body.");
    expect(prompt).toContain("# Title\n## Sub");
    expect(prompt).not.toContain("Bravo body.");
  });

  it("flags praise in the account's fields without dropping the account", async () => {
    const praise = JSON.stringify({
      what_this_section_says: "This is great writing.",
      what_a_distracted_reader_would_miss: "Nothing.",
      gap_between_intent_and_effect: "None.",
    });

    const run = await readSection(target(), READER_PASS, connection(), fixture(praise).config);

    expect(run.violations).toContainEqual({ kind: "praise", text: "great writing" });
    expect(run.account.violations).toContainEqual({ kind: "praise", text: "great writing" });
    expect(run.account.whatItSays).toBe("This is great writing.");
  });

  it("quarantines an out-of-schema rewrite rather than keeping it on the account", async () => {
    const smuggled = JSON.stringify({
      ...JSON.parse(RESPONSE),
      rewrite: "A much cleaner sentence.",
    });

    const run = await readSection(target(), READER_PASS, connection(), fixture(smuggled).config);

    expect(run.account).not.toHaveProperty("rewrite");
    expect(run.violations).toContainEqual({ kind: "rewrite", text: "A much cleaner sentence." });
  });

  it("refuses a Pass whose output shape is not a Reader account before spending a request", async () => {
    const { transport, config } = fixture(RESPONSE);
    const findingsPass: Pass = { ...READER_PASS, output: "findings" };

    await expect(readSection(target(), findingsPass, connection(), config)).rejects.toBeInstanceOf(
      UnsupportedOutputShapeError,
    );
    expect(transport.requests).toHaveLength(0);
  });

  it("refuses a rule Pass", async () => {
    const { config } = fixture(RESPONSE);
    const rulePass: Pass = { ...READER_PASS, kind: "rule" };

    await expect(readSection(target(), rulePass, connection(), config)).rejects.toThrow(/rule Pass/);
  });

  it("never applies a Screening frame, even when the toggle is on (story 154)", async () => {
    const on = fixture(RESPONSE, true);
    await readSection(target(), READER_PASS, connection(), on.config);
    expect(systemMessage(on.transport.requests[0].body)).toBeUndefined();

    // Even a smuggled frame on a Reader Pass never reaches the request: the
    // Reader's own method defines its stance (story 154).
    const framed: Pass = { ...READER_PASS, frame: "skimmer" };
    const smuggled = fixture(RESPONSE, true);
    await readSection(target(), framed, connection(), smuggled.config);
    expect(systemMessage(smuggled.transport.requests[0].body)).toBeUndefined();
  });
});

describe("parseReaderAccount", () => {
  it("reads the three account fields from surrounding prose", () => {
    const parsed = parseReaderAccount(`Here it is:\n\n${RESPONSE}\n\nHope that helps.`);

    expect(parsed.account).toEqual({
      whatItSays: "It introduces the argument.",
      whatIsMissed: "The turn near the end.",
      gap: "The claim arrives before its reason.",
    });
    expect(parsed.violations).toEqual([]);
  });

  it("fails loudly when the response carries no account", () => {
    expect(() => parseReaderAccount("no structure here")).toThrow(/no JSON/);
    expect(() => parseReaderAccount("{}")).toThrow(/Reader account/);
    expect(() => parseReaderAccount('{"what_this_section_says":"Only one field."}')).toThrow(
      /Reader account/,
    );
  });

  it("names praise in an out-of-schema field and quarantines it", () => {
    const raw = JSON.stringify({
      ...JSON.parse(RESPONSE),
      extra: "This is great writing.",
    });

    const parsed = parseReaderAccount(raw);

    expect(parsed.violations).toContainEqual({ kind: "praise", text: "great writing" });
    expect(parsed.violations).toContainEqual({ kind: "rewrite", text: "This is great writing." });
  });

  it("lints the prose around the JSON, not only the account's fields", () => {
    const parsed = parseReaderAccount(`This is great writing, honestly.\n${RESPONSE}`);

    expect(parsed.account.whatItSays).toBe("It introduces the argument.");
    expect(parsed.violations).toContainEqual({ kind: "praise", text: "great writing" });
  });

  it("does not manufacture a phrase across two adjacent fields", () => {
    const raw = JSON.stringify({
      what_this_section_says: "great",
      what_a_distracted_reader_would_miss: "writing",
      gap_between_intent_and_effect: "None.",
    });

    expect(parseReaderAccount(raw).violations).toEqual([]);
  });
});

describe("the reader schema", () => {
  it("carries the three account fields and closes itself to rewritten prose", () => {
    const schema = READER_SCHEMA as {
      additionalProperties?: unknown;
      properties?: Record<string, unknown>;
      required?: unknown;
    };

    expect(Object.keys(schema.properties ?? {})).toEqual([
      "what_this_section_says",
      "what_a_distracted_reader_would_miss",
      "gap_between_intent_and_effect",
    ]);
    expect(schema.required).toEqual([
      "what_this_section_says",
      "what_a_distracted_reader_would_miss",
      "gap_between_intent_and_effect",
    ]);
    // The closed object is the constitutional guarantee; without it a model
    // could add a rewrite field that survives parsing.
    expect(schema.additionalProperties).toBe(false);
    expect(JSON.stringify(schema).toLowerCase()).not.toContain("rewrite");
    expect(JSON.stringify(schema).toLowerCase()).not.toContain("replacement");
  });
});
