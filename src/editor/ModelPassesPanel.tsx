import { useEffect, useState } from "react";
import type { Pass } from "../core/pass";

/**
 * The model-Pass panel. One Pass runs on demand against the Target Paragraph the
 * cursor is in; the Run shows a spinner and an elapsed timer rather than a
 * half-parsed object, because there is no streaming in v1. When Containment
 * drops an Anchor the count is shown here, so the Writer knows the model tried
 * to speak about text it was not asked about.
 *
 * The Screening frame toggle is global and applies to critic Passes only; the
 * Judge, when it arrives, never receives it.
 */
export interface ModelPassesPanelProps {
  passes: Pass[];
  runningPassId: string | null;
  runningSince: number | null;
  lastRunReport: { passId: string; droppedAnchors: number } | null;
  runError: string | null;
  criticName: string | null;
  screeningFrame: boolean;
  onRun: (passId: string) => void;
  onToggleScreening: (enabled: boolean) => void;
}

export function ModelPassesPanel({
  passes,
  runningPassId,
  runningSince,
  lastRunReport,
  runError,
  criticName,
  screeningFrame,
  onRun,
  onToggleScreening,
}: ModelPassesPanelProps) {
  const modelPasses = passes.filter((pass) => pass.kind === "model");

  return (
    <section className="border-t border-stone-300">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2">
        <h2 className="text-sm font-semibold">Model passes</h2>
        <span className="text-xs text-stone-500">
          {criticName === null ? "No critic assigned" : `Critic: ${criticName}`}
        </span>
      </div>

      <label className="flex items-center gap-2 border-b border-stone-200 px-4 py-2 text-xs text-stone-600">
        <input
          type="checkbox"
          checked={screeningFrame}
          onChange={(event) => onToggleScreening(event.target.checked)}
        />
        Screening frame (critic passes only)
      </label>

      {runError !== null && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {runError}
        </p>
      )}

      {modelPasses.length === 0 && (
        <p className="px-4 py-4 text-sm text-stone-500">
          No model passes yet. The Starter pack adds them as tickets land.
        </p>
      )}

      <ol>
        {modelPasses.map((pass) => {
          const running = pass.id === runningPassId;
          return (
            <li key={pass.id} className="border-b border-stone-200/70 px-4 py-3 last:border-b-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-800">{pass.name}</p>
                  <p className="mt-0.5 text-xs text-stone-500">{pass.description}</p>
                </div>
                {running ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-stone-600">
                    <span
                      className="h-3 w-3 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700"
                      aria-hidden="true"
                    />
                    {runningSince === null ? null : <ElapsedTimer since={runningSince} />}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!pass.enabled || runningPassId !== null}
                    onClick={() => onRun(pass.id)}
                    className="shrink-0 rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Run
                  </button>
                )}
              </div>
              {!pass.enabled && (
                <p className="mt-1 text-xs italic text-stone-400">Disabled.</p>
              )}
              {lastRunReport !== null && lastRunReport.passId === pass.id && (
                <p className="mt-1 text-xs text-stone-500">
                  {lastRunReport.droppedAnchors === 0
                    ? "No Findings dropped outside the target."
                    : `${lastRunReport.droppedAnchors} Anchor${lastRunReport.droppedAnchors === 1 ? "" : "s"} dropped outside the target.`}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The elapsed time of an in-flight Run, refreshed while it runs. */
function ElapsedTimer({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = globalThis.setInterval(() => setNow(Date.now()), 100);
    return () => globalThis.clearInterval(interval);
  }, []);

  return <span className="tabular-nums">{((now - since) / 1000).toFixed(1)}s</span>;
}
