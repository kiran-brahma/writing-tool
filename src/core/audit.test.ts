import { describe, expect, it } from "vitest";
import { CONNECTION_PREFILLS, connectionFromPrefill, type Connection } from "../wire/connection";
import { createFixtureTransport } from "../wire/fixtureTransport";
import { AUDIT_SCHEMA, auditDocument, parseAuditAccount } from "./audit";
import type { RunConfig } from "./critique";
import type { BlockNode, DocTree } from "./docTree";
import type { Pass } from "./pass";
import { documentContext } from "./passContext";
import { UnsupportedOutputShapeError } from "./parseFindings";

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
  paragraph("Alpha body, which introduces the claim."),
  heading(2, "Sub"),
  paragraph("Bravo body, which supports it."),
);

function target() {
  const built = documentContext(TREE, "My Title");
  if (built === null) throw new Error("fixture document is empty");
  return built;
}

function connection(): Connection {
  const prefill = CONNECTION_PREFILLS.find((entry) => entry.id === "openai");
  if (prefill === undefined) throw new Error("no openai prefill");
  return { ...connectionFromPrefill(prefill), model: "gpt-test", apiKey: "secret" };
}

const AUDIT_FIXTURE_PASS: Pass = {
  id: "audit",
  name: "Audit pass",
  description: "Reads the whole piece for whether its reasoning holds up.",
  kind: "model",
  scope: "document",
  output: "audit",
  slot: "critic",
  enabled: true,
  prompt: [
    "Analyze only the document below.",
    "Title: {{title}}",
    "DOCUMENT:",
    "{{document}}",
    "Do not praise the writing and do not suggest replacement prose.",
  ].join("\n"),
};

const RESPONSE = JSON.stringify({
  type: "argument",
  corePayload: "The plan is only as good as the habits under it.",
  argumentMap: {
    premises: ["Lists feel virtuous", "Lists are ignored by Tuesday"],
    subConclusions: ["A plan without habits fails"],
    conclusion: "Keep the list short and build the habits.",
  },
  reasoning: {
    kind: "inductive",
    form: "generalization",
    soundness: "The first premise is never established.",
    enthymemes: ["Past plans failed because of habits, not the plans."],
  },
  fallacies: [
    {
      name: "Equivocation",
      passage: "move the needle",
      why: "It shifts the sense of the goal between points.",
      missing: "A stated sense of what moves.",
    },
  ],
  definitions: { intensional: null, extensional: null },
  priority: ["Establish that the failure was the habits.", "Name what the needle is."],
});

function fixture(respond: string | ((request: unknown) => string), screeningFrame = true) {
  const transport = createFixtureTransport({
    respond: typeof respond === "string" ? () => respond : respond,
  });
  return {
    transport,
    config: {
      transport,
      screeningFrame,
      revisionId: "rev-1",
      now: 1_000,
    } satisfies RunConfig,
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

describe("auditDocument", () => {
  it("runs one document-scope Audit pass end to end through the seam", async () => {
    const { transport, config } = fixture(RESPONSE);

    const run = await auditDocument(target(), AUDIT_FIXTURE_PASS, connection(), config);

    expect(transport.requests).toHaveLength(1);
    expect(run.account).toMatchObject({
      type: "argument",
      corePayload: "The plan is only as good as the habits under it.",
      fallacies: [{ name: "Equivocation" }],
      priority: ["Establish that the failure was the habits.", "Name what the needle is."],
      provenance: { providerId: "openai", model: "gpt-test", at: 1_000, revisionId: "rev-1" },
    });
    expect(run.rawResponse).toBe(RESPONSE);
    expect(run.chunks).toBe(1);
  });

  it("sends the whole Document, never only a Section", async () => {
    const { transport, config } = fixture(RESPONSE);

    await auditDocument(target(), AUDIT_FIXTURE_PASS, connection(), config);

    const prompt = userMessage(transport.requests[0].body);
    expect(prompt).toContain("Alpha body, which introduces the claim.");
    expect(prompt).toContain("Bravo body, which supports it.");
  });

  it("does not apply a Screening frame, even a smuggled one (story 154)", async () => {
    const on = fixture(RESPONSE, true);
    const framed: Pass = { ...AUDIT_FIXTURE_PASS, frame: "skimmer" };
    await auditDocument(target(), framed, connection(), on.config);
    expect(systemMessage(on.transport.requests[0].body)).toBeUndefined();
  });

  it("flags praise in an account's fields without dropping the account", async () => {
    const praise = JSON.stringify({ ...JSON.parse(RESPONSE), corePayload: "This is great writing." });

    const run = await auditDocument(target(), AUDIT_FIXTURE_PASS, connection(), fixture(praise).config);

    expect(run.violations).toContainEqual({ kind: "praise", text: "great writing" });
    expect(run.account.violations).toContainEqual({ kind: "praise", text: "great writing" });
    expect(run.account.corePayload).toBe("This is great writing.");
  });

  it("quarantines an out-of-schema rewrite rather than keeping it on the account", async () => {
    const smuggled = JSON.stringify({
      ...JSON.parse(RESPONSE),
      rewrite: "A much cleaner sentence.",
    });

    const run = await auditDocument(target(), AUDIT_FIXTURE_PASS, connection(), fixture(smuggled).config);

    expect(run.account).not.toHaveProperty("rewrite");
    expect(run.violations).toContainEqual({ kind: "rewrite", text: "A much cleaner sentence." });
  });

  it("refuses a Pass whose output shape is not an Audit before spending a request", async () => {
    const { transport, config } = fixture(RESPONSE);
    const findingsPass: Pass = { ...AUDIT_FIXTURE_PASS, output: "findings" };

    await expect(
      auditDocument(target(), findingsPass, connection(), config),
    ).rejects.toBeInstanceOf(UnsupportedOutputShapeError);
    expect(transport.requests).toHaveLength(0);
  });

  it("refuses a rule Pass", async () => {
    const { config } = fixture(RESPONSE);
    const rulePass: Pass = { ...AUDIT_FIXTURE_PASS, kind: "rule" };

    await expect(auditDocument(target(), rulePass, connection(), config)).rejects.toThrow(/rule Pass/);
  });

  it("chunks a long Document and reports its chunk count", async () => {
    const body = Array.from(
      { length: 8 },
      (_, index) =>
        `Paragraph number ${index + 1} carries a long sentence with plenty of words so the ` +
        "document is well past the character limit and must be split into chunks.",
    );
    const longTree = doc(heading(1, "Long"), ...body.map((text) => paragraph(text)));
    const longTarget = documentContext(longTree, "Long");
    if (longTarget === null) throw new Error("long fixture is empty");
    const limit = 400;

    const synthesis = JSON.stringify({
      ...JSON.parse(RESPONSE),
      corePayload: "The document-level conclusion.",
      priority: ["Fix the unstated premise first."],
    });
    const transport = createFixtureTransport({
      respond: (request) => {
        const prompt = request.messages.map((message) => message.content).join("\n");
        return prompt.includes("Synthesize") ? synthesis : RESPONSE;
      },
    });

    const run = await auditDocument(longTarget, AUDIT_FIXTURE_PASS, connection(), {
      transport,
      screeningFrame: true,
      revisionId: "rev-1",
      now: 1_000,
      characterLimit: limit,
    });

    // The fixture player recorded one call per chunk, then one synthesis call
    // for the whole Document. The reported count is checked against the calls
    // actually made, not against the chunker's own output.
    expect(run.chunks).toBeGreaterThan(1);
    expect(transport.requests).toHaveLength(run.chunks + 1);
    expect(run.account.corePayload).toBe("The document-level conclusion.");

    const synthesisRequest = transport.requests.find((request) =>
      userMessage(request.body).includes("Synthesize"),
    );
    expect(synthesisRequest).toBeDefined();
    // Obelus's own provenance never travels back to the Provider on synthesis.
    expect(JSON.stringify(synthesisRequest?.body)).not.toContain("provenance");
    // The synthesis request never carries the frame either.
    for (const request of transport.requests) {
      expect(systemMessage(request.body)).toBeUndefined();
    }
  });
});

describe("parseAuditAccount", () => {
  it("reads the account fields from surrounding prose", () => {
    const parsed = parseAuditAccount(`Here it is:\n\n${RESPONSE}\n\nHope that helps.`);

    expect(parsed.account).toMatchObject({
      type: "argument",
      corePayload: "The plan is only as good as the habits under it.",
      argumentMap: { conclusion: "Keep the list short and build the habits." },
      reasoning: { kind: "inductive" },
    });
    expect(parsed.violations).toEqual([]);
  });

  it("fails loudly when the response carries no account", () => {
    expect(() => parseAuditAccount("no structure here")).toThrow(/no JSON/);
    expect(() => parseAuditAccount("{}")).toThrow(/Audit account/);
    expect(() => parseAuditAccount('{"type":"argument"}')).toThrow(/Audit account/);
  });

  it("accepts a fallacy described in plain terms with a null name", () => {
    const raw = JSON.stringify({
      ...JSON.parse(RESPONSE),
      fallacies: [
        {
          name: null,
          passage: "the low-hanging fruit is usually the first thing to rot",
          why: "The metaphor does no argumentative work.",
          missing: "A reason the fruit rots.",
        },
      ],
    });

    expect(parseAuditAccount(raw).account.fallacies).toEqual([
      {
        name: null,
        passage: "the low-hanging fruit is usually the first thing to rot",
        why: "The metaphor does no argumentative work.",
        missing: "A reason the fruit rots.",
      },
    ]);
  });

  it("names praise in an out-of-schema field and quarantines it", () => {
    const raw = JSON.stringify({ ...JSON.parse(RESPONSE), extra: "This is great writing." });

    const parsed = parseAuditAccount(raw);

    expect(parsed.violations).toContainEqual({ kind: "praise", text: "great writing" });
    expect(parsed.violations).toContainEqual({ kind: "rewrite", text: "This is great writing." });
  });

  it("quarantines a rewrite nested under an out-of-schema key", () => {
    const raw = JSON.stringify({
      ...JSON.parse(RESPONSE),
      argumentMap: { ...JSON.parse(RESPONSE).argumentMap, rewrite: "A tidier conclusion." },
    });

    expect(parseAuditAccount(raw).violations).toContainEqual({
      kind: "rewrite",
      text: "A tidier conclusion.",
    });
  });

  it("quarantines a bare string where a fallacy object belongs", () => {
    const raw = JSON.stringify({ ...JSON.parse(RESPONSE), fallacies: ["A much cleaner sentence."] });

    expect(parseAuditAccount(raw).violations).toContainEqual({
      kind: "rewrite",
      text: "A much cleaner sentence.",
    });
  });

  it("quarantines prose in a wrong-typed known field rather than dropping it", () => {
    const raw = JSON.stringify({
      ...JSON.parse(RESPONSE),
      argumentMap: {
        ...JSON.parse(RESPONSE).argumentMap,
        premises: "consider rewriting this sentence",
      },
    });

    const parsed = parseAuditAccount(raw);

    // The malformed field fails validation, so no map is kept…
    expect(parsed.account.argumentMap).toBeUndefined();
    // …but the prose it carried is still visible as drift, never silently lost.
    expect(parsed.violations).toContainEqual({
      kind: "rewrite",
      text: "consider rewriting this sentence",
    });
  });

  it("lints the prose around the JSON, not only the account's fields", () => {
    const parsed = parseAuditAccount(`This is great writing, honestly.\n${RESPONSE}`);

    expect(parsed.account.type).toBe("argument");
    expect(parsed.violations).toContainEqual({ kind: "praise", text: "great writing" });
  });

  it("does not flag praise inside a fallacy passage, which quotes the piece", () => {
    const raw = JSON.stringify({
      ...JSON.parse(RESPONSE),
      fallacies: [
        {
          name: null,
          passage: "This is great writing to a reader.",
          why: "The claim is unsupported.",
          missing: "Evidence.",
        },
      ],
    });

    expect(parseAuditAccount(raw).violations).toEqual([]);
  });

  it("does not manufacture a phrase across two adjacent fields", () => {
    const raw = JSON.stringify({ ...JSON.parse(RESPONSE), corePayload: "great", priority: ["writing"] });

    expect(parseAuditAccount(raw).violations).toEqual([]);
  });
});

/**
 * The Audit schema is a constitutional decision, so these read it as data the
 * way `parseFindings.test.ts` reads the Findings schema: no field for rewritten
 * prose anywhere, and closed at every level so a model cannot add one.
 */

/** Every property name the schema declares, at any depth. */
function propertyNames(schema: unknown): string[] {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) return [];
  const node = schema as Record<string, unknown>;
  const names: string[] = [];
  const properties = node.properties;
  if (typeof properties === "object" && properties !== null && !Array.isArray(properties)) {
    for (const [name, child] of Object.entries(properties as Record<string, unknown>)) {
      names.push(name, ...propertyNames(child));
    }
  }
  if (node.items !== undefined) names.push(...propertyNames(node.items));
  return names;
}

/** Every object node that declares `properties`, at any depth. */
function objectNodes(schema: unknown): Record<string, unknown>[] {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) return [];
  const node = schema as Record<string, unknown>;
  const nodes: Record<string, unknown>[] = [];
  const properties = node.properties;
  if (typeof properties === "object" && properties !== null && !Array.isArray(properties)) {
    nodes.push(node);
    for (const child of Object.values(properties as Record<string, unknown>)) {
      nodes.push(...objectNodes(child));
    }
  }
  if (node.items !== undefined) nodes.push(...objectNodes(node.items));
  return nodes;
}

describe("the audit schema", () => {
  it("has no field for rewritten prose", () => {
    expect(JSON.stringify(AUDIT_SCHEMA).toLowerCase()).not.toContain("rewrite");
    expect(JSON.stringify(AUDIT_SCHEMA).toLowerCase()).not.toContain("replacement");
  });

  it("names no rewrite-shaped property at any depth", () => {
    const forbidden = /rewrite|replacement|suggest|revised|newtext|insert/i;
    const names = propertyNames(AUDIT_SCHEMA);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name).not.toMatch(forbidden);
    }
  });

  it("is closed at every object level", () => {
    const nodes = objectNodes(AUDIT_SCHEMA);
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      expect(node.additionalProperties).toBe(false);
    }
  });

  it("exposes the audit fields the spec names", () => {
    const serialized = JSON.stringify(AUDIT_SCHEMA);
    for (const field of [
      "type",
      "corePayload",
      "argumentMap",
      "reasoning",
      "fallacies",
      "definitions",
      "priority",
    ]) {
      expect(serialized).toContain(`"${field}"`);
    }
  });
});
