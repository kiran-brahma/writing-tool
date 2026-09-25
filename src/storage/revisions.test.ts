import { afterEach, describe, expect, it } from "vitest";
import type { DocTree } from "../core/docTree";
import { createDocument, withTree } from "./documents";
import { openObelusDatabase, type DocumentRecord, type ObelusDatabase } from "./obelusDatabase";
import {
  AUTO_REVISION_RETENTION,
  listRevisions,
  pruneRevisions,
  takeRevision,
} from "./revisions";

const openedDatabases: ObelusDatabase[] = [];

function uniqueName(): string {
  return `obelus-revisions-${crypto.randomUUID()}`;
}

async function openTestDatabase(): Promise<ObelusDatabase> {
  const database = await openObelusDatabase(uniqueName());
  openedDatabases.push(database);
  return database;
}

afterEach(async () => {
  for (const database of openedDatabases.splice(0)) database.close();
});

function paragraphDoc(text: string): DocTree {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

/** Takes `count` auto-Revisions, each over changed prose, one per millisecond. */
async function takeMany(
  database: ObelusDatabase,
  document: DocumentRecord,
  count: number,
  startAt: number,
): Promise<void> {
  for (let index = 0; index < count; index++) {
    const changed = withTree(document, paragraphDoc(`Draft number ${index}.`), startAt + index);
    await takeRevision(database, changed, { now: startAt + index });
  }
}

describe("takeRevision", () => {
  it("prunes automatic Revisions to the retention bound, newest kept", async () => {
    const database = await openTestDatabase();
    const document = createDocument(1_000);
    await database.documents.put(document);

    const total = AUTO_REVISION_RETENTION + 12;
    await takeMany(database, document, total, 2_000);

    const kept = await listRevisions(database, document.id);
    expect(kept).toHaveLength(AUTO_REVISION_RETENTION);

    // Newest first, so the survivor nearest the end is the final draft and the
    // oldest survivor is the (total - retention)th.
    expect(kept[0].canonical).toContain(`Draft number ${total - 1}.`);
    expect(kept[kept.length - 1].canonical).toContain(
      `Draft number ${total - AUTO_REVISION_RETENTION}.`,
    );
  });

  it("never prunes a flagged milestone, however many automatic Revisions follow it", async () => {
    const database = await openTestDatabase();
    const document = createDocument(1_000);
    await database.documents.put(document);

    const milestone = withTree(document, paragraphDoc("The flagged turning point."), 2_000);
    const flagged = await takeRevision(database, milestone, {
      flagged: true,
      note: "the one to keep",
      now: 2_000,
    });
    expect(flagged).not.toBeNull();

    await takeMany(database, document, AUTO_REVISION_RETENTION + 20, 3_000);

    const kept = await listRevisions(database, document.id);
    expect(kept).toHaveLength(AUTO_REVISION_RETENTION + 1);
    expect(kept.some((revision) => revision.id === flagged?.id)).toBe(true);
  });

  it("reports how many Revisions it trimmed, and trims nothing twice", async () => {
    const database = await openTestDatabase();
    const document = createDocument(1_000);
    await database.documents.put(document);

    await takeMany(database, document, AUTO_REVISION_RETENTION + 4, 2_000);

    expect(await pruneRevisions(database, document.id)).toBe(0);
    expect(await listRevisions(database, document.id)).toHaveLength(AUTO_REVISION_RETENTION);
  });

  it("still skips an unchanged auto-Revision rather than storing a duplicate", async () => {
    const database = await openTestDatabase();
    const document = createDocument(1_000);
    await database.documents.put(document);

    const changed = withTree(document, paragraphDoc("Only draft."), 2_000);
    await takeRevision(database, changed, { now: 2_000 });
    const again = await takeRevision(database, changed, { now: 3_000 });

    expect(again).toBeNull();
    expect(await listRevisions(database, document.id)).toHaveLength(1);
  });
});
