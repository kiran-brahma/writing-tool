import { auditDocument } from "../core/audit";
import type { Violation } from "../core/finding";
import { hashPass, type Pass } from "../core/pass";
import { documentContext } from "../core/passContext";
import type { Connection } from "../wire/connection";
import type { Transport } from "../wire/transport";
import { enqueueMutation } from "./mutationQueue";
import type { AuditAccountRecord, DocumentRecord, ObelusDatabase } from "./obelusDatabase";
import { ensureRevision } from "./revisions";

/**
 * The Audit-account repository. An Audit account is derived from the whole
 * Document, so when the prose changes the account describes text that is gone
 * and is cleared rather than shown against it — the same stance the Reader
 * accounts take.
 *
 * The Audit pass is one document-scope model call (or, past the character
 * limit, one call per Section plus a synthesis). A Run replaces the Pass's
 * account for the Document, so re-auditing after an edit cannot leave an
 * account for prose that has changed, and a failed call stores nothing rather
 * than a half-audited Document.
 */

/** Every Audit account for a Document, in Pass order. */
export async function listAuditAccounts(
  database: ObelusDatabase,
  documentId: string,
): Promise<AuditAccountRecord[]> {
  return database.auditAccounts.where("documentId").equals(documentId).toArray();
}

/** Drops every Audit account for a Document. Serialised with Runs. */
export function clearAuditAccounts(database: ObelusDatabase, documentId: string): Promise<void> {
  return enqueueMutation(database, () =>
    database.transaction("rw", database.auditAccounts, async () => {
      await database.auditAccounts.where("documentId").equals(documentId).delete();
    }),
  );
}

/**
 * Replaces a Pass's Audit account for a Document in one transaction. An Audit
 * Run decides the whole account, so a partial write would leave the Audit
 * surface showing an account for prose the Document no longer has.
 */
async function replaceAuditAccountForPass(
  database: ObelusDatabase,
  documentId: string,
  passId: string,
  accounts: AuditAccountRecord[],
): Promise<void> {
  await database.transaction("rw", database.auditAccounts, async () => {
    await database.auditAccounts
      .where("[documentId+passId]")
      .equals([documentId, passId])
      .delete();
    await database.auditAccounts.bulkPut(accounts);
  });
}

export interface AuditRunOptions {
  pass: Pass;
  connection: Connection;
  transport: Transport;
  /** Story 131: past this many characters the Audit chunks and synthesizes. */
  characterLimit?: number;
  /** Story 54: cancels the Run; an aborted Run stores no account. */
  signal?: AbortSignal;
  now?: number;
}

/** What one Audit Run produced, for the surface to report. */
export interface AuditRunOutcome {
  /** The stored account, or null when the Document had no text to audit. */
  account: AuditAccountRecord | null;
  /**
   * Story 131: how many model calls the Run took; 1 when it fit, one per chunk
   * plus the synthesis when it was chunked.
   */
  chunks: number;
  /** Praise or a rewrite the linter caught across the Run. */
  violations: Violation[];
}

/**
 * Runs one Audit pass over the whole Document and persists the account.
 * Serialised through `enqueueMutation` with rule, model and Reader Runs and
 * status writes, so an Audit cannot read a Document a save is midway through
 * replacing.
 */
export function runAuditPass(
  database: ObelusDatabase,
  document: DocumentRecord,
  options: AuditRunOptions,
): Promise<AuditRunOutcome> {
  return enqueueMutation(database, () => runAuditPassNow(database, document, options));
}

async function runAuditPassNow(
  database: ObelusDatabase,
  document: DocumentRecord,
  options: AuditRunOptions,
): Promise<AuditRunOutcome> {
  const now = options.now ?? Date.now();
  // An Audit account names the Revision current when it was produced, exactly
  // as a Finding does, so the surface can say what text it describes.
  const revision = await ensureRevision(database, document, now);
  const pass = options.pass;

  // A Document with no prose has nothing to audit; clear this Pass's account
  // rather than sending an empty request.
  const target = documentContext(document.tree, document.title);
  if (target === null) {
    await replaceAuditAccountForPass(database, document.id, pass.id, []);
    return { account: null, chunks: 0, violations: [] };
  }

  const run = await auditDocument(target, pass, options.connection, {
    transport: options.transport,
    // Story 154: the Audit's stance is its method; the global frame never
    // reaches it, and `auditDocument` refuses to attach one anyway.
    screeningFrame: false,
    revisionId: revision.id,
    now,
    ...(options.characterLimit === undefined ? {} : { characterLimit: options.characterLimit }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  const account: AuditAccountRecord = {
    id: crypto.randomUUID(),
    documentId: document.id,
    passId: pass.id,
    promptHash: hashPass(pass),
    ...run.account,
  };
  await replaceAuditAccountForPass(database, document.id, pass.id, [account]);
  return { account, chunks: run.chunks, violations: run.violations };
}
