import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { AnchorDraft, Violation } from "../core/finding";
import type { JudgeResult, JudgeSide, JudgeVerdict } from "../core/judge";
import {
  clearPrediction,
  getPrediction,
  predictionAgreement,
  setPrediction,
  subscribePrediction,
  type JudgePrediction,
  type PredictionAgreement,
} from "../core/judgeCalibration";
import { defaultJudgePair, extractPassages, type ExtractedPassages } from "../core/judgeSelection";
import { lardFactorOfDiff } from "../core/metrics";
import { wordDiff, type WordDiffSegment } from "../core/wordDiff";
import type { Connection } from "../wire/connection";
import { PANEL_GLOSSES, type HelpSectionId } from "../help/helpContent";
import { QuarantinedRewrite, StruckText, StruckViolations } from "./ViolationDisplay";
import { TYPING_PAUSE_MS } from "./persistence";
import { useSettledValue } from "./useSettledValue";
import { splitViolations } from "./violationMarks";

/**
 * Story 78–90: comparing two versions of a passage. The Writer picks any two
 * Revisions, sees the word-level diff between them, chooses a span or a
 * Section, and sees both extracted passages before the Judge is called. The
 * panel is display and orchestration only: the extraction is Core's
 * diff-projection, and the double call is Core's `judge`.
 */

/** The Revision fields the Judge panel needs, so the Editor stays storage-free. */
export interface JudgeRevision {
  id: string;
  createdAt: number;
  wordCount: number;
  flagged: boolean;
  canonical: string;
}

export interface JudgePanelProps {
  revisions: JudgeRevision[];
  /** The current Document's canonical string, where the selection was made. */
  currentCanonical: string;
  /** The Selected span as an Anchor, or null when the selection is collapsed. */
  selection: AnchorDraft | null;
  /** The Section at the cursor as an Anchor, or null outside any Section. */
  section: AnchorDraft | null;
  judge: Connection | null;
  /** True when no judge Connection is assigned and the different-model default is used. */
  judgeIsDefault: boolean;
  sameModelWarning: string | null;
  running: boolean;
  error: string | null;
  result: JudgeResult | null;
  onJudge: (before: string, after: string) => void;
  onOpenHelp?: (sectionId: HelpSectionId) => void;
}

type SelectionMode = "span" | "section";

export function JudgePanel({
  revisions,
  currentCanonical,
  selection,
  section,
  judge,
  judgeIsDefault,
  sameModelWarning,
  running,
  error,
  result,
  onJudge,
  onOpenHelp,
}: JudgePanelProps) {
  const [mode, setMode] = useState<SelectionMode>("span");
  /** Stories 171–172: the pair the panel opens on, recomputed only when the Revisions change. */
  const defaultPair = useMemo(() => defaultJudgePair(revisions), [revisions]);
  const [beforeId, setBeforeId] = useState<string | null>(() => defaultPair.before);
  const [afterId, setAfterId] = useState<string | null>(() => defaultPair.after);
  /** The passages the shown Verdict was produced from, so it is never misattributed. */
  const [judged, setJudged] = useState<{ before: string; after: string } | null>(null);
  // Stories 156–157: the Writer's own prediction, held in memory for the session
  // and never persisted. The store is subscribed rather than mirrored, so it is
  // the one source of truth.
  const prediction = useSyncExternalStore(subscribePrediction, getPrediction);

  // Stories 171–172: Revisions load just after the panel mounts, so the default
  // pair settles once they are available — the last flagged Revision against
  // now, or the oldest against now — rather than staying unset forever. A side
  // the Writer has chosen is left alone.
  useEffect(() => {
    if (beforeId === null && defaultPair.before !== null) setBeforeId(defaultPair.before);
    if (afterId === null && defaultPair.after !== null) setAfterId(defaultPair.after);
  }, [defaultPair, beforeId, afterId]);

  // The panel stays mounted while Findings mode shows (ADR 0012), hidden but
  // keeping its choices, so it re-renders as the Writer types and selects. Extracting passages diffs the whole Document against
  // both Revisions — seconds, once a Writer's Revisions differ widely — so it
  // waits for the selection to hold still, and runs once per settled selection
  // rather than on every render. A word selected and immediately retyped never
  // pays for it.
  const anchor = useSettledValue(mode === "span" ? selection : section, TYPING_PAUSE_MS);
  const beforeRevision = revisions.find((revision) => revision.id === beforeId) ?? null;
  const afterRevision = revisions.find((revision) => revision.id === afterId) ?? null;
  const beforeCanonical = beforeRevision?.canonical ?? null;
  const afterCanonical = afterRevision?.canonical ?? null;

  // The extraction is Core's, so the Editor only displays what Core produced.
  const passages = useMemo<ExtractedPassages>(
    () =>
      beforeCanonical !== null && afterCanonical !== null
        ? extractPassages(anchor, currentCanonical, beforeCanonical, afterCanonical)
        : { before: null, after: null },
    [anchor, currentCanonical, beforeCanonical, afterCanonical],
  );
  const beforeText = passages.before;
  const afterText = passages.after;
  const diff = useMemo(
    () =>
      beforeCanonical !== null && afterCanonical !== null
        ? wordDiff(beforeCanonical, afterCanonical)
        : [],
    [beforeCanonical, afterCanonical],
  );

  // Story 144: the Lard Factor for the same pair the diff is for, so the number
  // and the diff on screen cannot disagree. Display only.
  const lard = useMemo(
    () => (beforeCanonical !== null && afterCanonical !== null ? lardFactorOfDiff(diff) : null),
    [beforeCanonical, afterCanonical, diff],
  );

  // A Verdict is shown only while the passages on screen are the ones it judged,
  // so switching the pair never leaves a stale preference labelled as this one's.
  const shownResult =
    result !== null && judged !== null && judged.before === beforeText && judged.after === afterText
      ? result
      : null;

  // A prediction is shown only for the pair it was recorded against, so a
  // Verdict for a different pair is never paired with a stale prediction.
  const predictionForPair =
    prediction !== null && prediction.before === beforeText && prediction.after === afterText
      ? prediction
      : null;

  const canJudge =
    beforeText !== null &&
    afterText !== null &&
    judge !== null &&
    !running &&
    beforeId !== afterId;

  /** Records the Writer's prediction for the current pair. Never a gate. */
  const recordPrediction = (side: JudgeSide) => {
    if (beforeText === null || afterText === null) return;
    setPrediction({ before: beforeText, after: afterText, side });
  };

  const hasTwoRevisions = revisions.length >= 2;

  return (
    <section className="border-b border-rule">
      <div className="flex items-center justify-between border-b border-rule-soft px-4 py-2">
        <h2 className="text-base font-semibold">Judge</h2>
        <span className="text-xs text-muted-ink">
          {running ? "judging…" : "two calls, labels swapped"}
        </span>
      </div>

      <div className="space-y-3 p-4">
        <p className="text-xs text-muted-ink">
          {PANEL_GLOSSES.judge.text}{" "}
          <button
            type="button"
            onClick={() => onOpenHelp?.(PANEL_GLOSSES.judge.sectionId)}
            className="rounded px-0.5 underline hover:text-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            How this works
          </button>
        </p>

        {!hasTwoRevisions && (
          <p className="text-sm text-muted-ink">
            Take at least two revisions to compare: keep writing, or flag a milestone.
          </p>
        )}

        {judge === null ? (
          <p className="rounded border border-warning-rule bg-warning-surface px-2 py-1.5 text-xs text-warning">
            Assign a connection to the critic and another to the judge slot. The judge defaults
            to a different model from the critic.
          </p>
        ) : (
          <p className="text-xs text-muted-ink">
            Judge: <span className="font-medium text-quiet-ink">{judge.name}</span>
            {judge.model.trim() === "" ? " (no model set)" : ` (${judge.model})`}
            {judgeIsDefault ? ", a different connection from the critic, by default" : ""}
          </p>
        )}

        {sameModelWarning !== null && (
          <p className="rounded border border-warning-rule bg-warning-surface px-2 py-1.5 text-xs text-warning">
            {sameModelWarning}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <RevisionSelect
            label="Version 1 (before)"
            revisions={revisions}
            value={beforeId}
            onChange={setBeforeId}
          />
          <RevisionSelect
            label="Version 2 (after)"
            revisions={revisions}
            value={afterId}
            onChange={setAfterId}
          />
        </div>

        <div>
          <h3 className="mb-1 text-xs font-semibold text-muted-ink">Word-level diff</h3>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-rule-soft bg-paper p-2 text-xs leading-relaxed">
            {diff.length === 0 ? (
              <span className="text-muted-ink">Pick two revisions to see what changed.</span>
            ) : (
              diff.map((segment, index) => <DiffSegmentView key={index} segment={segment} />)
            )}
          </pre>
          {lard !== null && (
            <p className="mt-1 text-xs text-muted-ink">
              Lard Factor:{" "}
              <span className="font-medium text-soft-ink">{formatLardFactor(lard)}</span>{" "}
              <span className="text-muted-ink">
                — the share of the earlier revision's words cut in the later one. A signal, not a
                verdict.
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ModeButton active={mode === "span"} onClick={() => setMode("span")}>
            Selected span
          </ModeButton>
          <ModeButton active={mode === "section"} onClick={() => setMode("section")}>
            Section at cursor
          </ModeButton>
        </div>

        {anchor === null && (
          <p className="text-xs text-muted-ink">
            {mode === "span"
              ? "Select a span of text in the document to judge."
              : "Place the cursor inside a section (a heading and its body) to judge it."}
          </p>
        )}

        {beforeRevision !== null && afterRevision !== null && (
          <div className="grid grid-cols-2 gap-2">
            <Passage label="Version 1 passage" text={beforeText} />
            <Passage label="Version 2 passage" text={afterText} />
          </div>
        )}

        {beforeText !== null && afterText !== null && (
          <div className="rounded border border-rule-soft bg-ground p-2">
            <h3 className="mb-1 text-xs font-semibold text-muted-ink">
              Your prediction (optional)
            </h3>
            <p className="mb-2 text-xs text-muted-ink">
              Which version do you think is clearer? Kept in this session only, never sent to
              the judge, and never required to run it.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <PredictionButton
                active={predictionForPair?.side === "before"}
                onClick={() => recordPrediction("before")}
              >
                Version 1 is clearer
              </PredictionButton>
              <PredictionButton
                active={predictionForPair?.side === "after"}
                onClick={() => recordPrediction("after")}
              >
                Version 2 is clearer
              </PredictionButton>
              {predictionForPair !== null && (
                <button
                  type="button"
                  onClick={clearPrediction}
                  className="rounded px-0.5 text-xs text-muted-ink underline hover:text-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            if (beforeText !== null && afterText !== null) {
              setJudged({ before: beforeText, after: afterText });
              onJudge(beforeText, afterText);
            }
          }}
          disabled={!canJudge}
          className="w-full rounded bg-ink px-3 py-1.5 text-sm font-medium text-on-ink hover:bg-quiet-ink disabled:cursor-not-allowed disabled:bg-rule focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          {running ? "Judging…" : "Judge"}
        </button>

        {error !== null && (
          <p className="rounded border border-failure-rule bg-failure-surface px-2 py-1.5 text-xs text-failure">
            {error}
          </p>
        )}

        {shownResult !== null && (
          <div className="space-y-2">
            {predictionForPair !== null && (
              <PredictionNote prediction={predictionForPair} verdict={shownResult.verdict} />
            )}
            <Verdict result={shownResult} />
          </div>
        )}
      </div>
    </section>
  );
}

function RevisionSelect({
  label,
  revisions,
  value,
  onChange,
}: {
  label: string;
  revisions: JudgeRevision[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs text-muted-ink">
      {label}
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded border border-rule bg-paper px-1.5 py-1 text-xs text-soft-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <option value="" disabled>
          Pick a revision
        </option>
        {revisions.map((revision) => (
          <option key={revision.id} value={revision.id}>
            {new Date(revision.createdAt).toLocaleString()}
            {revision.flagged ? " — milestone" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function PredictionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "rounded border px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        active
          ? "border-ink bg-ink text-on-ink focus-visible:ring-offset-2"
          : "border-rule bg-paper text-quiet-ink hover:bg-sunk",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "rounded px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        active ? "bg-ink text-on-ink focus-visible:ring-offset-2" : "border border-rule bg-paper text-quiet-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Passage({ label, text }: { label: string; text: string | null }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-muted-ink">{label}</h3>
      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-rule-soft bg-paper p-2 text-xs leading-relaxed">
        {text === null ? (
          <span className="text-muted-ink">Not found in this revision.</span>
        ) : (
          text
        )}
      </pre>
    </div>
  );
}

function DiffSegmentView({ segment }: { segment: WordDiffSegment }) {
  if (segment.kind === "same") return <span>{segment.value}</span>;
  return (
    <span
      className={
        segment.kind === "added"
          ? "bg-added text-added-ink"
          : "bg-removed text-removed-ink line-through"
      }
    >
      {segment.value}
    </span>
  );
}

function PredictionNote({
  prediction,
  verdict,
}: {
  prediction: JudgePrediction;
  verdict: JudgeVerdict | null;
}) {
  const agreement = predictionAgreement(prediction, verdict);
  if (agreement === null) return null;
  return (
    <div className={`rounded border p-2 text-xs ${AGREEMENT_CLASS[agreement]}`}>
      <span className="font-semibold">Your prediction:</span>{" "}
      {preferenceLabel(prediction.side)}. {agreementText(agreement, verdict)}
    </div>
  );
}

const AGREEMENT_CLASS: Record<PredictionAgreement, string> = {
  agrees: "border-agreement-rule bg-agreement-surface text-agreement",
  disagrees: "border-warning-rule bg-warning-surface text-warning",
  tie: "border-rule bg-ground text-quiet-ink",
  unstable: "border-rule bg-ground text-quiet-ink",
};

function agreementText(agreement: PredictionAgreement, verdict: JudgeVerdict | null): string {
  switch (agreement) {
    case "agrees":
      return "The judge agreed.";
    case "disagrees": {
      const preference = verdict?.preference;
      return preference === "before" || preference === "after"
        ? `The judge preferred ${preferenceLabel(preference)}.`
        : "The judge preferred the other version.";
    }
    case "tie":
      return "The judge called it a tie.";
    case "unstable":
      return "The judge was unstable, so there is no verdict to compare.";
  }
}

function Verdict({ result }: { result: JudgeResult }) {
  const { strikes, rewrites } = splitViolations(result.violations);
  const quarantine = rewrites.length > 0 ? <QuarantinedRewrite violations={rewrites} /> : null;

  if (!result.stable || result.verdict === null) {
    return (
      <div className="rounded border border-warning-rule-strong bg-warning-surface p-3 text-sm text-warning">
        <p className="font-semibold">Unstable</p>
        <p className="mt-1 text-xs">
          The judge changed its answer when the labels were swapped, so there is no
          preference to report. The two versions may be equivalent, or the judge may be
          biased by which passage it read first.
        </p>
        {strikes.length > 0 && (
          <p className="mt-1 text-xs">
            The judge also praised: <StruckViolations violations={strikes} />
          </p>
        )}
        {quarantine}
      </div>
    );
  }

  const verdict = result.verdict;
  return (
    <div className="space-y-2 rounded border border-rule bg-paper p-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold text-ink">{preferenceLabel(verdict.preference)}</p>
        <span className="text-xs text-muted-ink">
          confidence {Math.round(verdict.confidence * 100)}%
        </span>
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold text-muted-ink">Reasons</h3>
        {verdict.reasons.length === 0 ? (
          <p className="text-xs text-muted-ink">The judge gave no reasons.</p>
        ) : (
          <ul className="space-y-2">
            {verdict.reasons.map((reason, index) => (
              <li key={index} className="text-xs">
                {reason.evidence_quote !== "" && (
                  <blockquote className="border-l-2 border-rule pl-2 italic text-muted-ink">
                    “{reason.evidence_quote}”
                  </blockquote>
                )}
                <p className="mt-0.5 text-soft-ink">
                  <StruckText text={reason.explanation} violations={strikes} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProblemList
        label="Problems in Version 1"
        problems={verdict.problemsInBefore}
        strikes={strikes}
      />
      <ProblemList
        label="Problems in Version 2"
        problems={verdict.problemsInAfter}
        strikes={strikes}
      />
      {quarantine}
    </div>
  );
}

function ProblemList({
  label,
  problems,
  strikes,
}: {
  label: string;
  problems: string[];
  strikes: Violation[];
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-muted-ink">{label}</h3>
      {problems.length === 0 ? (
        <p className="text-xs text-muted-ink">None reported.</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-soft-ink">
          {problems.map((problem, index) => (
            <li key={index}>
              <StruckText text={problem} violations={strikes} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function preferenceLabel(preference: JudgeVerdict["preference"]): string {
  switch (preference) {
    case "before":
      return "Version 1 is clearer";
    case "after":
      return "Version 2 is clearer";
    case "tie":
      return "Neither version is clearly better";
  }
}

/** The Lard Factor as a signed percentage, one decimal, so 0.125 reads "12.5%". */
function formatLardFactor(factor: number): string {
  return `${(factor * 100).toFixed(1)}%`;
}
