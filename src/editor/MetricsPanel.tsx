import { useMemo } from "react";
import { documentMetrics } from "../core/metrics";

/**
 * Story 31: sentence length, its variance and adverb density, so a monotone
 * rhythm is visible rather than felt. The metrics are derived from the canonical
 * string on every keystroke — they are free, local and deterministic — while the
 * Findings they sit beside refresh on save.
 */
export function MetricsPanel({ canonical }: { canonical: string }) {
  const metrics = useMemo(() => documentMetrics(canonical), [canonical]);

  return (
    <section className="border-b border-stone-200 px-4 py-3">
      <h2 className="text-sm font-semibold">Rhythm</h2>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <Metric label="Sentences" value={String(metrics.sentenceCount)} />
        <Metric label="Avg length" value={format(metrics.meanSentenceLength)} />
        <Metric label="Length variance" value={format(metrics.sentenceLengthVariance)} />
        <Metric label="Longest" value={`${metrics.longestSentence} words`} />
        <Metric label="Adverbs" value={`${format(metrics.adverbDensity)} / 100 words`} />
      </dl>
      <div className="mt-2">
        <p className="text-xs text-stone-500">Sentence lengths</p>
        <p className="mt-1 flex flex-wrap gap-1">
          {metrics.sentenceLengths.length === 0 ? (
            <span className="text-xs text-stone-400">—</span>
          ) : (
            metrics.sentenceLengths.map((length, index) => (
              <span
                key={index}
                className="rounded bg-stone-200 px-1.5 py-0.5 font-mono text-[10px] text-stone-700"
              >
                {length}
              </span>
            ))
          )}
        </p>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-stone-500">{label}</dt>
      <dd className="font-medium text-stone-800">{value}</dd>
    </div>
  );
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
