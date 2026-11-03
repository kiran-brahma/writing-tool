import { afterEach, describe, expect, it } from "vitest";
import type { ColorSchemeSetting } from "../core/colorScheme";
import { openObelusDatabase, type ObelusDatabase } from "./obelusDatabase";
import {
  loadColorScheme,
  loadFirstRunNoteDismissed,
  loadRailCollapsed,
  saveColorScheme,
  saveFirstRunNoteDismissed,
  saveRailCollapsed,
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

describe("the rail's collapsed preference", () => {
  it("is open by default and persists a collapse", async () => {
    const database = await openTestDatabase();
    await expect(loadRailCollapsed(database)).resolves.toBe(false);

    await saveRailCollapsed(database, true);
    await expect(loadRailCollapsed(database)).resolves.toBe(true);
  });
});

describe("the first-run note", () => {
  it("is shown by default and persists a dismissal", async () => {
    const database = await openTestDatabase();
    await expect(loadFirstRunNoteDismissed(database)).resolves.toBe(false);

    await saveFirstRunNoteDismissed(database, true);
    await expect(loadFirstRunNoteDismissed(database)).resolves.toBe(true);
  });
});

describe("the colour scheme", () => {
  it("defaults to System and round-trips Light and Dark", async () => {
    const database = await openTestDatabase();
    await expect(loadColorScheme(database)).resolves.toBe("system");

    for (const scheme of ["light", "dark"] as ColorSchemeSetting[]) {
      await saveColorScheme(database, scheme);
      await expect(loadColorScheme(database)).resolves.toBe(scheme);
    }
  });
});
