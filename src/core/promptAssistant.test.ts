import { describe, expect, it } from "vitest";
import { CONNECTION_PREFILLS, connectionFromPrefill, type Connection } from "../wire/connection";
import { createFixtureTransport } from "../wire/fixtureTransport";
import {
  assistPassPrompt,
  PROMPT_ASSISTANT_SYSTEM,
  PromptAssistantError,
  stripPromptFences,
} from "./promptAssistant";

function connection(overrides: Partial<Connection> = {}): Connection {
  const prefill = CONNECTION_PREFILLS.find((entry) => entry.id === "openai");
  if (prefill === undefined) throw new Error("no openai prefill");
  return { ...connectionFromPrefill(prefill), model: "gpt-test", apiKey: "secret", ...overrides };
}

/** The user turn content of the first recorded request. */
function userContent(body: unknown): string {
  const messages = (body as { messages: { role: string; content: string }[] }).messages;
  const user = messages.find((message) => message.role === "user");
  if (user === undefined) throw new Error("no user message");
  return user.content;
}

describe("assistPassPrompt", () => {
  it("sends the Writer's request and prompt through the seam and returns a suggestion", async () => {
    const transport = createFixtureTransport({ respond: () => "A draft Pass prompt." });

    const result = await assistPassPrompt(
      { request: "flag passive voice", prompt: "current draft" },
      connection(),
      { transport },
    );

    expect(result.suggestion).toBe("A draft Pass prompt.");
    expect(transport.requests).toHaveLength(1);
  });

  it("hands the model the Pass prompt and nothing about the Document (story 105)", async () => {
    const transport = createFixtureTransport({ respond: () => "ok" });

    await assistPassPrompt(
      { request: "flag passive voice", prompt: "current draft" },
      connection(),
      { transport },
    );

    const content = userContent(transport.requests[0].body);
    // The user turn is exactly the two fields the input declares, in order. It
    // is asserted literally rather than by calling the builder, so the test can
    // disagree with the builder about the shape the model is sent.
    expect(content).toBe(
      [
        "The writer wants a Pass that does this:",
        "flag passive voice",
        "",
        "The writer's current prompt draft:",
        "current draft",
      ].join("\n"),
    );
    expect(content).not.toContain("Bravo target paragraph");
    const messages = (transport.requests[0].body as { messages: { role: string; content: string }[] })
      .messages;
    expect(messages.filter((message) => message.role === "user")).toHaveLength(1);
  });

  it("carries a system prompt that names the placeholders and the constitution clauses", async () => {
    const transport = createFixtureTransport({ respond: () => "ok" });

    await assistPassPrompt({ request: "x", prompt: "" }, connection(), { transport });

    const messages = (transport.requests[0].body as {
      messages: { role: string; content: string }[];
    }).messages;
    expect(PROMPT_ASSISTANT_SYSTEM).toContain("{{context_above}}");
    expect(PROMPT_ASSISTANT_SYSTEM).toMatch(/do not praise/i);
    expect(PROMPT_ASSISTANT_SYSTEM).toMatch(/do not suggest replacement prose/i);
    // The system prompt is sent as a system turn, not a user one.
    expect(messages.filter((message) => message.role === "system")).toHaveLength(1);
  });

  it("strips one surrounding code fence from the reply", async () => {
    const transport = createFixtureTransport({
      respond: () => "```\nAnalyze only this paragraph.\n```",
    });

    const result = await assistPassPrompt({ request: "x", prompt: "" }, connection(), { transport });

    expect(result.suggestion).toBe("Analyze only this paragraph.");
  });

  it("raises rather than sending with no model set", async () => {
    const transport = createFixtureTransport({ respond: () => "ok" });

    await expect(
      assistPassPrompt({ request: "x", prompt: "" }, connection({ model: "" }), { transport }),
    ).rejects.toBeInstanceOf(PromptAssistantError);
    expect(transport.requests).toHaveLength(0);
  });

  it("raises when the model returns no prompt text", async () => {
    const transport = createFixtureTransport({ respond: () => "   " });

    await expect(
      assistPassPrompt({ request: "x", prompt: "" }, connection(), { transport }),
    ).rejects.toBeInstanceOf(PromptAssistantError);
  });
});

describe("stripPromptFences", () => {
  it("returns plain text unchanged and strips a language tag", () => {
    expect(stripPromptFences("  plain text  ")).toBe("plain text");
    expect(stripPromptFences("```markdown\nhello\n```")).toBe("hello");
  });

  it("leaves a fence that is not the whole reply alone", () => {
    expect(stripPromptFences("see ``` here ```")).toBe("see ``` here ```");
  });
});
