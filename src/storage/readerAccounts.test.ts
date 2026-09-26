import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocTree } from "../core/docTree";
import { hashPass, type Pass } from "../core/pass";
import { STARTER_PASSES } from "../core/starterPasses";
import { CONNECTION_PREFILLS, connectionFromPrefill, type Connection } from "../wire/connection";
import { createFixtureTransport } from "../wire/fixtureTransport";
import type { ModelRequest } from "../wire/modelRequest";
import { loadOrCreateDocument, importDocument, persistDocument, withTree } from "./documents";
import { listFindings } from "./findings";
import { openObelusDatabase, type DocumentRecord, type ObelusDatabase } from "./obelusDatabase";
import { clearReaderAccounts, listReaderAccounts, runReaderPass } from "./readerAccounts";
import { listRevisions } from "./revisions";

const openedDatabases: ObelusDatabase[] = [];

function uniqueName(): string {
  return `obelus-reader-${crypto.randomUUID()}`;
}

async function openTestDatabase(): Promise<ObelusDatabase> {
  const database = await openObelusDatabase(uniqueName());
  openedDatabases.push(database);
  return database;
}

afterEach(async () => {
  for (const database of openedDatabases.splice(0)) database.close();
});

function connection(): Connection {
  const prefill = CONNECTION_PREFILLS.find((entry) => entry.id === "openai");
  if (prefill === undefined) throw new Error("no openai prefill");
  return { ...connectionFromPrefill(prefill), model: "gpt-test", apiKey: "secret" };
}

/** The Starter Reader pass, so the test exercises the real prompt and scope. */
function readerPass(): Pass {
  const pass = STARTER_PASSES.find((entry) => entry.id === "reader");
  if (pass === undefined) throw new Error("the Starter pack has no reader pass");
  return pass;
}

const TREE: DocTree = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
    { type: "paragraph", content: [{ type: "text", text: "Alpha body." }] },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Sub" }] },
    { type: "paragraph", content: [{ type: "text", text: "Bravo body." }] },
  ],
};

async function savedDocument(database: ObelusDatabase): Promise<DocumentRecord> {
  const document = await loadOrCreateDocument(database, 1_000);
  const saved = withTree(document, TREE, 1_100);
  await persistDocument(database, saved);
  return saved;
}

/** An account whose `whatItSays` names the Section the request actually carried. */
function respondForSection(request: ModelRequest): string {
  const prompt = request.messages.map((message) => message.content).join("\n");
  const where = prompt.includes("Bravo body.") ? "Bravo" : "Alpha";
  return JSON.stringify({
    what_this_section_says: `${where} section`,
    what_a_distracted_reader_would_miss: "The turn.",
    gap_between_intent_and_effect: "The claim arrives early.",
  });
}

function runOptions(respond: (request: ModelRequest) => string = respondForSection) {
  return {
    pass: readerPass(),
    connection: connection(),
    transport: createFixtureTransport({ respond }),
    screeningFrame: true,
    now: 2_000,
  };
}

describe("runReaderPass", () => {
  it("never turns a Reader account into a Finding", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);

    await runReaderPass(database, document, runOptions());

    expect(await listFindings(database, document.id)).toEqual([]);
    expect(await listReaderAccounts(database, document.id)).toHaveLength(2);
  });

  it("stores one Reader account per Section, derived from that Section", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    const pass = readerPass();

    const accounts = await runReaderPass(database, document, runOptions());

    expect(accounts).toHaveLength(2);
    expect(accounts.map((account) => account.section)).toEqual([
      { heading: "Title", level: 1, headingBlockIndex: 0 },
      { heading: "Sub", level: 2, headingBlockIndex: 2 },
    ]);
    // Each call received its own Section, not the whole Document.
    expect(accounts.map((account) => account.whatItSays)).toEqual(["Alpha section", "Bravo section"]);
    expect(accounts[0]).toMatchObject({
      documentId: document.id,
      passId: pass.id,
      promptHash: hashPass(pass),
      provenance: { providerId: "openai", model: "gpt-test", at: 2_000 },
    });
    const revisions = await listRevisions(database, document.id);
    expect(accounts[0].provenance.revisionId).toBe(revisions[0].id);

    const stored = await listReaderAccounts(database, document.id);
    expect(stored).toHaveLength(2);
    expect(stored.map((account) => account.id)).toEqual(accounts.map((account) => account.id));
  });

  it("replaces the Pass's account set on a re-run rather than appending", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);

    await runReaderPass(database, document, runOptions());
    await runReaderPass(database, document, runOptions());

    expect(await listReaderAccounts(database, document.id)).toHaveLength(2);
  });

  it("names praise in an account and persists the violation for the display", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    const praise = JSON.stringify({
      what_this_section_says: "This is great writing.",
      what_a_distracted_reader_would_miss: "Nothing.",
      gap_between_intent_and_effect: "None.",
    });

    await runReaderPass(database, document, runOptions(() => praise));

    const stored = await listReaderAccounts(database, document.id);
    expect(stored[0].violations).toContainEqual({ kind: "praise", text: "great writing" });
  });

  it("stores nothing when a Section's call returns an unreadable account", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);

    await expect(
      runReaderPass(database, document, runOptions(() => "not an account")),
    ).rejects.toThrow(/no JSON/);

    expect(await listReaderAccounts(database, document.id)).toEqual([]);
  });

  it("stores no accounts for a Document with no Section headings", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = withTree(
      document,
      { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "No heading." }] }] },
      1_100,
    );
    await persistDocument(database, saved);

    expect(await runReaderPass(database, saved, runOptions())).toEqual([]);
    expect(await listReaderAccounts(database, saved.id)).toEqual([]);
  });

  it("clears a Document's accounts when the prose that produced them is dropped", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    await runReaderPass(database, document, runOptions());

    await clearReaderAccounts(database, document.id);

    expect(await listReaderAccounts(database, document.id)).toEqual([]);
  });

  it("drops accounts when the Document is replaced by an import", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    await runReaderPass(database, document, runOptions());

    await importDocument(database, document, "# Replacement\n\nDifferent prose.");

    expect(await listReaderAccounts(database, document.id)).toEqual([]);
  });
});

describe("cancellation (#46)", () => {
  it("an aborted Reader Run stores nothing and frees the queue for later writes", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    await runReaderPass(database, document, runOptions());
    const controller = new AbortController();
    const transport = createFixtureTransport({
      respond: () => new Promise<string>(() => {
        // Never resolves: a stalled Provider, which only the abort can end.
      }),
    });

    const pending = runReaderPass(database, document, {
      ...runOptions(),
      transport,
      signal: controller.signal,
    });
    // Queued behind the stalled Run; it can only land once the Run lets go.
    const later = clearReaderAccounts(database, document.id);
    // Let the Run reach its first Section's call before the Writer cancels.
    await vi.waitFor(() => expect(transport.requests).toHaveLength(1));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "CancelledError" });
    await later;
    expect(await listReaderAccounts(database, document.id)).toEqual([]);
    // The Run stopped at the Section it was on rather than reading the rest.
    expect(transport.requests).toHaveLength(1);
  });
});
