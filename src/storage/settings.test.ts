import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CHARACTER_LIMIT, MIN_CHARACTER_LIMIT } from "../core/chunking";
import { openObelusDatabase, type ObelusDatabase } from "./obelusDatabase";
import {
  CHARACTER_LIMIT_SETTING_KEY,
  FIRST_RUN_NOTE_SETTING_KEY,
  RAIL_BAND_SETTING_KEY,
  RAIL_COLLAPSED_SETTING_KEY,
  VOICE_LIST_SETTING_KEY,
  loadCharacterLimit,
  loadFirstRunNoteDismissed,
  loadRailBand,
  loadRailCollapsed,
  loadScreeningFrame,
  loadVoiceList,
  saveCharacterLimit,
  saveFirstRunNoteDismissed,
  saveRailBand,
  saveRailCollapsed,
  saveScreeningFrame,
  saveVoiceList,
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

describe("the Voice list setting", () => {
  it("defaults to the empty list", async () => {
    const database = await openTestDatabase();

    await expect(loadVoiceList(database)).resolves.toEqual([]);
  });

  it("persists the Writer's words and phrases, normalised", async () => {
    const database = await openTestDatabase();

    await expect(saveVoiceList(database, [" leverage ", "", "leverage", "at its core"])).resolves
      .toEqual(["leverage", "at its core"]);
    await expect(loadVoiceList(database)).resolves.toEqual(["leverage", "at its core"]);
  });

  it("reads a stored value that is not an array as the empty list", async () => {
    const database = await openTestDatabase();
    await database.settings.put({ key: VOICE_LIST_SETTING_KEY, value: "leverage" });

    await expect(loadVoiceList(database)).resolves.toEqual([]);
  });
});

describe("the rail Band setting", () => {
  it("opens on Structure when no Band is stored", async () => {
    const database = await openTestDatabase();

    await expect(loadRailBand(database)).resolves.toBe("structure");
  });

  it("persists the Writer's last Band", async () => {
    const database = await openTestDatabase();

    await expect(saveRailBand(database, "word")).resolves.toBe("word");
    await expect(loadRailBand(database)).resolves.toBe("word");
  });

  it("falls back to Structure for a stored value that is not a Band", async () => {
    const database = await openTestDatabase();
    await database.settings.put({ key: RAIL_BAND_SETTING_KEY, value: "all" });

    await expect(loadRailBand(database)).resolves.toBe("structure");
  });
});

describe("the rail collapsed setting", () => {
  it("is open by default", async () => {
    const database = await openTestDatabase();

    await expect(loadRailCollapsed(database)).resolves.toBe(false);
  });

  it("persists the Writer's choice", async () => {
    const database = await openTestDatabase();

    await saveRailCollapsed(database, true);
    await expect(loadRailCollapsed(database)).resolves.toBe(true);

    await saveRailCollapsed(database, false);
    await expect(loadRailCollapsed(database)).resolves.toBe(false);
  });

  it("treats a stored value that is not true as open", async () => {
    const database = await openTestDatabase();
    await database.settings.put({ key: RAIL_COLLAPSED_SETTING_KEY, value: "yes" });

    await expect(loadRailCollapsed(database)).resolves.toBe(false);
  });
});

describe("the first-run note setting", () => {
  it("shows the note by default, so a new Writer meets it once", async () => {
    const database = await openTestDatabase();

    await expect(loadFirstRunNoteDismissed(database)).resolves.toBe(false);
  });

  it("round-trips the Writer's dismissal", async () => {
    const database = await openTestDatabase();

    await expect(saveFirstRunNoteDismissed(database, true)).resolves.toBe(true);
    await expect(loadFirstRunNoteDismissed(database)).resolves.toBe(true);

    await expect(saveFirstRunNoteDismissed(database, false)).resolves.toBe(false);
    await expect(loadFirstRunNoteDismissed(database)).resolves.toBe(false);
  });

  it("treats a stored value that is not true as not yet dismissed", async () => {
    const database = await openTestDatabase();
    await database.settings.put({ key: FIRST_RUN_NOTE_SETTING_KEY, value: "yes" });

    await expect(loadFirstRunNoteDismissed(database)).resolves.toBe(false);
  });
});
