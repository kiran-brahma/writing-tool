import { useEffect, useState } from "react";
import type { CostEstimate } from "../core/cost";
import type { RunReport } from "../core/critique";
import { isFindingsPass, structuralPasses, type Pass } from "../core/pass";
import { QuarantinedRewrite, StruckViolations } from "./ViolationDisplay";
import { splitViolations } from "./violationMarks";

/**
 * The model-Pass panel. One Pass runs on demand: a local Pass against the
 * Target Paragraph the cursor is in, a structural Pass against the whole
 * Document. "Run structural set" runs every enabled structural Pass in one
 * action. The Run shows a spinner and an elapsed timer rather than a half-parsed
 * object, because there is no streaming in v1. When Containment drops an Anchor
 * the count is shown here, so the Writer knows the model tried to speak about
 * text it was not asked about.
 *
 * Only `findings`-output Passes appear here: a Reader pass returns a Reader
 * account and an Audit pass returns an Audit account, and each has its own tab.
 * Listing one here would offer a Run whose output this panel cannot show.
 *
 * The global run settings — the Screening frame, the character limit and the
 * price table — live in the AI Settings view, so this panel stays about running
 * Passes and reading their output.
 */
export interface ModelPassesPanelProps {
  passes: Pass[];
  runningPassId: string | null;
  /** True while the structural set is working; every Run control is held. */
  structuralRunning: boolean;
  runningSince: number | null;
  lastRunReport: RunReport | null;
  runError: string | null;
  criticName: string | null;
  /** Story 50: the length of the current Document's canonical string. */
  documentLength: number;
  /** Story 50: past this many characters a structural Run is chunked. */
  characterLimit: number;
  /** Story 50: how many chunks a document-scope Run would make; 1 when it fits. */
  chunkCount: number;
  /** Story 51: the pre-run estimate for each Findings pass, keyed by Pass id. */
  estimates: Record<string, CostEstimate>;
  /** Story 52: this session's accumulated model-Run cost. */
  sessionCost: number;
  onRun: (passId: string) => void;
  /** Story 37: run every enabled document-scope Pass in one action. */
  onRunStructural: () => void;
  /** Story 54: abort the running Pass. */
  onCancel: () => void;
  onToggle: (passId: string, enabled: boolean) => void;
}

export function ModelPassesPanel({
  passes,
  runningPassId,
  structuralRunning,
  runningSince,
  lastRunReport,
  runError,
  criticName,
  documentLength,
  characterLimit,
  chunkCount,
  estimates,
  sessionCost,
  onRun,
  onRunStructural,
  onCancel,
  onToggle,
}: ModelPassesPanelProps) {
  const modelPasses = passes.filter((pass) => pass.kind === "model" && isFindingsPass(pass));
  const hasStructuralPasses = structuralPasses(passes).length > 0;
  const busy = runningPassId !== null || structuralRunning;
  const pastLimit = hasStructuralPasses && documentLength > characterLimit;
  return (
    <section className="border-t border-stone-300">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2">
        <h2 className="text-sm font-semibold">Model passes</h2>
        <span className="text-xs text-stone-500">
          {criticName === null ? "No critic assigned" : `Critic: ${criticName}`}
        </span>
      </div>

      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-1.5 text-xs text-stone-600">
        <span>This session</span>
        <span className="tabular-nums">{formatUsd(sessionCost)}</span>
      </div>

      <div className="border-b border-stone-200 px-4 py-2">
        <button
          type="button"
          onClick={onRunStructural}
          disabled={!hasStructuralPasses || busy}
          title={
            hasStructuralPasses
              ? "Run every enabled document-scope Pass"
              : "Enable a structural Pass first"
          }
          className="w-full rounded border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {structuralRunning ? "Running structural set…" : "Run structural set"}
        </button>
      </div>

      {busy && (
        <div className="border-b border-stone-200 px-4 py-2">
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            Cancel run
          </button>
        </div>
      )}

      {pastLimit && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          This Document is {documentLength.toLocaleString()} characters, past the{" "}
          {characterLimit.toLocaleString()} character limit for a single call.{" "}
          {chunkCount > 1
            ? `Structural Passes will run in ${chunkCount} overlapping chunks — Section by ` +
              "Section where the Document has headings — so the whole piece is still examined."
            : "It has no Section or Paragraph boundary to split on, so a structural Pass will " +
              "be sent as one call."}
        </p>
      )}

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
          const report = lastRunReport?.passId === pass.id ? lastRunReport : null;
          const estimate = estimates[pass.id];
          const { strikes, rewrites } = splitViolations(report?.violations ?? []);
          return (
            <li key={pass.id} className="border-b border-stone-200/70 px-4 py-3 last:border-b-0">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={pass.enabled}
                  aria-label={`Enable ${pass.name}`}
                  onChange={(event) => onToggle(pass.id, event.target.checked)}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      pass.enabled
                        ? "text-sm font-medium text-stone-800"
                        : "text-sm font-medium text-stone-400"
                    }
                  >
                    {pass.name}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">{pass.description}</p>
                  {estimate !== undefined && (
                    <p className="mt-0.5 text-[11px] text-stone-400">
                      {estimate.tokens.toLocaleString()} tokens estimated · {formatUsd(estimate.costUsd)}
                    </p>
                  )}
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
                    disabled={!pass.enabled || busy}
                    onClick={() => onRun(pass.id)}
                    className="shrink-0 rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Run
                  </button>
                )}
              </div>
              {!pass.enabled && (
                <p className="mt-1 pl-6 text-xs italic text-stone-400">Disabled.</p>
              )}
              {report !== null && (
                <>
                  <p className="mt-1 text-xs text-stone-500">
                    {report.fromCache && "Served from the cache; no Provider call. "}
                    {report.droppedAnchors === 0
                      ? "No Findings dropped outside the target."
                      : `${report.droppedAnchors} Anchor${report.droppedAnchors === 1 ? "" : "s"} dropped outside the target.`}
                    {report.chunks > 1 &&
                      ` Ran in ${report.chunks} overlapping chunks.`}
                  </p>
                  {strikes.length > 0 && (
                    <p className="mt-1 text-xs text-stone-500">
                      Model drift, struck through rather than hidden:{" "}
                      <StruckViolations violations={strikes} />
                    </p>
                  )}
                  {rewrites.length > 0 && <QuarantinedRewrite violations={rewrites} />}
                </>
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

/** A US dollar figure, with enough precision to show a sub-cent estimate. */
function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}
