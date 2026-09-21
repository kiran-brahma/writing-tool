import { parsePriceTable, type PriceTable } from "../core/cost";
import type { ObelusDatabase } from "./obelusDatabase";

/**
 * Story 51: the editable per-model price table, persisted as one settings row.
 * The Core module owns the arithmetic; this is only where the Writer's edits
 * live. An unknown or malformed stored value normalizes to an empty table, so a
 * corrupt row cannot make the estimate throw.
 */
export const PRICE_TABLE_SETTING_KEY = "priceTable";

export async function loadPriceTable(database: ObelusDatabase): Promise<PriceTable> {
  const record = await database.settings.get(PRICE_TABLE_SETTING_KEY);
  return normalizePriceTable(record?.value);
}

export async function savePriceTable(
  database: ObelusDatabase,
  table: PriceTable,
): Promise<PriceTable> {
  const normalized = normalizePriceTable(table);
  await database.settings.put({ key: PRICE_TABLE_SETTING_KEY, value: normalized });
  return normalized;
}

/** A price table from the stored value, dropping anything that is not a price. */
export function normalizePriceTable(value: unknown): PriceTable {
  if (typeof value === "string") return parsePriceTable(value);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

  const table: PriceTable = {};
  for (const [model, price] of Object.entries(value)) {
    if (model !== "" && typeof price === "number" && Number.isFinite(price) && price >= 0) {
      table[model] = price;
    }
  }
  return table;
}
