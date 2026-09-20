import { critique, type RunResult, type Target } from "../core/critique";
import { responseKey } from "../core/finding";
import { hashPass, type Pass } from "../core/pass";
import { reconcileFindings } from "../core/reconcile";
import type { Connection } from "../wire/connection";
import type { Transport } from "../wire/transport";
import { listFindingsForPass, provenanceLookup, replaceFindingsForPass } from "./findings";
import { enqueueMutation } from "./mutationQueue";
import type { DocumentRecord, ObelusDatabase } from "./obelusDatabase";
import { ensureRevision } from "./revisions";

/**
 * The model-Run repository. A model Run is like a rule Run in one respect — it
 * reconciles a Pass's Finding set rather than appending — and unlike it in
 * another: it also records the raw provider response, so the global
 * "show raw response" toggle can expose it for a Finding loaded much later.
 *
 * The Run cache, the cost estimate and cancellation are #16's. This is the
 * end-to-end path one Pass needs.
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

  const result = await critique(options.target, options.pass, options.connection, {
    transport: options.transport,
    screeningFrame: options.screeningFrame,
    revisionId: revision.id,
    characterLimit: options.characterLimit,
    now,
  });

  const existing = await listFindingsForPass(database, document.id, options.pass.id);
  const provenance = await provenanceLookup(database, existing);
  const merged = reconcileFindings(result.findings, existing, document.canonical, provenance);
  await replaceFindingsForPass(database, document.id, options.pass.id, merged);
  await saveRunResponse(
    database,
    document.id,
    options.pass.id,
    hashPass(options.pass),
    result.rawResponse,
    now,
  );

  return { ...result, findings: merged };
}
