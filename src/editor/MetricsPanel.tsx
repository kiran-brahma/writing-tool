import { useMemo } from "react";
import type { DocTree } from "../core/docTree";
import { documentMetrics, paragraphShapeMetrics } from "../core/metrics";
import { PANEL_GLOSSES, type HelpSectionId } from "../help/helpContent";

/**
 * Story 31: sentence length, its variance and adverb density, so a monotone
 * rhythm is visible rather than felt. Story 141 adds A3 uniform paragraph shape
 * as a metric — the longest run of Paragraphs sharing a sentence count — so a
 * monotone paragraph rhythm is visible too. Story 143 adds be-verb, preposition
 * and abstract-noun density, the deterministic diagnostic set. Everything here
 * is derived on every keystroke; it is free, local and deterministic, while the
 * Findings the panel sits beside refresh on save.
 *
 * A metric is a signal, not a verdict: no row has a threshold, a colour or a
 * gate. A3 reads the Document tree rather than the canonical string, because
 * block structure is the tree's to know; the rest of the metrics read the string.
 */
export function MetricsPanel({
  canonical,
  tree,
  onOpenHelp,
}: {
  canonical: string;
  tree: DocTree;
  onOpenHelp?: (sectionId: HelpSectionId) => void;
}) {
  const metrics = useMemo(() => documentMetrics(canonical), [canonical]);
  const shape = useMemo(() => paragraphShapeMetrics(tree), [tree]);

  return (
    <section className="border-b border-rule-soft px-4 py-3">
      <h2 className="text-base font-semibold">Rhythm</h2>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <Metric label="Sentences" value={String(metrics.sentenceCount)} />
        <Metric label="Avg length" value={format(metrics.meanSentenceLength)} />
        <Metric label="Length variance" value={format(metrics.sentenceLengthVariance)} />
        <Metric label="Longest" value={`${metrics.longestSentence} words`} />
        <Metric label="Adverbs" value={`${format(metrics.adverbDensity)} / 100 words`} />
        <Metric label="Be-verbs" value={`${format(metrics.beVerbDensity)} / 100 words`} />
        <Metric
          label="Prepositions"
          value={`${format(metrics.prepositionDensity)} / 100 words`}
        />
        <Metric
          label="Abstract nouns"
          value={`${format(metrics.abstractNounDensity)} / 100 words`}
        />
        <Metric
          label="Uniform paragraphs"
          value={`${shape.longestUniformParagraphRun} in a row`}
        />
      </dl>
      <p className="mt-2 text-xs text-muted-ink">
        {PANEL_GLOSSES.metrics.text}{" "}
        <button
          type="button"
          onClick={() => onOpenHelp?.(PANEL_GLOSSES.metrics.sectionId)}
          className="rounded px-0.5 underline hover:text-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          How this works
        </button>
      </p>
      <ChipRow label="Sentence lengths" values={metrics.sentenceLengths} />
      <ChipRow label="Paragraph sentence counts" values={shape.paragraphSentenceCounts} />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-ink">{label}</dt>
      <dd className="font-medium text-soft-ink">{value}</dd>
    </div>
  );
}

/** One labelled strip of per-sentence or per-paragraph numbers. */
function ChipRow({ label, values }: { label: string; values: number[] }) {
  return (
    <div className="mt-2">
      <p className="text-xs text-muted-ink">{label}</p>
      <p className="mt-1 flex flex-wrap gap-1">
        {values.length === 0 ? (
          <span className="text-xs text-muted-ink">—</span>
        ) : (
          values.map((value, index) => (
            <span
              key={index}
              className="rounded bg-sunk-strong px-1.5 py-0.5 font-mono text-xs text-quiet-ink"
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
