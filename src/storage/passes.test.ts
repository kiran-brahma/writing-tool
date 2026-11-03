import { afterEach, describe, expect, it } from "vitest";
import type { Pass } from "../core/pass";
import { blankModelPass, HEDGES_PASS } from "../core/starterPasses";
import { openObelusDatabase, type ObelusDatabase } from "./obelusDatabase";
import {
  loadOrCreatePasses,
  restoreStarterPasses,
  UnrunnablePassError,
  updateRuleConfig,
} from "./passes";

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
      "wordiness",
      "repetition",
      "paragraph-unity",
      "cut-candidates",
      "claim-strength",
    ]);
    expect(passes.filter((pass) => pass.kind === "rule")).toHaveLength(3);
    expect(passes.filter((pass) => pass.kind === "model")).toHaveLength(3);
  });

  it("keeps the Writer's rule-word edit on the next open", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);
    await updateRuleConfig(database, "hedges", { hedges: ["blatantly"] });

    const passes = await loadOrCreatePasses(database);

    expect(passes.find((pass) => pass.id === "hedges")?.ruleConfig).toEqual({
      hedges: ["blatantly"],
    });
  });

  it("forces a surviving rule pass on, whatever an old toggle stored", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);
    await database.passes.put({ ...HEDGES_PASS, enabled: false });

    const passes = await loadOrCreatePasses(database);

    expect(passes.find((pass) => pass.id === "hedges")?.enabled).toBe(true);
  });

  it("introduces a Starter pass whose id is missing without touching the others", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);
    await updateRuleConfig(database, "hedges", { hedges: ["blatantly"] });
    await database.passes.delete("wordiness");

    const passes = await loadOrCreatePasses(database);

    expect(passes.map((pass) => pass.id)).toContain("wordiness");
    expect(passes.find((pass) => pass.id === "hedges")?.ruleConfig).toEqual({
      hedges: ["blatantly"],
    });
  });

  it("refuses a stored Pack Pass whose output shape this build cannot run (story 158)", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);
    await database.passes.put({ ...HEDGES_PASS, output: "note" } as unknown as Pass);

    await expect(loadOrCreatePasses(database)).rejects.toBeInstanceOf(UnrunnablePassError);
    await expect(loadOrCreatePasses(database)).rejects.toThrow(/cannot run/i);
  });

  it("ignores a stored Pass outside the pack and leaves the row in place", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);
    await database.passes.put(blankModelPass("old-custom-pass"));

    const passes = await loadOrCreatePasses(database);

    expect(passes.map((pass) => pass.id)).not.toContain("old-custom-pass");
    await expect(database.passes.get("old-custom-pass")).resolves.toBeDefined();
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

describe("restoreStarterPasses", () => {
  it("brings the Starter pack back over the Writer's edits", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);
    await database.passes.put({ ...HEDGES_PASS, enabled: false });
    await database.passes.put(blankModelPass("my-pass"));

    await restoreStarterPasses(database);
    const passes = await loadOrCreatePasses(database);

    expect(passes.map((pass) => pass.id)).not.toContain("my-pass");
    expect(passes.find((pass) => pass.id === "hedges")?.enabled).toBe(true);
  });
});
