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
