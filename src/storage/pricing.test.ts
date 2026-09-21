import { afterEach, describe, expect, it } from "vitest";
import { openObelusDatabase, type ObelusDatabase } from "./obelusDatabase";
import { loadPriceTable, normalizePriceTable, savePriceTable } from "./pricing";

const openedDatabases: ObelusDatabase[] = [];

async function openTestDatabase(): Promise<ObelusDatabase> {
  const database = await openObelusDatabase(`obelus-pricing-${crypto.randomUUID()}`);
  openedDatabases.push(database);
  return database;
}

afterEach(async () => {
  for (const database of openedDatabases.splice(0)) database.close();
});

describe("the price table setting", () => {
  it("starts empty and round-trips the Writer's edits", async () => {
    const database = await openTestDatabase();
    await expect(loadPriceTable(database)).resolves.toEqual({});

    await savePriceTable(database, { "gpt-4o": 5, "claude-3-5-sonnet": 3 });

    await expect(loadPriceTable(database)).resolves.toEqual({
      "gpt-4o": 5,
      "claude-3-5-sonnet": 3,
    });
  });

  it("normalizes a stored value that is not a usable table", () => {
    expect(normalizePriceTable(undefined)).toEqual({});
    expect(normalizePriceTable("gpt-4o = 5")).toEqual({ "gpt-4o": 5 });
    expect(normalizePriceTable({ "gpt-4o": 5, bad: "free", neg: -1 })).toEqual({ "gpt-4o": 5 });
  });
});
