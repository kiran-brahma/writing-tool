import type { JudgeResult } from "../core/judge";

/**
 * Story 186: Live region announcements for screen readers.
 *
 * A Run finishing, a Run failing, and a Judge Verdict arriving all change the
 * screen silently. Screen readers cannot see spinners, so these three events
 * are routed through an aria-live region.
 *
 * Constitution: Nothing here inserts model-derived text. The live region
 * announces that a Run finished or failed; it does not read model output
 * aloud as advice.
 */

export interface RailRunState {
  runningPassId: string | null;
  structuralRunning: boolean;
  readerRunning: boolean;
  auditRunning: boolean;
  judgeRunning: boolean;
  runError: string | null;
  readerError: string | null;
  auditError: string | null;
  judgeError: string | null;
  verdict: JudgeResult | null;
}

export function emptyRailRunState(): RailRunState {
  return {
    runningPassId: null,
    structuralRunning: false,
    readerRunning: false,
    auditRunning: false,
    judgeRunning: false,
    runError: null,
    readerError: null,
    auditError: null,
    judgeError: null,
    verdict: null,
  };
}

export function railRunStateFromHandle(handle: {
  runningPassId: string | null;
  structuralRunning: boolean;
  readerRunning: boolean;
  auditRunning: boolean;
  judgeRunning: boolean;
  runError: string | null;
  readerError: string | null;
  auditError: string | null;
  judgeError: string | null;
  judgeResult: JudgeResult | null;
}): RailRunState {
  return {
    runningPassId: handle.runningPassId,
    structuralRunning: handle.structuralRunning,
    readerRunning: handle.readerRunning,
    auditRunning: handle.auditRunning,
    judgeRunning: handle.judgeRunning,
    runError: handle.runError,
    readerError: handle.readerError,
    auditError: handle.auditError,
    judgeError: handle.judgeError,
    verdict: handle.judgeResult,
  };
}

/** User cancellations are not run failures. */
function isRealRunError(error: string | null): boolean {
  return error !== null && error !== "Run cancelled.";
}

/**
 * True while any Run is in flight. There are five kinds of Run and one Writer,
 * so a second Run must not start while any of them is going. It is spelled once
 * here because it is one rule about the run state; the Rail used to derive it
 * from only the model and structural flags, which left the Run buttons live
 * during a Reader, Audit or Judge run.
 */
export function anyRunInFlight(state: {
  runningPassId: string | null;
  structuralRunning: boolean;
  readerRunning: boolean;
  auditRunning: boolean;
  judgeRunning: boolean;
}): boolean {
  return (
    state.runningPassId !== null ||
    state.structuralRunning ||
    state.readerRunning ||
    state.auditRunning ||
    state.judgeRunning
  );
}

/**
 * Derives the announcement message for a transition between two rail run states.
 * Returns null if no event should be announced.
 */
export function announcementForTransition(
  prev: RailRunState,
  next: RailRunState,
): string | null {
  const modelRunFailed =
    (prev.runningPassId !== null || prev.structuralRunning) &&
    isRealRunError(next.runError);
  const readerRunFailed = prev.readerRunning && next.readerError !== null;
  const auditRunFailed = prev.auditRunning && next.auditError !== null;
  const judgeRunFailed = prev.judgeRunning && next.judgeError !== null;

  const newErrorArrived =
    (next.runError !== prev.runError && isRealRunError(next.runError)) ||
    (next.readerError !== prev.readerError && next.readerError !== null) ||
    (next.auditError !== prev.auditError && next.auditError !== null) ||
    (next.judgeError !== prev.judgeError && next.judgeError !== null);

  if (modelRunFailed || readerRunFailed || auditRunFailed || judgeRunFailed || newErrorArrived) {
    return "Run failed.";
  }

  const verdictArrived =
    (prev.judgeRunning && !next.judgeRunning && next.verdict !== null) ||
    (prev.verdict === null && next.verdict !== null);

  if (verdictArrived && !next.judgeError) {
    return "Verdict arrived.";
  }

  // If a structural set is still in progress, intermediate passes inside it do not announce finished.
  if (next.structuralRunning) {
    return null;
  }

  const modelRunFinished =
    ((prev.structuralRunning && !next.structuralRunning) ||
      (prev.runningPassId !== null && next.runningPassId === null)) &&
    !isRealRunError(next.runError) &&
    next.runError !== "Run cancelled.";

  const readerRunFinished =
    prev.readerRunning && !next.readerRunning && next.readerError === null;

  const auditRunFinished =
    prev.auditRunning && !next.auditRunning && next.auditError === null;

  if (modelRunFinished || readerRunFinished || auditRunFinished) {
    return "Run finished.";
  }

  return null;
}
