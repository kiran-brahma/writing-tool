import { describe, expect, it, vi } from "vitest";
import { CONNECTION_PREFILLS, connectionFromPrefill, type Connection } from "../wire/connection";
import { createFixtureTransport, type FixtureTransport } from "../wire/fixtureTransport";
import {
  buildJudgePrompt,
  judge,
  NEUTRAL_INSTRUCTION,
  parseJudgeAnswer,
  randomLabelOrder,
  sameModelWarning,
  type JudgeConfig,
} from "./judge";

const BEFORE = "The cat sat on the mat. It was a very nice day.";
const AFTER = "The cat sat on the mat. The day was pleasant.";

function connection(overrides: Partial<Connection> = {}): Connection {
  const prefill = CONNECTION_PREFILLS.find((entry) => entry.id === "openai");
  if (prefill === undefined) throw new Error("no openai prefill");
  return { ...connectionFromPrefill(prefill), model: "judge-model", apiKey: "secret", ...overrides };
}

/** The request bodies in order, as the fixture recorded them. */
function bodies(transport: FixtureTransport): Record<string, unknown>[] {
  return transport.requests.map((request) => request.body as Record<string, unknown>);
}

function userMessage(body: Record<string, unknown>): string {
  const messages = body.messages as { role: string; content: string }[];
  const user = messages.find((message) => message.role === "user");
  if (user === undefined) throw new Error("no user message");
  return user.content;
}

/** A transport that answers each call from a queue of raw responses. */
function responder(...responses: string[]): FixtureTransport {
  let call = 0;
  return createFixtureTransport({
    respond: () => {
      const response = responses[call];
      call += 1;
      if (response === undefined) throw new Error(`no fixture response for call ${call}`);
      return response;
    },
  });
}

function answer(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    preference: "A",
    confidence: 0.8,
    reasons: [{ evidence_quote: "The cat sat", explanation: "Concrete and direct." }],
    problemsInA: [],
    problemsInB: ["The second sentence is vague."],
    ...overrides,
  });
}

function config(transport: FixtureTransport, labelOrder?: ["A" | "B", "A" | "B"]): JudgeConfig {
  return labelOrder === undefined ? { transport } : { transport, labelOrder };
}

describe("judge", () => {
  it("sends only the two passages labelled A and B and the neutral instruction", async () => {
    const transport = responder(answer(), answer());

    await judge(BEFORE, AFTER, connection(), config(transport, ["A", "B"]));

    expect(transport.requests).toHaveLength(2);
    for (const body of bodies(transport)) {
      const messages = body.messages as { role: string; content: string }[];
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect(messages.some((message) => message.role === "system")).toBe(false);
      const content = messages[0].content;
      expect(content).toContain(NEUTRAL_INSTRUCTION);
      expect(content).toContain(BEFORE);
      expect(content).toContain(AFTER);
    }
  });

  it("never sends a Document, findings, a Screening frame or a persona", async () => {
    const transport = responder(answer(), answer());

    await judge(BEFORE, AFTER, connection(), config(transport, ["A", "B"]));

    for (const body of bodies(transport)) {
      // The provider-agnostic request's fields are the whole surface; there is
      // no `system` and no extra message a persona could hide in.
      expect(Object.keys(body).sort()).toEqual(
        ["max_tokens", "messages", "model", "response_format", "temperature"].sort(),
      );
    }
  });

  it("tells the judge never to assume which passage is newer", async () => {
    const transport = responder(answer(), answer());

    await judge(BEFORE, AFTER, connection(), config(transport, ["A", "B"]));

    expect(userMessage(bodies(transport)[0])).toContain(
      "Do not assume either is newer or better.",
    );
  });

  it("keeps the local label mapping out of the request and follows it in the passages", async () => {
    const transport = responder(answer(), answer());
    // `before` is labelled B, so Passage A carries the Writer's `after`.
    await judge(BEFORE, AFTER, connection(), config(transport, ["B", "A"]));

    const first = userMessage(bodies(transport)[0]);
    expect(passageOf(first, "A")).toBe(AFTER);
    expect(passageOf(first, "B")).toBe(BEFORE);
    // No request contains the words "before" or "after".
    expect(first).not.toContain("before");
    expect(first).not.toContain("after");
  });

  it("runs the second call with the labels swapped", async () => {
    const transport = responder(answer(), answer());

    await judge(BEFORE, AFTER, connection(), config(transport, ["A", "B"]));

    const first = userMessage(bodies(transport)[0]);
    const second = userMessage(bodies(transport)[1]);
    expect(passageOf(first, "A")).toBe(BEFORE);
    expect(passageOf(first, "B")).toBe(AFTER);
    expect(passageOf(second, "A")).toBe(AFTER);
    expect(passageOf(second, "B")).toBe(BEFORE);
  });

  it("unmaps agreeing answers to the Writer's view and reports a stable Verdict", async () => {
    // with before=A: first prefers A (before); swapped has before=B, prefers B (before).
    const transport = responder(answer({ preference: "A" }), answer({ preference: "B" }));

    const result = await judge(BEFORE, AFTER, connection(), config(transport, ["A", "B"]));

    expect(result.stable).toBe(true);
    expect(result.labelOrder).toEqual(["A", "B"]);
    expect(result.verdict).toMatchObject({ preference: "before" });
  });

  it("reports Unstable instead of a preference when the labels swap flips the answer", async () => {
    // first prefers A (before); swapped's A is `after`, so this disagrees.
    const transport = responder(answer({ preference: "A" }), answer({ preference: "A" }));

    const result = await judge(BEFORE, AFTER, connection(), config(transport, ["A", "B"]));

    expect(result.stable).toBe(false);
    expect(result.verdict).toBeNull();
  });

  it("carries quoted evidence and lists problems in each version separately", async () => {
    const transport = responder(
      answer({
        reasons: [{ evidence_quote: "very nice", explanation: "Vague intensifier." }],
        problemsInA: ["Passive construction."],
        problemsInB: ["Vague second sentence."],
      }),
      answer({
        preference: "B",
        reasons: [{ evidence_quote: "very nice", explanation: "Vague intensifier." }],
        problemsInA: ["Vague second sentence."],
        problemsInB: ["Passive construction."],
      }),
    );

    const result = await judge(BEFORE, AFTER, connection(), config(transport, ["A", "B"]));

    expect(result.verdict?.reasons).toEqual([
      { evidence_quote: "very nice", explanation: "Vague intensifier." },
    ]);
    // before is A, after is B in this label order.
    expect(result.verdict?.problemsInBefore).toEqual(["Passive construction."]);
    expect(result.verdict?.problemsInAfter).toEqual(["Vague second sentence."]);
  });

  it("takes the lower of the two agreeing confidences, so agreement is not overconfidence", async () => {
    const transport = responder(
      answer({ preference: "A", confidence: 0.9 }),
      answer({ preference: "B", confidence: 0.4 }),
    );

    const result = await judge(BEFORE, AFTER, connection(), config(transport, ["A", "B"]));

    expect(result.verdict?.confidence).toBe(0.4);
  });

  it("reports a tie as a stable tie, not as a preference", async () => {
    const transport = responder(answer({ preference: "tie" }), answer({ preference: "tie" }));

    const result = await judge(BEFORE, AFTER, connection(), config(transport, ["A", "B"]));

    expect(result.stable).toBe(true);
    expect(result.verdict?.preference).toBe("tie");
  });

  it("merges evidence and problems from both calls, so neither is lost", async () => {
    const transport = responder(
      answer({
        preference: "A",
        reasons: [{ evidence_quote: "one", explanation: "first" }],
        problemsInA: ["p-a"],
        problemsInB: [],
      }),
      answer({
        preference: "B",
        reasons: [{ evidence_quote: "two", explanation: "second" }],
        problemsInA: [],
        problemsInB: ["s-b"],
      }),
    );

    const result = await judge(BEFORE, AFTER, connection(), config(transport, ["A", "B"]));

    expect(result.verdict?.reasons.map((reason) => reason.evidence_quote)).toEqual(["one", "two"]);
    // first names p-a under A (before); swapped names s-b under B (before).
    expect(result.verdict?.problemsInBefore).toEqual(["p-a", "s-b"]);
  });
});

describe("randomLabelOrder", () => {
  it("returns one of the two label orders", () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      expect([["A", "B"], ["B", "A"]]).toContainEqual(randomLabelOrder());
    }
  });

  it("randomises the first call's label order from Math.random", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.1);
    expect(randomLabelOrder()).toEqual(["A", "B"]);
    random.mockReturnValue(0.9);
    expect(randomLabelOrder()).toEqual(["B", "A"]);
    random.mockRestore();
  });

  it("swaps the labels between the two calls when no order is supplied", async () => {
    const transport = responder(answer(), answer());

    await judge(BEFORE, AFTER, connection(), config(transport));

    const first = userMessage(bodies(transport)[0]);
    const second = userMessage(bodies(transport)[1]);
    const firstA = passageOf(first, "A");
    const secondA = passageOf(second, "A");
    // The same passage cannot be labelled A in both calls when the labels are swapped.
    expect(firstA).not.toBe(secondA);
  });
});

describe("parseJudgeAnswer", () => {
  it("reads JSON wrapped in a code fence", () => {
    const raw = "Here is my answer:\n```json\n" + answer({ preference: "B" }) + "\n```";

    expect(parseJudgeAnswer(raw)).toMatchObject({ preference: "B", confidence: 0.8 });
  });

  it("normalises a lower-case preference", () => {
    expect(parseJudgeAnswer(answer({ preference: "tie" })).preference).toBe("tie");
    expect(parseJudgeAnswer(answer({ preference: "a" })).preference).toBe("A");
  });

  it("clamps confidence into the unit interval", () => {
    expect(parseJudgeAnswer(answer({ confidence: 4 })).confidence).toBe(1);
    expect(parseJudgeAnswer(answer({ confidence: -1 })).confidence).toBe(0);
  });

  it("refuses a response that names no preference", () => {
    expect(() => parseJudgeAnswer(answer({ preference: "maybe" }))).toThrow();
  });
});

describe("sameModelWarning", () => {
  it("warns when the Critic and the Judge share a model, without blocking", () => {
    const critic = connection({ model: "same-model" });
    const judge = connection({ id: "anthropic", model: "same-model" });

    expect(sameModelWarning(critic, judge)).toContain("same-model");
  });

  it("warns when the Critic and the Judge are the same Connection with the same model", () => {
    const critic = connection();

    expect(sameModelWarning(critic, critic)).not.toBeNull();
  });

  it("stays silent when one Connection serves both Slots with different models", () => {
    const critic = connection({ id: "openai", model: "gpt-x" });
    const judge = connection({ id: "openai", model: "gpt-y" });

    expect(sameModelWarning(critic, judge)).toBeNull();
  });

  it("warns when one Connection serves both Slots with no model to tell them apart", () => {
    const critic = connection({ id: "openai", model: "" });
    const judge = connection({ id: "openai", model: "" });

    expect(sameModelWarning(critic, judge)).not.toBeNull();
  });

  it("stays silent when the models differ or a Slot is unset", () => {
    const critic = connection({ model: "one" });
    const judge = connection({ id: "anthropic", model: "two" });

    expect(sameModelWarning(critic, judge)).toBeNull();
    expect(sameModelWarning(critic, null)).toBeNull();
    expect(sameModelWarning(null, judge)).toBeNull();
  });
});

describe("buildJudgePrompt", () => {
  it("places the passages under their labels and nothing else", () => {
    expect(buildJudgePrompt("P1", "P2", ["B", "A"])).toBe(
      `${NEUTRAL_INSTRUCTION}\n\nPassage A:\nP2\n\nPassage B:\nP1`,
    );
  });
});

/** The text under `Passage <label>:` in a prompt. */
function passageOf(prompt: string, label: "A" | "B"): string {
  const match = prompt.match(new RegExp(`Passage ${label}:\\n([\\s\\S]*?)(?:\\n\\nPassage |$)`));
  if (match === null) throw new Error(`no Passage ${label} in prompt`);
  return match[1];
}
