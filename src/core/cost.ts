import type { ModelUsage } from "../wire/modelRequest";

/**
 * The cost estimate and the running session total. Both are arithmetic over the
 * editable per-model price table and the characters a Run will send: DESIGN §5
 * fixes the estimate at `characters ÷ 4` tokens times a per-model price, and
 * story 52 sums the same figure across Runs for the session.
 *
 * The estimate is always shown and never blocks: an unknown model has a price
 * of zero, which yields a zero estimate rather than refusing the Run. When a
 * Provider reports token usage, the session total uses it; when it does not, it
 * falls back to the estimate.
 */

/**
 * The Writer's editable price table: a model id to US dollars per one million
 * tokens. A single blended rate is what the spec's `characters ÷ 4 ... times an
 * editable per-model price table` describes; it is an estimate, not billing.
 */
export type PriceTable = Record<string, number>;

export interface CostEstimate {
  /** The characters the estimate was derived from. */
  characters: number;
  /** `ceil(characters / 4)`, the spec's token estimate. */
  tokens: number;
  /** Tokens at the model's price, in US dollars. */
  costUsd: number;
}

/** The spec's token estimate for a Run's characters. */
export function estimateTokens(characters: number): number {
  if (!Number.isFinite(characters) || characters <= 0) return 0;
  return Math.ceil(characters / 4);
}

/**
 * The price for a model, or zero when the table has no entry. An exact model id
 * wins; otherwise the longest key the model id starts with is used, so a table
 * row for `gpt-4o` prices a versioned `gpt-4o-2024-08-06` without the Writer
 * having to list every snapshot.
 */
export function priceFor(model: string, prices: PriceTable): number {
  const exact = prices[model];
  if (typeof exact === "number" && Number.isFinite(exact)) return exact;

  let best: string | null = null;
  for (const key of Object.keys(prices)) {
    if (key === "" || !model.startsWith(key)) continue;
    // The prefix must end at a separator, so a `gpt-4` row does not price a
    // `gpt-4o` model (and vice versa).
    const next = model.charAt(key.length);
    if (next !== "" && !"-.:/".includes(next)) continue;
    if (best === null || key.length > best.length) best = key;
  }
  const price = best === null ? undefined : prices[best];
  return typeof price === "number" && Number.isFinite(price) ? price : 0;
}

/** The dollar cost of a token count at a model's price. */
function costForTokens(tokens: number, model: string, prices: PriceTable): number {
  return (tokens / 1_000_000) * priceFor(model, prices);
}

/** A pre-run estimate: the token count and what it costs at the model's price. */
export function estimateRunCost(
  characters: number,
  model: string,
  prices: PriceTable,
): CostEstimate {
  const safeCharacters = Number.isFinite(characters) && characters > 0 ? characters : 0;
  const tokens = estimateTokens(safeCharacters);
  return { characters: safeCharacters, tokens, costUsd: costForTokens(tokens, model, prices) };
}

/**
 * What a completed Run added to the session total. A cache hit costs nothing,
 * so it adds zero even if the stored result carries the original Provider's
 * usage. A Provider-reported usage is summed and priced; without one the Run's
 * characters are priced with the same estimate the Writer saw before running.
 */
export function costForRun(
  result: { fromCache: boolean; usage?: ModelUsage },
  characters: number,
  model: string,
  prices: PriceTable,
): number {
  if (result.fromCache) return 0;

  const usage = result.usage;
  const tokens =
    usage !== undefined && (usage.inputTokens !== undefined || usage.outputTokens !== undefined)
      ? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
      : estimateTokens(characters);
  return costForTokens(tokens, model, prices);
}

/** The session total after one Run: the previous total plus what the Run cost. */
export function addRunCost(
  total: number,
  result: { fromCache: boolean; usage?: ModelUsage },
  characters: number,
  model: string,
  prices: PriceTable,
): number {
  return total + costForRun(result, characters, model, prices);
}

/**
 * The table the Writer edits, as text: one `model = dollars` line per entry. A
 * line without `=`, or a price that is not a finite number, is dropped rather
 * than guessed at. This is the round-trip the Workbench editor uses.
 */
export function parsePriceTable(text: string): PriceTable {
  const table: PriceTable = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const model = line.slice(0, separator).trim();
    const price = Number(line.slice(separator + 1).trim());
    if (model === "" || !Number.isFinite(price) || price < 0) continue;
    table[model] = price;
  }
  return table;
}

/** The price table as the text the editor shows, deterministically ordered. */
export function serializePriceTable(table: PriceTable): string {
  return Object.keys(table)
    .sort()
    .map((model) => `${model} = ${table[model]}`)
    .join("\n");
}
