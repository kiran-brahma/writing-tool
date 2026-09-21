import { resolveAnchor } from "../core/anchor";
import { isContained } from "../core/containment";
import { critique, type RunResult, type Target } from "../core/critique";
import { responseKey, type Finding } from "../core/finding";
import { provenanceFor } from "../core/modelCall";
import { hashPass, type Pass } from "../core/pass";
import { reconcileFindings } from "../core/reconcile";
import { hashRunText, runCacheKey } from "../core/runCache";
import type { Connection } from "../wire/connection";
import type { Transport } from "../wire/transport";
import { listFindingsForPass, provenanceLookup, replaceFindingsForPass } from "./findings";
import { enqueueMutation } from "./mutationQueue";
import type { DocumentRecord, ObelusDatabase, RunCacheRecord } from "./obelusDatabase";
import { ensureRevision } from "./revisions";
import {
  loadRunCache,
  saveRunCache,
  type RunCacheInput,
} from "./runCache";

/**
 * The model-Run repository. A model Run is like a rule Run in one respect — it
 * reconciles a Pass's Finding set rather than appending — and unlike it in
 * another: it also records the raw provider response, so the global
 * "show raw response" toggle can expose it for a Finding loaded much later.
 *
 * The Run cache lives here, at the storage boundary, because this is the door
 * every Run goes through and the only place the Document's canonical text, the
 * Pass, its `promptHash`, the Connection and the model are all in hand at once.
 */

/** Stores the raw response of a Pass's Run for a Document, keyed by promptHash. */
export async function saveRunResponse(
  database: ObelusDatabase,
  documentId: string,
  passId: string,
  promptHash: string,
  rawResponse: string,
  at: number,
): Promise<void> {
  await database.runResponses.put({ documentId, passId, promptHash, rawResponse, at });
}

/** The raw response stored for a Pass at a given promptHash, or `null`. */
export async function loadRunResponse(
  database: ObelusDatabase,
  documentId: string,
  passId: string,
  promptHash: string,
): Promise<string | null> {
  const record = await database.runResponses.get([documentId, passId, promptHash]);
  return record?.rawResponse ?? null;
}

/** Every stored raw response for a Document, keyed by `responseKey`. */
export async function listRunResponses(
  database: ObelusDatabase,
  documentId: string,
): Promise<Record<string, string>> {
  const records = await database.runResponses.where("documentId").equals(documentId).toArray();
  const byKey: Record<string, string> = {};
  for (const record of records) {
    byKey[responseKey(record.passId, record.promptHash)] = record.rawResponse;
  }
  return byKey;
}

export interface ModelRunOptions {
  pass: Pass;
  connection: Connection;
  transport: Transport;
  target: Target;
  screeningFrame: boolean;
  /** Story 50: the character limit above which a document Run is chunked. */
  characterLimit: number;
  /** Story 54: cancels the Run; an aborted Run stores no Findings. */
  signal?: AbortSignal;
  now?: number;
}

/**
 * Runs one model Pass and persists what it found. Serialised through
 * `enqueueMutation` with rule Runs and status writes, so a status the Writer
 * just set cannot be reset by a Run that read the set first.
 */
export function runModelPass(
  database: ObelusDatabase,
  document: DocumentRecord,
  options: ModelRunOptions,
): Promise<RunResult> {
  return enqueueMutation(database, () => runModelPassNow(database, document, options));
}

async function runModelPassNow(
  database: ObelusDatabase,
  document: DocumentRecord,
  options: ModelRunOptions,
): Promise<RunResult> {
  const now = options.now ?? Date.now();
  // A Finding must name the Revision current when it was produced, so a model
  // Run needs one even before it knows what the model will return.
  const revision = await ensureRevision(database, document, now);

  const input: RunCacheInput = {
    documentId: document.id,
    canonicalHash: hashRunText(document.title, document.canonical),
    passId: options.pass.id,
    promptHash: hashPass(options.pass),
    connectionId: options.connection.id,
    model: options.connection.model,
    screeningFrame: options.screeningFrame,
    characterLimit: options.characterLimit,
    // A local Pass's input depends on the cursor, so the Target interval joins
    // the key: the same Pass over the same Document in another Paragraph is a
    // different request and must not be served from this Run's entry.
    target: options.target.interval,
  };
  const cached = await loadRunCache(database, runCacheKey(input));

  const result =
    cached === null
      ? await critique(options.target, options.pass, options.connection, {
          transport: options.transport,
          screeningFrame: options.screeningFrame,
          revisionId: revision.id,
          characterLimit: options.characterLimit,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
          now,
        })
      : resultFromCache(cached, options.target, options.connection, revision.id, now);

  // Store before reconciling: the Provider call is the expensive part, and a
  // cache entry is valid even if the later Finding write is interrupted.
  if (cached === null) await saveRunCache(database, input, result, now);

  const existing = await listFindingsForPass(database, document.id, options.pass.id);
  const provenance = await provenanceLookup(database, existing);
  const merged = reconcileFindings(result.findings, existing, document.canonical, provenance);
  await replaceFindingsForPass(database, document.id, options.pass.id, merged);
  await saveRunResponse(database, document.id, options.pass.id, input.promptHash, result.rawResponse, now);

  return { ...result, findings: merged };
}

/**
 * A cached Run as a fresh `RunResult`. Finding ids are regenerated and
 * provenance is rebased onto this Run's Revision: a Finding is stored by id, so
 * a hit on a second Document must not carry the first Document's ids (it would
 * overwrite that Document's rows), and its provenance must name a Revision of
 * the Document it now belongs to. The prose, anchors, violations and raw
 * response are the cached ones, so the Writer's view is otherwise identical.
 *
 * The Findings are re-contained against the current Target even though the key
 * already names it. Defence in depth: if a future key component is ever missed,
 * a cached Finding outside the Target is dropped and counted here rather than
 * surfaced against the wrong Paragraph.
 */
function resultFromCache(
  record: RunCacheRecord,
  target: Target,
  connection: Connection,
  revisionId: string,
  now: number,
): RunResult {
  const kept: Finding[] = [];
  let dropped = 0;
  for (const finding of record.findings) {
    if (isContained(resolveAnchor(finding.anchor, target.canonical), target.interval)) {
      kept.push(finding);
    } else {
      dropped += 1;
    }
  }

  return {
    findings: kept.map((finding) => ({
      ...finding,
      id: crypto.randomUUID(),
      provenance: provenanceFor(connection, revisionId, now),
    })),
    violations: record.violations,
    droppedAnchors: record.droppedAnchors + dropped,
    rawResponse: record.rawResponse,
    fromCache: true,
    chunks: record.chunks,
    ...(record.usage === undefined ? {} : { usage: record.usage }),
  };
}
