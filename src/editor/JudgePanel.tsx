import { useEffect, useMemo, useState } from "react";
import type { AnchorDraft } from "../core/finding";
import type { JudgeResult, JudgeVerdict } from "../core/judge";
import { extractPassages, type ExtractedPassages } from "../core/judgeSelection";
import { lardFactor } from "../core/metrics";
import { wordDiff, type WordDiffSegment } from "../core/wordDiff";
import type { Connection } from "../wire/connection";

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
}: JudgePanelProps) {
  const [mode, setMode] = useState<SelectionMode>("span");
  const [beforeId, setBeforeId] = useState<string | null>(revisions[1]?.id ?? null);
  const [afterId, setAfterId] = useState<string | null>(revisions[0]?.id ?? null);
  /** The passages the shown Verdict was produced from, so it is never misattributed. */
  const [judged, setJudged] = useState<{ before: string; after: string } | null>(null);

  // Revisions load just after the panel mounts, so the initial choice settles
  // the first time two are available rather than staying unset forever.
  useEffect(() => {
    if (beforeId === null && revisions.length >= 2) setBeforeId(revisions[1].id);
    if (afterId === null && revisions.length >= 1) setAfterId(revisions[0].id);
  }, [revisions, beforeId, afterId]);

  const anchor = mode === "span" ? selection : section;
  const beforeRevision = revisions.find((revision) => revision.id === beforeId) ?? null;
  const afterRevision = revisions.find((revision) => revision.id === afterId) ?? null;

  // The extraction is Core's, so the Editor only displays what Core produced.
  const passages: ExtractedPassages =
    beforeRevision !== null && afterRevision !== null
      ? extractPassages(anchor, currentCanonical, beforeRevision.canonical, afterRevision.canonical)
      : { before: null, after: null };
  const beforeText = passages.before;
  const afterText = passages.after;

  const beforeCanonical = beforeRevision?.canonical ?? null;
  const afterCanonical = afterRevision?.canonical ?? null;
  const diff = useMemo(
    () =>
      beforeCanonical !== null && afterCanonical !== null
        ? wordDiff(beforeCanonical, afterCanonical)
        : [],
    [beforeCanonical, afterCanonical],
  );

  // Story 144: the Lard Factor for the same pair the diff is for, so the number
  // and the diff on screen cannot disagree. Display only.
  const lard =
    beforeCanonical !== null && afterCanonical !== null
      ? lardFactor(beforeCanonical, afterCanonical)
      : null;

  // A Verdict is shown only while the passages on screen are the ones it judged,
  // so switching the pair never leaves a stale preference labelled as this one's.
  const shownResult =
    result !== null && judged !== null && judged.before === beforeText && judged.after === afterText
      ? result
      : null;

  const canJudge =
    beforeText !== null &&
    afterText !== null &&
    judge !== null &&
    !running &&
    beforeId !== afterId;

  const hasTwoRevisions = revisions.length >= 2;

  return (
    <section className="border-b border-stone-300">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2">
        <h2 className="text-sm font-semibold">Judge</h2>
        <span className="text-xs text-stone-500">
          {running ? "judging…" : "two calls, labels swapped"}
        </span>
      </div>

      <div className="space-y-3 p-4">
        <p className="text-xs text-stone-500">
          Compare two versions of the same passage. The Judge sees only the two passages,
          labelled A and B, and never learns which is newer or who wrote it.
        </p>

        {!hasTwoRevisions && (
          <p className="text-sm text-stone-500">
            Take at least two Revisions to compare: keep writing, or flag a milestone.
          </p>
        )}

        {judge === null ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
            Assign a Connection to the Critic and another to the Judge Slot. The Judge defaults
            to a different model from the Critic.
          </p>
        ) : (
          <p className="text-xs text-stone-500">
            Judge: <span className="font-medium text-stone-700">{judge.name}</span>
            {judge.model.trim() === "" ? " (no model set)" : ` (${judge.model})`}
            {judgeIsDefault ? " — a different Connection from the Critic, by default" : ""}
          </p>
        )}

        {sameModelWarning !== null && (
          <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
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
          <h3 className="mb-1 text-xs font-semibold text-stone-600">Word-level diff</h3>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-stone-200 bg-white p-2 text-xs leading-relaxed">
            {diff.length === 0 ? (
              <span className="text-stone-500">Pick two Revisions to see what changed.</span>
            ) : (
              diff.map((segment, index) => <DiffSegmentView key={index} segment={segment} />)
            )}
          </pre>
          {lard !== null && (
            <p className="mt-1 text-xs text-stone-600">
              Lard Factor:{" "}
              <span className="font-medium text-stone-800">{formatLardFactor(lard)}</span>{" "}
              <span className="text-stone-500">
                — the share of the earlier Revision's words cut in the later one. A signal, not a
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
          <p className="text-xs text-stone-500">
            {mode === "span"
              ? "Select a span of text in the Document to judge."
              : "Place the cursor inside a Section (a heading and its body) to judge it."}
          </p>
        )}

        {beforeRevision !== null && afterRevision !== null && (
          <div className="grid grid-cols-2 gap-2">
            <Passage label="Version 1 passage" text={beforeText} />
            <Passage label="Version 2 passage" text={afterText} />
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
          className="w-full rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-stone-50 hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {running ? "Judging…" : "Judge"}
        </button>

        {error !== null && (
          <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
            {error}
          </p>
        )}

        {shownResult !== null && <Verdict result={shownResult} />}
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
    <label className="block text-xs text-stone-600">
      {label}
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded border border-stone-300 bg-white px-1.5 py-1 text-xs text-stone-800"
      >
        <option value="" disabled>
          Pick a Revision
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
        "rounded px-2 py-1 text-xs font-medium",
        active ? "bg-stone-900 text-stone-50" : "border border-stone-300 bg-white text-stone-700",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Passage({ label, text }: { label: string; text: string | null }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-stone-600">{label}</h3>
      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-stone-200 bg-white p-2 text-xs leading-relaxed">
        {text === null ? (
          <span className="text-stone-500">Not found in this Revision.</span>
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
          ? "bg-green-100 text-green-900"
          : "bg-red-100 text-red-900 line-through"
      }
    >
      {segment.value}
    </span>
  );
}

function Verdict({ result }: { result: JudgeResult }) {
  if (!result.stable || result.verdict === null) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-semibold">Unstable</p>
        <p className="mt-1 text-xs">
          The Judge changed its answer when the labels were swapped, so there is no
          preference to report. The two versions may be equivalent, or the Judge may be
          biased by which passage it read first.
        </p>
      </div>
    );
  }

  const verdict = result.verdict;
  return (
    <div className="space-y-2 rounded border border-stone-300 bg-white p-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold text-stone-900">{preferenceLabel(verdict.preference)}</p>
        <span className="text-xs text-stone-500">
          confidence {Math.round(verdict.confidence * 100)}%
        </span>
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold text-stone-600">Reasons</h3>
        {verdict.reasons.length === 0 ? (
          <p className="text-xs text-stone-500">The Judge gave no reasons.</p>
        ) : (
          <ul className="space-y-2">
            {verdict.reasons.map((reason, index) => (
              <li key={index} className="text-xs">
                {reason.evidence_quote !== "" && (
                  <blockquote className="border-l-2 border-stone-300 pl-2 italic text-stone-600">
                    “{reason.evidence_quote}”
                  </blockquote>
                )}
                <p className="mt-0.5 text-stone-800">{reason.explanation}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProblemList label="Problems in Version 1" problems={verdict.problemsInBefore} />
      <ProblemList label="Problems in Version 2" problems={verdict.problemsInAfter} />
    </div>
  );
}

function ProblemList({ label, problems }: { label: string; problems: string[] }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-stone-600">{label}</h3>
      {problems.length === 0 ? (
        <p className="text-xs text-stone-500">None reported.</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-stone-800">
          {problems.map((problem, index) => (
            <li key={index}>{problem}</li>
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
