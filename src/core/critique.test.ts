import { describe, expect, it } from "vitest";
import { CONNECTION_PREFILLS, connectionFromPrefill, type Connection } from "../wire/connection";
import { createFixtureTransport, type FixtureTransport } from "../wire/fixtureTransport";
import { critique, type RunConfig, type Target } from "./critique";
import type { BlockNode, DocTree } from "./docTree";
import { hashPass, isFindingsPass, type Pass } from "./pass";
import { passContext, documentContext } from "./passContext";
import { UnsupportedOutputShapeError } from "./parseFindings";
import { SCREENING_FRAME } from "./screeningFrame";
import { CLICHE_PASS, STARTER_PASSES, TOPIC_STRINGS_PASS } from "./starterPasses";

function doc(...content: BlockNode[]): DocTree {
  return { type: "doc", content };
}

function paragraph(text: string): BlockNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

const TREE = doc(
  { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
  paragraph("Alpha paragraph one."),
  paragraph("Bravo target paragraph."),
  paragraph("Charlie paragraph three."),
  paragraph("Delta paragraph four."),
  paragraph("Echo paragraph five."),
);

/** The index of the Target Paragraph in `TREE`. */
const TARGET_BLOCK = 2;

function target(): Target {
  const built = passContext(TREE, TARGET_BLOCK, "My Title");
  if (built === null) throw new Error("fixture has no paragraph");
  return built;
}

function connection(): Connection {
  const prefill = CONNECTION_PREFILLS.find((entry) => entry.id === "openai");
  if (prefill === undefined) throw new Error("no openai prefill");
  return { ...connectionFromPrefill(prefill), model: "gpt-test", apiKey: "secret" };
}

const RESPONSE = JSON.stringify({
  findings: [
    { issue: "Found in target", diagnosis: "D", quote: "Bravo", offset: 0 },
    { issue: "Found in context", diagnosis: "D", quote: "Alpha", offset: 0 },
    { issue: "Found nowhere", diagnosis: "D", quote: "Nope", offset: 0 },
  ],
});

/** A fixture-backed Run that replies with one fixed response. */
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

describe("critique", () => {
  it("runs one paragraph-scope model Pass end to end through the seam", async () => {
    const { transport, config } = fixture(RESPONSE);

    const run = await critique(target(), CLICHE_PASS, connection(), config);

    expect(transport.requests).toHaveLength(1);
    expect(run.findings).toHaveLength(1);
    expect(run.findings[0]).toMatchObject({
      passId: "cliche",
      issue: "Found in target",
      anchor: { quote: "Bravo", state: "attached" },
      status: "open",
      provenance: { providerId: "openai", model: "gpt-test", at: 1_000, revisionId: "rev-1" },
    });
  });

  it("records the promptHash the Pass derives when it runs", async () => {
    const run = await critique(target(), CLICHE_PASS, connection(), fixture(RESPONSE).config);

    expect(run.findings[0].promptHash).toBe(hashPass(CLICHE_PASS));

    const edited: Pass = { ...CLICHE_PASS, prompt: `${CLICHE_PASS.prompt}\nExtra.` };
    const second = await critique(target(), edited, connection(), fixture(RESPONSE).config);
    expect(second.findings[0].promptHash).not.toBe(run.findings[0].promptHash);
  });

  it("derives the promptHash from the prompt, the output shape and the scope", () => {
    const base = hashPass(CLICHE_PASS);

    expect(hashPass({ ...CLICHE_PASS, prompt: "a different prompt" })).not.toBe(base);
    expect(hashPass({ ...CLICHE_PASS, scope: "document" })).not.toBe(base);
    expect(hashPass({ ...CLICHE_PASS, output: "audit" })).not.toBe(base);
  });

  it("drops and reports Anchors outside the Target (Containment)", async () => {
    const run = await critique(target(), CLICHE_PASS, connection(), fixture(RESPONSE).config);

    expect(run.droppedAnchors).toBe(2);
  });

  it("sends the Target, one Paragraph either side and the heading outline", async () => {
    const { transport, config } = fixture(RESPONSE);
    await critique(target(), CLICHE_PASS, connection(), config);

    const prompt = userMessage(transport.requests[0].body);
    expect(prompt).toContain("Bravo target paragraph.");
    expect(prompt).toContain("Alpha paragraph one.");
    expect(prompt).toContain("Charlie paragraph three.");
    expect(prompt).toContain("# Title");
  });

  it("never sends body text beyond the context window a local Pass is allowed", async () => {
    const { transport, config } = fixture(RESPONSE);
    await critique(target(), CLICHE_PASS, connection(), config);

    const prompt = userMessage(transport.requests[0].body);
    expect(prompt).not.toContain("Delta paragraph four.");
    expect(prompt).not.toContain("Echo paragraph five.");
  });

  it("sends the findings schema and no field for rewritten prose", async () => {
    const { transport, config } = fixture(RESPONSE);
    await critique(target(), CLICHE_PASS, connection(), config);

    const schema = (transport.requests[0].body as { response_format?: unknown }).response_format;
    expect(schema).toBeDefined();
    const serialized = JSON.stringify(schema).toLowerCase();
    expect(serialized).toContain("diagnosis");
    expect(serialized).not.toContain("rewrite");
  });

  it("drops a rewrite field a model smuggles into a Finding", async () => {
    const smuggled = JSON.stringify({
      findings: [
        {
          issue: "I",
          diagnosis: "D",
          quote: "Bravo",
          offset: 0,
          rewrite: "A much better sentence.",
        },
      ],
    });

    const run = await critique(target(), CLICHE_PASS, connection(), fixture(smuggled).config);

    expect(run.findings).toHaveLength(1);
    expect(Object.keys(run.findings[0])).not.toContain("rewrite");
  });

  it("applies the Screening frame to a critic Pass when it is on", async () => {
    const { transport, config } = fixture(RESPONSE, true);
    await critique(target(), CLICHE_PASS, connection(), config);

    const messages = (transport.requests[0].body as { messages: { role: string; content: string }[] })
      .messages;
    expect(messages[0]).toEqual({ role: "system", content: SCREENING_FRAME });
  });

  it("omits the Screening frame when the toggle is off", async () => {
    const { transport, config } = fixture(RESPONSE, false);
    await critique(target(), CLICHE_PASS, connection(), config);

    const messages = (transport.requests[0].body as { messages: { role: string; content: string }[] })
      .messages;
    expect(messages.some((message) => message.role === "system")).toBe(false);
  });

  it("surfaces violations the response carried instead of hiding them", async () => {
    const praise = JSON.stringify({
      findings: [{ issue: "P", diagnosis: "This is great writing.", quote: "Bravo", offset: 0 }],
    });

    const run = await critique(target(), CLICHE_PASS, connection(), fixture(praise).config);

    expect(run.violations).toContainEqual({ kind: "praise", text: "great writing" });
  });

  it("marks the Finding whose own diagnosis was the violation", async () => {
    const praise = JSON.stringify({
      findings: [
        { issue: "Clean", diagnosis: "Neutral.", quote: "Bravo", offset: 0 },
        { issue: "Polluted", diagnosis: "This is great writing.", quote: "target", offset: 6 },
      ],
    });

    const run = await critique(target(), CLICHE_PASS, connection(), fixture(praise).config);

    const clean = run.findings.find((finding) => finding.issue === "Clean");
    const polluted = run.findings.find((finding) => finding.issue === "Polluted");
    expect(clean?.violations).toBeUndefined();
    expect(polluted?.violations).toContainEqual({ kind: "praise", text: "great writing" });
  });

  it("leaves the document placeholder empty for a paragraph-scope Pass", async () => {
    const { transport, config } = fixture(RESPONSE);
    const pass: Pass = {
      ...CLICHE_PASS,
      prompt: "DOCCONTENT[{{document}}] TARGET[{{target}}]",
    };

    await critique(target(), pass, connection(), config);

    expect(userMessage(transport.requests[0].body)).toBe(
      "DOCCONTENT[] TARGET[Bravo target paragraph.]",
    );
  });

  it("refuses an output shape it does not implement before spending a request", async () => {
    const { transport, config } = fixture(RESPONSE);
    const pass: Pass = { ...CLICHE_PASS, output: "section-summary" };

    await expect(critique(target(), pass, connection(), config)).rejects.toBeInstanceOf(
      UnsupportedOutputShapeError,
    );
    expect(transport.requests).toHaveLength(0);
  });

  it("returns the raw response unchanged for the raw-response toggle", async () => {
    const run = await critique(target(), CLICHE_PASS, connection(), fixture(RESPONSE).config);

    expect(run.rawResponse).toBe(RESPONSE);
    expect(run.fromCache).toBe(false);
  });

  it("carries the Provider's token usage on the RunResult (story 52)", async () => {
    const transport = createFixtureTransport({
      respond: () => RESPONSE,
      usage: { inputTokens: 100, outputTokens: 20 },
    });

    const run = await critique(target(), CLICHE_PASS, connection(), {
      transport,
      screeningFrame: true,
      revisionId: "rev-1",
    });

    expect(run.usage).toEqual({ inputTokens: 100, outputTokens: 20 });
  });

  it("leaves usage undefined when the Provider reported none", async () => {
    const run = await critique(target(), CLICHE_PASS, connection(), fixture(RESPONSE).config);
    expect(run.usage).toBeUndefined();
  });
});

/**
 * Story 36, and #19's acceptance: every paragraph-scope Starter model Pass runs
 * through the one seam and reports Findings anchored in the Target. A shared
 * path is not the same as a working pass, so each is exercised by name. The
 * document-scope passes are exercised against a document target below.
 */
const STARTER_MODEL_PASSES = STARTER_PASSES.filter(
  (pass) => pass.kind === "model" && pass.scope === "paragraph",
);

describe("critique over the Starter model pack", () => {
  it.each(STARTER_MODEL_PASSES)("runs the $name Pass and reports its Findings", async (pass) => {
    const { transport, config } = fixture(RESPONSE);

    const run = await critique(target(), pass, connection(), config);

    expect(transport.requests).toHaveLength(1);
    expect(run.findings).toHaveLength(1);
    expect(run.findings[0]).toMatchObject({
      passId: pass.id,
      issue: "Found in target",
      anchor: { quote: "Bravo", state: "attached" },
    });
  });
});

/**
 * Story 48, and #7's acceptance: a structural Pass receives the whole Document,
 * so its advice about Paragraph order comes from something that can see the
 * order. Running one against a document Target proves both halves — the whole
 * text is sent, and a Finding anchored anywhere in it is kept rather than
 * dropped by the local Containment rule.
 */
const DOCUMENT_RESPONSE = JSON.stringify({
  findings: [
    { issue: "Cohesion drops", diagnosis: "The topic string does not carry forward.", quote: "Alpha", offset: 0 },
    { issue: "Weight lands early", diagnosis: "The stress position is buried.", quote: "Echo", offset: 0 },
  ],
});

describe("critique over a document-scope Pass", () => {
  const STARTER_DOCUMENT_PASSES = STARTER_PASSES.filter(
    (pass) => pass.kind === "model" && pass.scope === "document" && isFindingsPass(pass),
  );

  function wholeDocument(): Target {
    const built = documentContext(TREE, "My Title");
    if (built === null) throw new Error("fixture has no document text");
    return built;
  }

  it.each(STARTER_DOCUMENT_PASSES)(
    "sends the whole Document through the $name Pass's {{document}} placeholder",
    async (pass) => {
      const { transport, config } = fixture(DOCUMENT_RESPONSE);

      await critique(wholeDocument(), pass, connection(), config);

      const prompt = userMessage(transport.requests[0].body);
      expect(prompt).toContain("Alpha paragraph one.");
      expect(prompt).toContain("Delta paragraph four.");
      expect(prompt).toContain("Echo paragraph five.");
    },
  );

  it.each(STARTER_DOCUMENT_PASSES)(
    "keeps a Finding anchored anywhere in the Document for the $name Pass",
    async (pass) => {
      const { config } = fixture(DOCUMENT_RESPONSE);

      const run = await critique(wholeDocument(), pass, connection(), config);

      expect(run.findings.map((finding) => finding.issue)).toEqual([
        "Cohesion drops",
        "Weight lands early",
      ]);
      expect(run.droppedAnchors).toBe(0);
    },
  );
});

/**
 * Story 50: a Document past the character limit is chunked Section by Section
 * with overlap rather than refused or silently truncated. The Run still goes
 * through `critique`, so the fixture transport records each call and the merged
 * Findings are asserted as one result.
 */
describe("critique over a Document past the character limit", () => {
  const LONG_TREE = doc(
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "One" }] },
    paragraph("Alpha alpha alpha alpha alpha alpha."),
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Two" }] },
    paragraph("Bravo bravo bravo bravo bravo bravo."),
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Three" }] },
    paragraph("Charlie charlie charlie charlie charlie."),
  );
  const LONG_PASS: Pass = { ...TOPIC_STRINGS_PASS, prompt: "DOC[{{document}}]" };

  function longDocument(): Target {
    const built = documentContext(LONG_TREE, "My Title");
    if (built === null) throw new Error("fixture has no document text");
    return built;
  }

  /** Answers each chunk with one Finding quoting that chunk's own last line. */
  function chunkResponder(): FixtureTransport {
    return createFixtureTransport({
      respond: (request) => {
        const prompt = request.messages[0].content;
        const chunk = prompt.slice(prompt.indexOf("DOC[") + 4, prompt.lastIndexOf("]"));
        const line = chunk.split("\n").filter((entry) => entry.trim() !== "").pop() ?? chunk;
        return JSON.stringify({
          findings: [
            { issue: "Problem", diagnosis: "D", quote: line, offset: chunk.indexOf(line) },
          ],
        });
      },
    });
  }

  it("sends several calls and reports how many chunks the Run made", async () => {
    const transport = chunkResponder();
    const config: RunConfig = {
      transport,
      screeningFrame: true,
      revisionId: "rev-1",
      now: 1_000,
      characterLimit: 40,
    };

    const run = await critique(longDocument(), LONG_PASS, connection(), config);

    expect(run.chunks).toBeGreaterThan(1);
    expect(transport.requests).toHaveLength(run.chunks);
  });

  it("still makes one call when the Document fits under the limit", async () => {
    const transport = chunkResponder();
    const config: RunConfig = {
      transport,
      screeningFrame: true,
      revisionId: "rev-1",
      now: 1_000,
      characterLimit: 10_000,
    };

    const run = await critique(longDocument(), LONG_PASS, connection(), config);

    expect(run.chunks).toBe(1);
    expect(transport.requests).toHaveLength(1);
  });

  it("merges the chunks' Findings into one Run, anchored in the whole Document", async () => {
    const transport = chunkResponder();
    const config: RunConfig = {
      transport,
      screeningFrame: true,
      revisionId: "rev-1",
      now: 1_000,
      characterLimit: 40,
    };

    const run = await critique(longDocument(), LONG_PASS, connection(), config);
    const canonical = longDocument().canonical;

    expect(run.findings.length).toBeGreaterThan(1);
    for (const finding of run.findings) {
      expect(canonical).toContain(finding.anchor.quote);
      expect(finding.anchor.offset).toBeGreaterThanOrEqual(0);
    }
    // Every chunk that produced a boundary Finding is visible exactly once.
    const keys = run.findings.map((finding) => `${finding.anchor.quote}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("shows every chunk's raw response under one Pass", async () => {
    const transport = chunkResponder();
    const config: RunConfig = {
      transport,
      screeningFrame: true,
      revisionId: "rev-1",
      now: 1_000,
      characterLimit: 40,
    };

    const run = await critique(longDocument(), LONG_PASS, connection(), config);

    expect(run.rawResponse.split("--- chunk ---")).toHaveLength(run.chunks);
  });

  it("keeps two distinct Findings on the same span instead of collapsing them", async () => {
    // Every chunk that sees the overlap reports both problems; a chunked Run
    // must not disagree with a single call about how many problems exist.
    const transport = createFixtureTransport({
      respond: () =>
        JSON.stringify({
          findings: [
            { issue: "First", diagnosis: "One problem.", quote: "# One", offset: 0 },
            { issue: "Second", diagnosis: "Another problem.", quote: "# One", offset: 0 },
          ],
        }),
    });
    const config: RunConfig = {
      transport,
      screeningFrame: true,
      revisionId: "rev-1",
      now: 1_000,
      characterLimit: 40,
    };

    const run = await critique(longDocument(), LONG_PASS, connection(), config);

    expect(run.findings.map((finding) => finding.issue).sort()).toEqual(["First", "Second"]);
  });

  it("names the failed chunk when a chunked Run cannot finish", async () => {
    let calls = 0;
    const transport = createFixtureTransport({
      respond: () => {
        calls += 1;
        if (calls === 2) throw new Error("provider said no");
        return JSON.stringify({ findings: [] });
      },
    });
    const config: RunConfig = {
      transport,
      screeningFrame: true,
      revisionId: "rev-1",
      now: 1_000,
      characterLimit: 40,
    };

    await expect(critique(longDocument(), LONG_PASS, connection(), config)).rejects.toThrow(
      /Chunk 2 of \d+ of the "[^"]+" Run failed.*provider said no/s,
    );
  });
});
