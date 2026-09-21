import { useMemo } from "react";
import type { DocTree } from "../core/docTree";
import { documentMetrics, paragraphShapeMetrics } from "../core/metrics";

/**
 * Story 31: sentence length, its variance and adverb density, so a monotone
 * rhythm is visible rather than felt. Story 141 adds A3 uniform paragraph shape
 * as a metric — the longest run of Paragraphs sharing a sentence count — so a
 * monotone paragraph rhythm is visible too. Everything here is derived on every
 * keystroke; it is free, local and deterministic, while the Findings the panel
 * sits beside refresh on save.
 *
 * A3 reads the Document tree rather than the canonical string, because block
 * structure is the tree's to know; the rest of the metrics read the string.
 */
export function MetricsPanel({ canonical, tree }: { canonical: string; tree: DocTree }) {
  const metrics = useMemo(() => documentMetrics(canonical), [canonical]);
  const shape = useMemo(() => paragraphShapeMetrics(tree), [tree]);

  return (
    <section className="border-b border-stone-200 px-4 py-3">
      <h2 className="text-sm font-semibold">Rhythm</h2>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <Metric label="Sentences" value={String(metrics.sentenceCount)} />
        <Metric label="Avg length" value={format(metrics.meanSentenceLength)} />
        <Metric label="Length variance" value={format(metrics.sentenceLengthVariance)} />
        <Metric label="Longest" value={`${metrics.longestSentence} words`} />
        <Metric label="Adverbs" value={`${format(metrics.adverbDensity)} / 100 words`} />
        <Metric
          label="Uniform paragraphs"
          value={`${shape.longestUniformParagraphRun} in a row`}
        />
      </dl>
      <ChipRow label="Sentence lengths" values={metrics.sentenceLengths} />
      <ChipRow label="Paragraph sentence counts" values={shape.paragraphSentenceCounts} />
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

/** One labelled strip of per-sentence or per-paragraph numbers. */
function ChipRow({ label, values }: { label: string; values: number[] }) {
  return (
    <div className="mt-2">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 flex flex-wrap gap-1">
        {values.length === 0 ? (
          <span className="text-xs text-stone-400">—</span>
        ) : (
          values.map((value, index) => (
            <span
              key={index}
              className="rounded bg-stone-200 px-1.5 py-0.5 font-mono text-[10px] text-stone-700"
            >
              {value}
            </span>
          ))
        )}
      </p>
    </div>
  );
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
