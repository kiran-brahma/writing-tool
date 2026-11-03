import { afterEach, describe, expect, it } from "vitest";
import type { Pass } from "../core/pass";
import { blankModelPass, HEDGES_PASS } from "../core/starterPasses";
import { openObelusDatabase, type ObelusDatabase } from "./obelusDatabase";
import {
  loadOrCreatePasses,
  replacePasses,
  restoreStarterPasses,
  savePass,
  setPassEnabled,
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
    expect(passes.filter((pass) => pass.kind === "rule").map((pass) => pass.id)).toEqual([
      "hedges",
      "wordiness",
      "repetition",
    ]);
    expect(passes.filter((pass) => pass.kind === "model").map((pass) => pass.id)).toEqual([
      "paragraph-unity",
      "cut-candidates",
      "claim-strength",
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

  it("refuses a stored Pack Pass whose output shape this build cannot run (story 158)", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);
    // A legacy row for a pass that still ships: the note shape was offered by
    // an older Obelus.
    await database.passes.put({
      ...HEDGES_PASS,
      output: "note",
    } as unknown as Pass);

    await expect(loadOrCreatePasses(database)).rejects.toBeInstanceOf(UnrunnablePassError);
    await expect(loadOrCreatePasses(database)).rejects.toThrow(/cannot run/i);
  });

  it("ignores a stored Pass that is no longer in the pack", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);
    await savePass(database, blankModelPass("old-custom-pass"));

    const passes = await loadOrCreatePasses(database);

    expect(passes.map((pass) => pass.id)).not.toContain("old-custom-pass");
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

    // The surviving model passes ship enabled; Review is what makes them run.
    await expect(database.passes.get("paragraph-unity")).resolves.toMatchObject({
      enabled: true,
    });

    const disabled = await setPassEnabled(database, "paragraph-unity", false);
    expect(disabled?.enabled).toBe(false);

    const reloaded = await loadOrCreatePasses(database);
    expect(reloaded.find((pass) => pass.id === "paragraph-unity")?.enabled).toBe(false);

    const reenabled = await setPassEnabled(database, "paragraph-unity", true);
    expect(reenabled?.enabled).toBe(true);
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

  it("keeps the Writer's edit when the Rule config is reloaded", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);
    await updateRuleConfig(database, "hedges", { hedges: ["blatantly"] });

    const passes = await loadOrCreatePasses(database);

    expect(passes.find((pass) => pass.id === "hedges")?.ruleConfig).toEqual({
      hedges: ["blatantly"],
    });
  });
});

describe("savePass", () => {
  it("stores a Pass the Writer wrote and returns it", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);
    const pass = { ...blankModelPass("my-pass"), name: "My Pass" };

    await savePass(database, pass);

    await expect(database.passes.get("my-pass")).resolves.toMatchObject({ name: "My Pass" });
  });

  it("replaces an edited Pass in place", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);
    const pass = blankModelPass("my-pass");
    await savePass(database, pass);

    await savePass(database, { ...pass, prompt: "A different prompt." });

    const stored = await database.passes.get("my-pass");
    expect(stored?.prompt).toBe("A different prompt.");
  });
});

describe("replacePasses", () => {
  it("replaces the whole set in one write", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);

    await replacePasses(database, [blankModelPass("only-pass")]);

    const stored = await database.passes.toArray();
    expect(stored.map((pass) => pass.id)).toEqual(["only-pass"]);
  });
});

describe("restoreStarterPasses", () => {
  it("brings the Starter pack back over the Writer's edits", async () => {
    const database = await openTestDatabase();
    await loadOrCreatePasses(database);
    await setPassEnabled(database, "hedges", false);
    await savePass(database, blankModelPass("my-pass"));

    await restoreStarterPasses(database);
    const passes = await loadOrCreatePasses(database);

    expect(passes.map((pass) => pass.id)).not.toContain("my-pass");
    expect(passes.find((pass) => pass.id === "hedges")?.enabled).toBe(true);
  });
});
