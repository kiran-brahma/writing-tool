import type { Finding } from "../core/finding";
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
