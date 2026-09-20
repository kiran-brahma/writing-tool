import { afterEach, describe, expect, it } from "vitest";
import { openObelusDatabase, type ObelusDatabase } from "./obelusDatabase";
import { loadOrCreatePasses, setPassEnabled, updateRuleConfig } from "./passes";

const openedDatabases: ObelusDatabase[] = [];

function uniqueName(): string {
  return `obelus-passes-${crypto.randomUUID()}`;
}

async function openTestDatabase(): Promise<ObelusDatabase> {
  const database = await openObelusDatabase(uniqueName());
  openedDatabases.push(database);
  return database;
}

afterEach(async () => {
  for (const database of openedDatabases.splice(0)) database.close();
});

describe("loadOrCreatePasses", () => {
  it("seeds the Starter pack on first open", async () => {
    const database = await openTestDatabase();

    const passes = await loadOrCreatePasses(database);

    expect(passes.map((pass) => pass.id)).toEqual([
      "hedges",
      "nominalizations",
      "openers",
      "wordiness",
      "repetition",
      "characters-actions",
      "topic-strings",
      "paragraph-reorder",
      "paragraph-unity",
      "cut-candidates",
      "cliche",
      "claim-strength",
      "reader",
    ]);
    expect(passes.filter((pass) => pass.kind === "rule").map((pass) => pass.id)).toEqual([
      "hedges",
      "nominalizations",
      "openers",
      "wordiness",
      "repetition",
    ]);
    expect(passes.filter((pass) => pass.kind === "model").map((pass) => pass.id)).toEqual([
      "characters-actions",
      "topic-strings",
      "paragraph-reorder",
      "paragraph-unity",
      "cut-candidates",
      "cliche",
      "claim-strength",
      "reader",
    ]);
  });

  it("keeps the Writer's edit on the next open", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);
    await setPassEnabled(database, "hedges", false);

    const passes = await loadOrCreatePasses(database);

    expect(passes.find((pass) => pass.id === "hedges")?.enabled).toBe(false);
  });

  it("introduces a Starter pass whose id is missing without touching the others", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);
    await setPassEnabled(database, "hedges", false);
    await database.passes.delete("wordiness");

    const passes = await loadOrCreatePasses(database);

    expect(passes.map((pass) => pass.id)).toContain("wordiness");
    expect(passes.find((pass) => pass.id === "hedges")?.enabled).toBe(false);
  });
});

describe("setPassEnabled", () => {
  it("stores the flag and returns the updated Pass", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);

    const updated = await setPassEnabled(database, "repetition", false);

    expect(updated?.enabled).toBe(false);
    await expect(database.passes.get("repetition")).resolves.toMatchObject({ enabled: false });
  });

  it("returns null for an id that is not stored", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);

    expect(await setPassEnabled(database, "missing", false)).toBeNull();
  });

  it("turns a model Pass on and off, and the flag survives a reload", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);

    // Characters and actions ships disabled (DESIGN §4).
    await expect(database.passes.get("characters-actions")).resolves.toMatchObject({
      enabled: false,
    });

    const enabled = await setPassEnabled(database, "characters-actions", true);
    expect(enabled?.enabled).toBe(true);

    const reloaded = await loadOrCreatePasses(database);
    expect(reloaded.find((pass) => pass.id === "characters-actions")?.enabled).toBe(true);

    const disabled = await setPassEnabled(database, "characters-actions", false);
    expect(disabled?.enabled).toBe(false);
  });
});

describe("updateRuleConfig", () => {
  it("replaces the word list behind a rule Pass", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);

    const updated = await updateRuleConfig(database, "hedges", { hedges: ["blatantly"] });

    expect(updated?.ruleConfig).toEqual({ hedges: ["blatantly"] });
    await expect(database.passes.get("hedges")).resolves.toMatchObject({
      ruleConfig: { hedges: ["blatantly"] },
    });
  });
});
