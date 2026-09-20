import { critique, type RunResult, type Target } from "../core/critique";
import type { Pass } from "../core/pass";
import { reconcileFindings } from "../core/reconcile";
import type { Connection } from "../wire/connection";
import type { Transport } from "../wire/transport";
import { listFindingsForPass, replaceFindingsForPass } from "./findings";
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

/** Stores the raw response of a Pass's most recent Run for a Document. */
export async function saveRunResponse(
  database: ObelusDatabase,
  documentId: string,
  passId: string,
  rawResponse: string,
  at: number,
): Promise<void> {
  await database.runResponses.put({ documentId, passId, rawResponse, at });
}

/** The raw response stored for a Pass, or `null` when it has not run here. */
export async function loadRunResponse(
  database: ObelusDatabase,
  documentId: string,
  passId: string,
): Promise<string | null> {
  const record = await database.runResponses.get([documentId, passId]);
  return record?.rawResponse ?? null;
}

/** Every stored raw response for a Document, keyed by Pass id. */
export async function listRunResponses(
  database: ObelusDatabase,
  documentId: string,
): Promise<Record<string, string>> {
  const records = await database.runResponses.where("documentId").equals(documentId).toArray();
  const byPass: Record<string, string> = {};
  for (const record of records) byPass[record.passId] = record.rawResponse;
  return byPass;
}

export interface ModelRunOptions {
  pass: Pass;
  connection: Connection;
  transport: Transport;
  target: Target;
  screeningFrame: boolean;
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
    now,
  });

  const existing = await listFindingsForPass(database, document.id, options.pass.id);
  const merged = reconcileFindings(result.findings, existing, document.canonical);
  await replaceFindingsForPass(database, document.id, options.pass.id, merged);
  await saveRunResponse(database, document.id, options.pass.id, result.rawResponse, now);

  return { ...result, findings: merged };
}
