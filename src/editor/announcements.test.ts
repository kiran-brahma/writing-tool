import { describe, expect, it } from "vitest";
import {
  announcementForTransition,
  anyRunInFlight,
  emptyRailRunState,
  type RailRunState,
} from "./announcements";
import type { JudgeResult } from "../core/judge";

const mockJudgeResult: JudgeResult = {
  first: { preference: "A", confidence: 0.9, reasons: [], problemsInA: [], problemsInB: [] },
  swapped: { preference: "B", confidence: 0.9, reasons: [], problemsInA: [], problemsInB: [] },
  stable: true,
  labelOrder: ["A", "B"],
  verdict: {
    preference: "after",
    confidence: 0.9,
    reasons: [],
    problemsInBefore: [],
    problemsInAfter: [],
  },
};

describe("announcements", () => {
  it("returns 'Run finished.' when a run completes without error", () => {
    const prev: RailRunState = { ...emptyRailRunState(), runningPassId: "pass-1" };
    const next: RailRunState = { ...emptyRailRunState(), runningPassId: null };
    expect(announcementForTransition(prev, next)).toBe("Run finished.");
  });

  it("returns null while a structural set is still in flight even if an individual pass finishes", () => {
    const prev: RailRunState = {
      ...emptyRailRunState(),
      structuralRunning: true,
      runningPassId: "pass-1",
    };
    const next: RailRunState = {
      ...emptyRailRunState(),
      structuralRunning: true,
      runningPassId: null,
    };
    expect(announcementForTransition(prev, next)).toBeNull();
  });

  it("returns 'Run finished.' when the entire structural set completes without error", () => {
    const prev: RailRunState = { ...emptyRailRunState(), structuralRunning: true };
    const next: RailRunState = { ...emptyRailRunState(), structuralRunning: false };
    expect(announcementForTransition(prev, next)).toBe("Run finished.");
  });

  it("returns 'Run finished.' when the reader pass completes without error", () => {
    const prev: RailRunState = { ...emptyRailRunState(), readerRunning: true };
    const next: RailRunState = { ...emptyRailRunState(), readerRunning: false };
    expect(announcementForTransition(prev, next)).toBe("Run finished.");
  });

  it("returns 'Run finished.' when the audit pass completes without error", () => {
    const prev: RailRunState = { ...emptyRailRunState(), auditRunning: true };
    const next: RailRunState = { ...emptyRailRunState(), auditRunning: false };
    expect(announcementForTransition(prev, next)).toBe("Run finished.");
  });

  it("returns 'Run failed.' when a model run fails", () => {
    const prev: RailRunState = { ...emptyRailRunState(), runningPassId: "pass-1" };
    const next: RailRunState = {
      ...emptyRailRunState(),
      runningPassId: null,
      runError: "Rate limit exceeded",
    };
    expect(announcementForTransition(prev, next)).toBe("Run failed.");
  });

  it("does not announce 'Run failed.' when a run is cancelled by the writer", () => {
    const prev: RailRunState = { ...emptyRailRunState(), runningPassId: "pass-1" };
    const next: RailRunState = {
      ...emptyRailRunState(),
      runningPassId: null,
      runError: "Run cancelled.",
    };
    expect(announcementForTransition(prev, next)).toBeNull();
  });

  it("announces 'Run failed.' on successive different errors", () => {
    const prev: RailRunState = {
      ...emptyRailRunState(),
      runningPassId: "pass-2",
      runError: "Previous error",
    };
    const next: RailRunState = {
      ...emptyRailRunState(),
      runningPassId: null,
      runError: "New network error",
    };
    expect(announcementForTransition(prev, next)).toBe("Run failed.");
  });

  it("returns 'Run failed.' when the reader pass fails", () => {
    const prev: RailRunState = { ...emptyRailRunState(), readerRunning: true };
    const next: RailRunState = {
      ...emptyRailRunState(),
      readerRunning: false,
      readerError: "Connection refused",
    };
    expect(announcementForTransition(prev, next)).toBe("Run failed.");
  });

  it("returns 'Run failed.' when the audit pass fails", () => {
    const prev: RailRunState = { ...emptyRailRunState(), auditRunning: true };
    const next: RailRunState = {
      ...emptyRailRunState(),
      auditRunning: false,
      auditError: "Network error",
    };
    expect(announcementForTransition(prev, next)).toBe("Run failed.");
  });

  it("returns 'Run failed.' when the judge fails", () => {
    const prev: RailRunState = { ...emptyRailRunState(), judgeRunning: true };
    const next: RailRunState = {
      ...emptyRailRunState(),
      judgeRunning: false,
      judgeError: "Model not found",
    };
    expect(announcementForTransition(prev, next)).toBe("Run failed.");
  });

  it("returns 'Verdict arrived.' when judge completes with a verdict", () => {
    const prev: RailRunState = { ...emptyRailRunState(), judgeRunning: true, verdict: null };
    const next: RailRunState = {
      ...emptyRailRunState(),
      judgeRunning: false,
      verdict: mockJudgeResult,
    };
    expect(announcementForTransition(prev, next)).toBe("Verdict arrived.");
  });

  it("returns null when no run state change occurred", () => {
    const state = emptyRailRunState();
    expect(announcementForTransition(state, state)).toBeNull();
  });

  it("returns null when a run is just starting", () => {
    const prev = emptyRailRunState();
    const next: RailRunState = { ...emptyRailRunState(), runningPassId: "pass-1" };
    expect(announcementForTransition(prev, next)).toBeNull();
  });
});

describe("anyRunInFlight", () => {
  it("is idle only when every kind of Run is idle", () => {
    expect(anyRunInFlight(emptyRailRunState())).toBe(false);
  });

  it.each([
    ["a model pass", { runningPassId: "pass-1" }],
    ["the structural set", { structuralRunning: true }],
    ["a Reader run", { readerRunning: true }],
    ["an Audit run", { auditRunning: true }],
    ["a Judge run", { judgeRunning: true }],
  ])("counts %s as in flight", (_label, patch) => {
    // The Rail used to check only the model and structural flags, so the four
    // remaining kinds left the Run buttons live underneath a running pass.
    expect(anyRunInFlight({ ...emptyRailRunState(), ...patch })).toBe(true);
  });
});
