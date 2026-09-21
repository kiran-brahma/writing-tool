import { enqueueMutation } from "./mutationQueue";
import type { ObelusDatabase } from "./obelusDatabase";

/**
 * The Audit-account repository. An Audit account is derived from the whole
 * Document, so when the prose changes the account describes text that is gone
 * and is cleared rather than shown against it — the same stance the Reader
 * accounts take.
 *
 * The store and its clearing live here so the next derived output shape cannot
 * forget to clear. The Audit Run that writes accounts arrives with the Audit
 * pass (#27); this module holds only the read-side lifecycle for now.
 */

/** Drops every Audit account for a Document. Serialised with Runs. */
export function clearAuditAccounts(database: ObelusDatabase, documentId: string): Promise<void> {
  return enqueueMutation(database, () =>
    database.transaction("rw", database.auditAccounts, async () => {
      await database.auditAccounts.where("documentId").equals(documentId).delete();
    }),
  );
}
