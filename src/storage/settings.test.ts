import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CHARACTER_LIMIT, MIN_CHARACTER_LIMIT } from "../core/chunking";
import { openObelusDatabase, type ObelusDatabase } from "./obelusDatabase";
import {
  CHARACTER_LIMIT_SETTING_KEY,
  loadCharacterLimit,
  loadScreeningFrame,
  saveCharacterLimit,
  saveScreeningFrame,
} from "./settings";

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

describe("the character limit setting", () => {
  it("defaults to the Core limit so a Document is never silently unbounded", async () => {
    const database = await openTestDatabase();

    await expect(loadCharacterLimit(database)).resolves.toBe(DEFAULT_CHARACTER_LIMIT);
  });

  it("persists the Writer's limit", async () => {
    const database = await openTestDatabase();

    await expect(saveCharacterLimit(database, 20_000)).resolves.toBe(20_000);
    await expect(loadCharacterLimit(database)).resolves.toBe(20_000);
  });

  it("raises a limit below the floor to the floor rather than disabling chunking", async () => {
    const database = await openTestDatabase();

    await expect(saveCharacterLimit(database, 10)).resolves.toBe(MIN_CHARACTER_LIMIT);
    await expect(loadCharacterLimit(database)).resolves.toBe(MIN_CHARACTER_LIMIT);
  });

  it("falls back to the default for a stored value that is not a number", async () => {
    const database = await openTestDatabase();
    await database.settings.put({ key: CHARACTER_LIMIT_SETTING_KEY, value: "lots" });

    await expect(loadCharacterLimit(database)).resolves.toBe(DEFAULT_CHARACTER_LIMIT);
  });
});
