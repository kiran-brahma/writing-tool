import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCustomConnection, type Connection } from "../wire/connection";
import {
  assignSlot,
  defaultJudgeConnection,
  loadOrCreateConnections,
  loadSlots,
  removeConnection,
  saveConnection,
} from "./connections";
import { openObelusDatabase, type ObelusDatabase } from "./obelusDatabase";
import { clearAllSessionKeys } from "./sessionKeys";

const openedDatabases: ObelusDatabase[] = [];

function uniqueName(): string {
  return `obelus-connections-${crypto.randomUUID()}`;
}

async function openTestDatabase(): Promise<ObelusDatabase> {
  const database = await openObelusDatabase(uniqueName());
  openedDatabases.push(database);
  return database;
}

function find(connections: Connection[], id: string): Connection {
  const connection = connections.find((entry) => entry.id === id);
  if (connection === undefined) throw new Error(`No Connection "${id}"`);
  return connection;
}

beforeEach(() => {
  clearAllSessionKeys();
});

afterEach(async () => {
  clearAllSessionKeys();
  vi.unstubAllGlobals();
  for (const database of openedDatabases.splice(0)) database.close();
});

describe("loading Connections", () => {
  it("seeds the five prefills on first open and makes no outbound request (story 110)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const database = await openTestDatabase();
    const connections = await loadOrCreateConnections(database);

    expect(connections.map((connection) => connection.id)).toEqual([
      "openai",
      "anthropic",
      "gemini",
      "openrouter",
      "ollama",
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not reseed or reorder on a second load", async () => {
    const database = await openTestDatabase();
    const first = await loadOrCreateConnections(database);
    const second = await loadOrCreateConnections(database);

    expect(second.map((connection) => connection.id)).toEqual([
      "openai",
      "anthropic",
      "gemini",
      "openrouter",
      "ollama",
    ]);
    expect(second).toEqual(first);
    expect(await database.connections.count()).toBe(5);
  });
});

describe("key storage (stories 11–12)", () => {
  it("persists a key in this browser for a persisted Connection", async () => {
    const database = await openTestDatabase();
    const [openai] = await loadOrCreateConnections(database);
    if (openai === undefined) throw new Error("missing openai");

    await saveConnection(database, { ...openai, apiKey: "sk-persisted", model: "gpt-x" });
    clearAllSessionKeys();
    const reloaded = find(await loadOrCreateConnections(database), "openai");

    expect(reloaded.apiKey).toBe("sk-persisted");
    expect(reloaded.model).toBe("gpt-x");
    await expect(database.connections.get("openai")).resolves.toMatchObject({
      apiKey: "sk-persisted",
    });
  });

  it("never writes a session-only key, and a reload loses it", async () => {
    const database = await openTestDatabase();
    const [openai] = await loadOrCreateConnections(database);
    if (openai === undefined) throw new Error("missing openai");

    await saveConnection(database, { ...openai, keyMode: "session", apiKey: "sk-session" });

    // In memory, and blank in the store.
    expect(find(await loadOrCreateConnections(database), "openai").apiKey).toBe("sk-session");
    await expect(database.connections.get("openai")).resolves.toMatchObject({ apiKey: "" });

    // A reload empties the session store; the key is gone.
    clearAllSessionKeys();
    expect(find(await loadOrCreateConnections(database), "openai").apiKey).toBe("");
  });

  it("moves a key between modes without disagreement", async () => {
    const database = await openTestDatabase();
    const [openai] = await loadOrCreateConnections(database);
    if (openai === undefined) throw new Error("missing openai");

    await saveConnection(database, { ...openai, apiKey: "sk-first", keyMode: "persisted" });
    await saveConnection(database, { ...openai, apiKey: "sk-first", keyMode: "session" });
    await expect(database.connections.get("openai")).resolves.toMatchObject({ apiKey: "" });

    await saveConnection(database, { ...openai, apiKey: "sk-first", keyMode: "persisted" });
    await expect(database.connections.get("openai")).resolves.toMatchObject({
      apiKey: "sk-first",
    });
  });
});

describe("Custom Connections and Slots (stories 7, 14)", () => {
  it("adds and removes a Custom Connection", async () => {
    const database = await openTestDatabase();
    await loadOrCreateConnections(database);
    const custom = createCustomConnection("custom-1");
    await saveConnection(database, { ...custom, baseUrl: "https://proxy.example/v1" });

    let connections = await loadOrCreateConnections(database);
    expect(find(connections, "custom-1").baseUrl).toBe("https://proxy.example/v1");
    expect(connections).toHaveLength(6);

    expect(await removeConnection(database, "custom-1")).toBe(true);
    connections = await loadOrCreateConnections(database);
    expect(connections).toHaveLength(5);
  });

  it("refuses to remove a prefilled Connection", async () => {
    const database = await openTestDatabase();
    await loadOrCreateConnections(database);
    expect(await removeConnection(database, "openai")).toBe(false);
  });

  it("assigns a Connection to the critic and judge Slots", async () => {
    const database = await openTestDatabase();
    await loadOrCreateConnections(database);
    await assignSlot(database, "critic", "openai");
    const slots = await assignSlot(database, "judge", "anthropic");

    expect(slots).toEqual({ critic: "openai", judge: "anthropic" });
    await expect(loadSlots(database)).resolves.toEqual({ critic: "openai", judge: "anthropic" });
  });

  it("clears a Slot when its Custom Connection is removed", async () => {
    const database = await openTestDatabase();
    await loadOrCreateConnections(database);
    await saveConnection(database, createCustomConnection("custom-1"));
    await assignSlot(database, "critic", "custom-1");
    await removeConnection(database, "custom-1");
    await expect(loadSlots(database)).resolves.toEqual({ critic: null, judge: null });
  });
});

describe("defaultJudgeConnection (story 90)", () => {
  it("returns a Connection different from the Critic", async () => {
    const database = await openTestDatabase();
    const connections = await loadOrCreateConnections(database);
    const critic = find(connections, "openai");

    const judge = defaultJudgeConnection(connections, critic);

    expect(judge).not.toBeNull();
    expect(judge?.id).not.toBe(critic.id);
  });

  it("prefers a usable Connection whose model differs from the Critic's", async () => {
    const database = await openTestDatabase();
    const connections = await loadOrCreateConnections(database).then((entries) =>
      entries.map((connection) => ({ ...connection, model: "" })),
    );
    const critic = { ...find(connections, "openai"), model: "gpt-x" };
    const sameModel = { ...find(connections, "anthropic"), model: "gpt-x" };
    const differentModel = { ...find(connections, "gemini"), model: "gemini-x" };

    const judge = defaultJudgeConnection([critic, sameModel, differentModel], critic);

    expect(judge?.id).toBe("gemini");
  });

  it("prefers a different Provider over a same-Provider Connection", async () => {
    const database = await openTestDatabase();
    const connections = await loadOrCreateConnections(database).then((entries) =>
      entries.map((connection) => ({ ...connection, model: "" })),
    );
    const critic = { ...find(connections, "openai"), model: "gpt-x" };
    // OpenRouter shares the openai-shaped Protocol; Anthropic is a different Provider.
    const sameProvider = { ...find(connections, "openrouter"), model: "other" };
    const differentProvider = { ...find(connections, "anthropic"), model: "claude" };

    const judge = defaultJudgeConnection([critic, sameProvider, differentProvider], critic);

    expect(judge?.id).toBe("anthropic");
  });

  it("returns null when there is no other Connection or no Critic", async () => {
    const database = await openTestDatabase();
    const connections = await loadOrCreateConnections(database);
    const critic = find(connections, "openai");

    expect(defaultJudgeConnection([critic], critic)).toBeNull();
    expect(defaultJudgeConnection([critic], null)).toBeNull();
  });
});
