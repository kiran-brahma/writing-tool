import { afterEach, describe, expect, it } from "vitest";
import { openObelusDatabase, type ObelusDatabase } from "./obelusDatabase";
import { loadScreeningFrame, saveScreeningFrame } from "./settings";

const openedDatabases: ObelusDatabase[] = [];

function uniqueName(): string {
  return `obelus-settings-${crypto.randomUUID()}`;
}

async function openTestDatabase(): Promise<ObelusDatabase> {
  const database = await openObelusDatabase(uniqueName());
  openedDatabases.push(database);
  return database;
}

afterEach(async () => {
  for (const database of openedDatabases.splice(0)) database.close();
});

describe("the Screening frame setting", () => {
  it("is on by default", async () => {
    const database = await openTestDatabase();

    await expect(loadScreeningFrame(database)).resolves.toBe(true);
  });

  it("persists the Writer's choice", async () => {
    const database = await openTestDatabase();

    await saveScreeningFrame(database, false);
    await expect(loadScreeningFrame(database)).resolves.toBe(false);

    await saveScreeningFrame(database, true);
    await expect(loadScreeningFrame(database)).resolves.toBe(true);
  });
});
