import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CHARACTER_LIMIT } from "../core/chunking";
import type { RunResult } from "../core/critique";
import { runCacheKey } from "../core/runCache";
import { openObelusDatabase, type ObelusDatabase } from "./obelusDatabase";
import {
  clearRunCache,
  loadRunCache,
  pruneRunCache,
  RUN_CACHE_RETENTION,
  saveRunCache,
  type RunCacheInput,
} from "./runCache";

const openedDatabases: ObelusDatabase[] = [];

function uniqueName(): string {
  return `obelus-runcache-${crypto.randomUUID()}`;
}

async function openTestDatabase(): Promise<ObelusDatabase> {
  const database = await openObelusDatabase(uniqueName());
  openedDatabases.push(database);
  return database;
}

afterEach(async () => {
  for (const database of openedDatabases.splice(0)) database.close();
});

const DOCUMENT_ID = "document-1";

/** An input whose canonical hash varies, so each save mints a distinct key. */
function input(canonicalHash: string, passId = "pass-1", documentId = DOCUMENT_ID): RunCacheInput {
  return {
    documentId,
    canonicalHash,
    passId,
    promptHash: "prompt-hash",
    connectionId: "connection-1",
    protocol: "openai-shaped",
    baseUrl: "https://example.com",
    model: "a-model",
    maxOutputTokens: 4096,
    reasoningEffort: "",
    extraHeaders: {},
    screeningFrame: true,
    characterLimit: DEFAULT_CHARACTER_LIMIT,
    voiceList: [],
    target: { start: 0, end: 10 },
  };
}

function result(rawResponse: string): RunResult {
  return {
    findings: [],
    violations: [],
    droppedAnchors: 0,
    rawResponse,
    fromCache: false,
    chunks: 1,
  };
}

describe("saveRunCache", () => {
  it("bounds one Pass's cached Runs, dropping the oldest first", async () => {
    const database = await openTestDatabase();
    const total = RUN_CACHE_RETENTION + 4;

    for (let index = 0; index < total; index++) {
      await saveRunCache(database, input(`hash-${index}`), result(`raw ${index}`), 1_000 + index);
    }

    const kept = await database.runCache.where("documentId").equals(DOCUMENT_ID).toArray();
    expect(kept).toHaveLength(RUN_CACHE_RETENTION);

    // The oldest entries went; the newest survived.
    expect(await loadRunCache(database, runCacheKey(input(`hash-${total - 1}`)))).not.toBeNull();
    expect(await loadRunCache(database, runCacheKey(input("hash-0")))).toBeNull();
  });

  it("keeps each Pass's cache separate", async () => {
    const database = await openTestDatabase();

    for (let index = 0; index < RUN_CACHE_RETENTION + 2; index++) {
      await saveRunCache(database, input(`a-${index}`, "pass-a"), result("a"), 1_000 + index);
    }
    await saveRunCache(database, input("b-0", "pass-b"), result("b"), 5_000);

    const forB = await database.runCache.where("documentId").equals(DOCUMENT_ID).toArray();
    expect(forB.filter((entry) => entry.passId === "pass-b")).toHaveLength(1);
    expect(forB.filter((entry) => entry.passId === "pass-a")).toHaveLength(RUN_CACHE_RETENTION);
  });

  it("does not touch another Document's cache", async () => {
    const database = await openTestDatabase();

    for (let index = 0; index < RUN_CACHE_RETENTION + 2; index++) {
      await saveRunCache(database, input(`x-${index}`, "pass-1"), result("x"), 1_000 + index);
    }
    await saveRunCache(database, input("x-0", "pass-1", "document-2"), result("x"), 9_000);

    const other = await database.runCache.where("documentId").equals("document-2").toArray();
    expect(other).toHaveLength(1);
  });
});

describe("pruneRunCache and clearRunCache", () => {
  it("reports nothing to prune once the cache is already within the bound", async () => {
    const database = await openTestDatabase();
    await saveRunCache(database, input("only"), result("raw"), 1_000);

    expect(await pruneRunCache(database, DOCUMENT_ID, "pass-1")).toBe(0);
  });

  it("clears every cached Run for a Document and reports the count", async () => {
    const database = await openTestDatabase();
    for (let index = 0; index < 3; index++) {
      await saveRunCache(database, input(`h-${index}`), result("raw"), 1_000 + index);
    }
    await saveRunCache(database, input("keep", "pass-1", "document-2"), result("raw"), 5_000);

    expect(await clearRunCache(database, DOCUMENT_ID)).toBe(3);
    expect(await database.runCache.where("documentId").equals(DOCUMENT_ID).count()).toBe(0);
    expect(await database.runCache.where("documentId").equals("document-2").count()).toBe(1);
  });
});
