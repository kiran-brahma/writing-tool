import { beforeEach, describe, expect, it } from "vitest";
import { CONNECTION_PREFILLS, connectionFromPrefill, type Connection } from "../wire/connection";
import { createFixtureTransport, type FixtureTransport } from "../wire/fixtureTransport";
import { judge, type JudgeVerdict } from "./judge";
import {
  clearAllPredictions,
  clearPrediction,
  getPrediction,
  predictionAgreement,
  setPrediction,
  subscribePrediction,
  type JudgePrediction,
} from "./judgeCalibration";

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
    reasons: [],
    problemsInA: [],
    problemsInB: [],
    ...overrides,
  });
}

function verdict(preference: JudgeVerdict["preference"]): JudgeVerdict {
  return {
    preference,
    confidence: 0.8,
    reasons: [],
    problemsInBefore: [],
    problemsInAfter: [],
  };
}

const PREDICTION: JudgePrediction = { before: BEFORE, after: AFTER, side: "after" };

beforeEach(() => {
  clearAllPredictions();
});

describe("judge calibration", () => {
  it("holds the Writer's prediction for the session", () => {
    setPrediction(PREDICTION);

    expect(getPrediction()).toEqual(PREDICTION);
  });

  it("loses the prediction on a reload, because it is never persisted", () => {
    setPrediction(PREDICTION);

    // A reload empties the module-level store; nothing ever wrote it down.
    clearAllPredictions();

    expect(getPrediction()).toBeNull();
  });

  it("forgets a prediction the Writer clears", () => {
    setPrediction(PREDICTION);

    clearPrediction();

    expect(getPrediction()).toBeNull();
  });

  it("notifies subscribers when the prediction changes", () => {
    let changes = 0;
    const unsubscribe = subscribePrediction(() => {
      changes += 1;
    });

    setPrediction(PREDICTION);
    clearPrediction();
    unsubscribe();
    setPrediction(PREDICTION);

    expect(changes).toBe(2);
  });

  it("compares the prediction with the Judge's answer", () => {
    expect(predictionAgreement({ ...PREDICTION, side: "before" }, verdict("before"))).toBe(
      "agrees",
    );
    expect(predictionAgreement({ ...PREDICTION, side: "before" }, verdict("after"))).toBe(
      "disagrees",
    );
    expect(predictionAgreement(PREDICTION, verdict("tie"))).toBe("tie");
    expect(predictionAgreement(PREDICTION, null)).toBe("unstable");
  });

  it("has nothing to compare when no prediction was recorded", () => {
    expect(predictionAgreement(null, verdict("before"))).toBeNull();
  });

  it("runs the Judge without a prediction, and with one, and never sends it", async () => {
    // Without a prediction.
    const without = responder(answer({ preference: "A" }), answer({ preference: "B" }));
    const clean = await judge(BEFORE, AFTER, connection(), {
      transport: without,
      labelOrder: ["A", "B"],
    });
    expect(clean.verdict).not.toBeNull();

    // With a prediction: the Judge still runs — the prediction never gates it —
    // and every request body is byte-identical to the run without one.
    setPrediction(PREDICTION);
    const withPrediction = responder(answer({ preference: "A" }), answer({ preference: "B" }));
    const calibrated = await judge(BEFORE, AFTER, connection(), {
      transport: withPrediction,
      labelOrder: ["A", "B"],
    });

    expect(calibrated.verdict).not.toBeNull();
    expect(bodies(withPrediction)).toEqual(bodies(without));
    // The prediction's own words appear nowhere in what was sent.
    for (const body of bodies(withPrediction)) {
      expect(userMessage(body)).not.toContain("predict");
    }
  });
});
