import type { DeclineReason, Finding } from "../core/finding";
import { enqueueMutation } from "./mutationQueue";
import type { FindingRecord, ObelusDatabase } from "./obelusDatabase";

/**
 * The Findings repository. Findings belong to a Document, so storage carries
 * the join key the domain shape does not; every read hands Core back the domain
 * Finding and nothing more.
 */

export function toFindingRecord(finding: Finding, documentId: string): FindingRecord {
  return { ...finding, documentId };
}

export function fromFindingRecord(record: FindingRecord): Finding {
  const { documentId: _documentId, ...finding } = record;
  return finding;
}

/** Every Finding for a Document, across every Pass. */
export async function listFindings(
  database: ObelusDatabase,
  documentId: string,
): Promise<Finding[]> {
  const records = await database.findings.where("documentId").equals(documentId).toArray();
  return records.map(fromFindingRecord);
}

/** Every Finding a Pass produced for a Document. */
export async function listFindingsForPass(
  database: ObelusDatabase,
  documentId: string,
  passId: string,
): Promise<Finding[]> {
  const records = await database.findings
    .where("[documentId+passId]")
    .equals([documentId, passId])
    .toArray();
  return records.map(fromFindingRecord);
}

/**
 * Replaces a Pass's Finding set for a Document in one transaction. A rule Pass
 * re-runs on every save; reconciliation decides the whole set, so a partial
 * write would leave the sidebar disagreeing with the prose.
 */
export async function replaceFindingsForPass(
  database: ObelusDatabase,
  documentId: string,
  passId: string,
  findings: Finding[],
): Promise<void> {
  const records = findings.map((finding) => toFindingRecord(finding, documentId));
  await database.transaction("rw", database.findings, async () => {
    await database.findings.where("[documentId+passId]").equals([documentId, passId]).delete();
    await database.findings.bulkPut(records);
  });
}

/**
 * Writes a Finding's status. The invariant the spec states — a declined Finding
 * carries a `declineReason`, and a status that is not `declined` never keeps a
 * stale one — is enforced by the `StatusWrite` union here. Returns the stored
 * Finding, or `null` when no Finding has that id.
 *
 * The write is serialised with rule Runs through `enqueueMutation`, so a Run's
 * reconciliation cannot overwrite the status just set.
 */
type StatusWrite = { status: "addressed" } | { status: "declined"; reason: DeclineReason };

function writeStatus(
  database: ObelusDatabase,
  findingId: string,
  write: StatusWrite,
): Promise<Finding | null> {
  return enqueueMutation(database, () =>
    database.transaction("rw", database.findings, async () => {
      const record = await database.findings.get(findingId);
      if (record === undefined) return null;

      const { declineReason: _previous, ...finding } = fromFindingRecord(record);
      const updated: Finding =
        write.status === "declined"
          ? { ...finding, status: "declined", declineReason: write.reason }
          : { ...finding, status: "addressed" };
      await database.findings.put(toFindingRecord(updated, record.documentId));
      return updated;
    }),
  );
}

/** Story 63: the Writer marked the current Finding addressed, so it leaves the queue. */
export function markFindingAddressed(
  database: ObelusDatabase,
  findingId: string,
): Promise<Finding | null> {
  return writeStatus(database, findingId, { status: "addressed" });
}

/**
 * Stories 64 and 65: the Writer declined the current Finding. Declining needs no
 * justification, so the caller passes `advice` — the Writer rejecting the
 * advice — while story 72's praise/rewrite path passes `violation` (#24). The
 * record stays stored, so a later Run of the same Pass on unchanged text does
 * not raise the objection again.
 */
export function declineFinding(
  database: ObelusDatabase,
  findingId: string,
  reason: DeclineReason,
): Promise<Finding | null> {
  return writeStatus(database, findingId, { status: "declined", reason });
}
