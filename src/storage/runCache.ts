import type { RunResult } from "../core/critique";
import { runCacheKey, type RunCacheKeyInput } from "../core/runCache";
import type { ObelusDatabase, RunCacheRecord } from "./obelusDatabase";

/**
 * The Run cache repository (story 53). A whole model Run is stored under the
 * key `runCacheKey` derives, so a repeat Run on unchanged text restores its
 * Findings, raw response and usage without a Provider call.
 */

/** Everything the cache record needs beyond the cached result itself. */
export interface RunCacheInput extends RunCacheKeyInput {
  documentId: string;
}

export async function loadRunCache(
  database: ObelusDatabase,
  key: string,
): Promise<RunCacheRecord | null> {
  return (await database.runCache.get(key)) ?? null;
}

export async function saveRunCache(
  database: ObelusDatabase,
  input: RunCacheInput,
  result: RunResult,
  at: number,
): Promise<void> {
  await database.runCache.put(toRunCacheRecord(input, result, at));
  await pruneRunCache(database, input.documentId, input.passId);
}

/**
 * How many cached Runs one Pass keeps for one Document. The cache key includes
 * the canonical hash, so every edit mints a new row and retires the old one:
 * without a bound, each edit leaks a full-canonical-text copy of the result for
 * the life of the Library, which is the leak the quota eventually reports.
 * Keeping a few means an undo-then-re-run still hits the cache.
 */
export const RUN_CACHE_RETENTION = 5;

/** Trims one Pass's cached Runs for a Document to the most recent entries. */
export async function pruneRunCache(
  database: ObelusDatabase,
  documentId: string,
  passId: string,
): Promise<number> {
  const entries = await database.runCache.where("documentId").equals(documentId).toArray();
  const doomed = entries
    .filter((entry) => entry.passId === passId)
    .sort((left, right) => right.at - left.at)
    .slice(RUN_CACHE_RETENTION)
    .map((entry) => entry.key);

  if (doomed.length > 0) await database.runCache.bulkDelete(doomed);
  return doomed.length;
}

/**
 * Drops every cached Run for a Document. A cached Run is a convenience, so
 * clearing it costs at most a repeated Provider call and never loses prose,
 * which makes it the right thing to spend first when the Library is full.
 */
export async function clearRunCache(
  database: ObelusDatabase,
  documentId: string,
): Promise<number> {
  const doomed = await database.runCache.where("documentId").equals(documentId).primaryKeys();
  if (doomed.length > 0) await database.runCache.bulkDelete(doomed);
  return doomed.length;
}

/** The stored form of one Run's result, keyed for the fields that shape it. */
function toRunCacheRecord(
  input: RunCacheInput,
  result: RunResult,
  at: number,
): RunCacheRecord {
  return {
    key: runCacheKey(input),
    documentId: input.documentId,
    canonicalHash: input.canonicalHash,
    passId: input.passId,
    promptHash: input.promptHash,
    connectionId: input.connectionId,
    protocol: input.protocol,
    baseUrl: input.baseUrl,
    model: input.model,
    screeningFrame: input.screeningFrame,
    characterLimit: input.characterLimit,
    target: input.target,
    findings: result.findings,
    violations: result.violations,
    droppedAnchors: result.droppedAnchors,
    rawResponse: result.rawResponse,
    chunks: result.chunks,
    ...(result.usage === undefined ? {} : { usage: result.usage }),
    at,
  };
}
