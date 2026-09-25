import type { Pass } from "./pass";
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
  /**
   * Story 188: whether the price table carries a price for the model. When false,
   * the control displays cost as unknown rather than $0.00.
   */
  costKnown: boolean;
}

export interface StructuralCostEstimate {
  /** The characters across all qualifying passes and chunks. */
  characters: number;
  /** The summed tokens across all qualifying passes and chunks. */
  tokens: number;
  /** Tokens at the model's price, in US dollars. */
  costUsd: number;
  /** Whether the price table carries a price for the model. */
  costKnown: boolean;
  /** How many enabled document-scope passes contributed to the sum. */
  passCount: number;
  /** The chunk count used. */
  chunks: number;
}

/** The spec's token estimate for a Run's characters. */
export function estimateTokens(characters: number): number {
  if (!Number.isFinite(characters) || characters <= 0) return 0;
  return Math.ceil(characters / 4);
}

/**
 * Whether the price table has an entry pricing the model. An exact match
 * wins; otherwise the longest key the model id starts with (at a separator)
 * is used. When no matching entry exists, returns false.
 */
export function hasPriceFor(model: string, prices: PriceTable): boolean {
  if (model === "") return false;
  const exact = prices[model];
  if (typeof exact === "number" && Number.isFinite(exact)) return true;

  let best: string | null = null;
  for (const key of Object.keys(prices)) {
    if (key === "" || !model.startsWith(key)) continue;
    const next = model.charAt(key.length);
    if (next !== "" && !"-.:/".includes(next)) continue;
    if (best === null || key.length > best.length) best = key;
  }
  const price = best === null ? undefined : prices[best];
  return typeof price === "number" && Number.isFinite(price);
}

export const isPriceKnown = hasPriceFor;

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
  return {
    characters: safeCharacters,
    tokens,
    costUsd: costForTokens(tokens, model, prices),
    costKnown: hasPriceFor(model, prices),
  };
}

function isStructuralPass(pass: Pass): boolean {
  if (pass.enabled === false) return false;
  if (pass.scope !== "document") return false;
  if (pass.kind !== undefined && pass.kind !== "model") return false;
  if (pass.output !== undefined && pass.output !== "findings") return false;
  return true;
}

/**
 * Story 189: the summed estimate for the structural set before it is run. Sums
 * over exactly the enabled document-scope model Passes it will execute,
 * multiplied by the chunk count it will actually use.
 */
export function estimateStructuralCost(
  passes: Pass[],
  characters: number | Record<string, number>,
  model: string,
  prices: PriceTable,
  chunkCount: number = 1,
): StructuralCostEstimate {
  const safeChunks = Number.isFinite(chunkCount) && chunkCount > 1 ? Math.floor(chunkCount) : 1;
  const known = hasPriceFor(model, prices);

  let totalCharacters = 0;
  let totalTokens = 0;
  let passCount = 0;

  for (const pass of passes) {
    if (!isStructuralPass(pass)) continue;

    passCount++;
    const rawChars = typeof characters === "number" ? characters : (characters[pass.id] ?? 0);
    const safeChars = Number.isFinite(rawChars) && rawChars > 0 ? rawChars : 0;
    const tokensPerChunk = estimateTokens(safeChars);
    totalCharacters += safeChars * safeChunks;
    totalTokens += tokensPerChunk * safeChunks;
  }

  const costUsd = costForTokens(totalTokens, model, prices);

  return {
    characters: totalCharacters,
    tokens: totalTokens,
    costUsd,
    costKnown: known,
    passCount,
    chunks: safeChunks,
  };
}

export const estimateStructuralSetCost = estimateStructuralCost;
export const sumStructuralCost = estimateStructuralCost;

/**
 * A US dollar figure for an estimate or session total. Sub-cent figures keep
 * four decimals so a cheap estimate never reads as `$0.00`; zero and anything
 * not finite read as `$0.00`.
 */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

/**
 * Formats a pre-run cost estimate for display beside or on a Run control.
 * When the price is not configured in the price table, reports that the cost
 * is unknown rather than displaying $0.00 (story 188, 189).
 */
export function formatCostEstimate(
  estimate: { costUsd: number; costKnown: boolean } | undefined,
): string {
  if (estimate === undefined) return "";
  if (!estimate.costKnown) return "cost unknown";
  return formatUsd(estimate.costUsd);
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
