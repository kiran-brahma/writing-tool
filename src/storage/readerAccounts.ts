import { canonicalText } from "../core/canonicalText";
import { hashPass, type Pass } from "../core/pass";
import { sectionTarget } from "../core/passContext";
import { readSection } from "../core/reader";
import { outline, sections } from "../core/sections";
import type { Connection } from "../wire/connection";
import type { Transport } from "../wire/transport";
import { enqueueMutation } from "./mutationQueue";
import type { DocumentRecord, ObelusDatabase, ReaderAccountRecord } from "./obelusDatabase";
import { ensureRevision } from "./revisions";

/**
 * The Reader-account repository. A Reader account is its own output shape: it
 * is derived from a Section and stored apart from Findings, so the Reader tab
 * can show what a Section communicates without mixing it into the queue that
 * still needs work.
 *
 * The Reader pass is one model call per Section (DESIGN §6). A Run replaces the
 * Pass's whole account set for the Document, so re-reading after an edit cannot
 * leave an account for a Section that has changed, and a failed call stores
 * nothing rather than a half-read Document.
 */

/** Every Reader account for a Document, in Section order. */
export async function listReaderAccounts(
  database: ObelusDatabase,
  documentId: string,
): Promise<ReaderAccountRecord[]> {
  const records = await database.readerAccounts.where("documentId").equals(documentId).toArray();
  return records.sort((a, b) => a.section.headingBlockIndex - b.section.headingBlockIndex);
}

/**
 * Drops every Reader account for a Document. A Reader account describes a
 * Section of a specific text, so when the prose changes the accounts describe
 * text that is gone; they are cleared rather than shown against prose they
 * never read. Serialised with Reader Runs through `enqueueMutation`.
 */
export function clearReaderAccounts(
  database: ObelusDatabase,
  documentId: string,
): Promise<void> {
  return enqueueMutation(database, () =>
    database.transaction("rw", database.readerAccounts, async () => {
      await database.readerAccounts.where("documentId").equals(documentId).delete();
    }),
  );
}

/**
 * Replaces a Pass's Reader accounts for a Document in one transaction. A Reader
 * Run decides the whole set, so a partial write would leave the Reader tab
 * showing Sections the Document no longer has.
 */
export async function replaceReaderAccountsForPass(
  database: ObelusDatabase,
  documentId: string,
  passId: string,
  accounts: ReaderAccountRecord[],
): Promise<void> {
  await database.transaction("rw", database.readerAccounts, async () => {
    await database.readerAccounts
      .where("[documentId+passId]")
      .equals([documentId, passId])
      .delete();
    await database.readerAccounts.bulkPut(accounts);
  });
}

export interface ReaderRunOptions {
  pass: Pass;
  connection: Connection;
  transport: Transport;
  screeningFrame: boolean;
  now?: number;
}

/**
 * Runs one Reader pass over every Section of a Document, one call each, and
 * persists the resulting accounts. Serialised through `enqueueMutation` with
 * rule and model Runs and status writes, so a Reader Run cannot read a Document
 * a save is midway through replacing.
 */
export function runReaderPass(
  database: ObelusDatabase,
  document: DocumentRecord,
  options: ReaderRunOptions,
): Promise<ReaderAccountRecord[]> {
  return enqueueMutation(database, () => runReaderPassNow(database, document, options));
}

async function runReaderPassNow(
  database: ObelusDatabase,
  document: DocumentRecord,
  options: ReaderRunOptions,
): Promise<ReaderAccountRecord[]> {
  const now = options.now ?? Date.now();
  // A Reader account names the Revision current when it was produced, exactly
  // as a Finding does, so the Reader tab can say what text it describes.
  const revision = await ensureRevision(database, document, now);
  const pass = options.pass;
  const promptHash = hashPass(pass);
  // One canonical render and outline for the whole Run: each Section Target is
  // a slice of the same coordinate system, not a fresh serialization.
  const canonical = canonicalText(document.tree);
  const outlineText = outline(document.tree);
  const accounts: ReaderAccountRecord[] = [];

  for (const section of sections(document.tree)) {
    const target = sectionTarget(canonical, outlineText, section, document.title);

    const result = await readSection(target, pass, options.connection, {
      transport: options.transport,
      screeningFrame: options.screeningFrame,
      revisionId: revision.id,
      now,
    });

    accounts.push({
      id: crypto.randomUUID(),
      documentId: document.id,
      passId: pass.id,
      promptHash,
      section: {
        heading: section.heading,
        level: section.level,
        headingBlockIndex: section.headingBlockIndex,
      },
      ...result.account,
    });
  }

  await replaceReaderAccountsForPass(database, document.id, pass.id, accounts);
  return accounts;
}
