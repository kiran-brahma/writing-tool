import { afterEach, describe, expect, it } from "vitest";
import type { DocTree } from "../core/docTree";
import { hashPass, type Pass } from "../core/pass";
import { STARTER_PASSES } from "../core/starterPasses";
import { CONNECTION_PREFILLS, connectionFromPrefill, type Connection } from "../wire/connection";
import { createFixtureTransport } from "../wire/fixtureTransport";
import { loadOrCreateDocument, importDocument, persistDocument, withTree } from "./documents";
import { listFindings } from "./findings";
import { clearAuditAccounts, listAuditAccounts, runAuditPass } from "./auditAccounts";
import { openObelusDatabase, type DocumentRecord, type ObelusDatabase } from "./obelusDatabase";
import { listRevisions } from "./revisions";

const openedDatabases: ObelusDatabase[] = [];

function uniqueName(): string {
  return `obelus-audit-${crypto.randomUUID()}`;
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

/** The Starter Audit pass, so the test exercises the real prompt and scope. */
function auditPass(): Pass {
  const pass = STARTER_PASSES.find((entry) => entry.id === "audit");
  if (pass === undefined) throw new Error("the Starter pack has no audit pass");
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

const ACCOUNT = JSON.stringify({
  type: "argument",
  corePayload: "The piece argues that habits carry a plan.",
  argumentMap: {
    premises: ["Lists are ignored by Tuesday."],
    subConclusions: ["A plan without habits fails."],
    conclusion: "Keep the list short.",
  },
  reasoning: {
    kind: "inductive",
    soundness: "The premise is never established.",
    enthymemes: ["The Writer's plans failed for lack of habits."],
  },
  fallacies: [],
  priority: ["Establish why the plans failed."],
});

function runOptions(respond: (request: unknown) => string = () => ACCOUNT, now = 2_000) {
  return {
    pass: auditPass(),
    connection: connection(),
    transport: createFixtureTransport({ respond }),
    now,
  };
}

describe("runAuditPass", () => {
  it("never turns an Audit account into a Finding", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);

    await runAuditPass(database, document, runOptions());

    expect(await listFindings(database, document.id)).toEqual([]);
    expect(await listAuditAccounts(database, document.id)).toHaveLength(1);
  });

  it("stores one account derived from the whole Document, with provenance", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    const pass = auditPass();

    const outcome = await runAuditPass(database, document, runOptions());

    expect(outcome.account).not.toBeNull();
    expect(outcome.chunks).toBe(1);
    expect(outcome.account).toMatchObject({
      documentId: document.id,
      passId: pass.id,
      promptHash: hashPass(pass),
      type: "argument",
      corePayload: "The piece argues that habits carry a plan.",
      provenance: { providerId: "openai", model: "gpt-test", at: 2_000 },
    });
    const revisions = await listRevisions(database, document.id);
    expect(outcome.account?.provenance.revisionId).toBe(revisions[0].id);

    const stored = await listAuditAccounts(database, document.id);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(outcome.account?.id);
  });

  it("replaces the Pass's account on a re-run rather than appending", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);

    await runAuditPass(database, document, runOptions());
    await runAuditPass(database, document, runOptions());

    expect(await listAuditAccounts(database, document.id)).toHaveLength(1);
  });

  it("reports its chunk count and stores one synthesized account when chunked", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const body = Array.from(
      { length: 8 },
      (_, index) =>
        `Paragraph ${index + 1} carries a long sentence with plenty of words so the piece is ` +
        "well past the limit and must be split into several chunks.",
    );
    const longTree: DocTree = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Long" }] },
        ...body.map((text) => ({
          type: "paragraph" as const,
          content: [{ type: "text" as const, text }],
        })),
      ],
    };
    const saved = withTree(document, longTree, 1_100);
    await persistDocument(database, saved);

    const synthesis = JSON.stringify({ ...JSON.parse(ACCOUNT), corePayload: "One conclusion." });
    const outcome = await runAuditPass(database, saved, {
      ...runOptions((request) => {
        const prompt = (request as { messages: { content: string }[] }).messages
          .map((message) => message.content)
          .join("\n");
        return prompt.includes("Synthesize") ? synthesis : ACCOUNT;
      }),
      characterLimit: 400,
    });

    expect(outcome.chunks).toBeGreaterThan(1);
    expect(outcome.account?.corePayload).toBe("One conclusion.");
    expect(await listAuditAccounts(database, saved.id)).toHaveLength(1);
  });

  it("names praise in an account and persists the violation for the display", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    const praise = JSON.stringify({ ...JSON.parse(ACCOUNT), corePayload: "This is great writing." });

    await runAuditPass(database, document, runOptions(() => praise));

    const stored = await listAuditAccounts(database, document.id);
    expect(stored[0].violations).toContainEqual({ kind: "praise", text: "great writing" });
  });

  it("stores nothing when the call returns an unreadable account", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);

    await expect(
      runAuditPass(database, document, runOptions(() => "not an account")),
    ).rejects.toThrow(/no JSON/);

    expect(await listAuditAccounts(database, document.id)).toEqual([]);
  });

  it("stores no account for a Document with no prose", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const saved = withTree(document, { type: "doc", content: [] }, 1_100);
    await persistDocument(database, saved);

    const outcome = await runAuditPass(database, saved, runOptions());

    expect(outcome.account).toBeNull();
    expect(outcome.chunks).toBe(0);
    expect(await listAuditAccounts(database, saved.id)).toEqual([]);
  });

  it("clears a Document's accounts when the prose that produced them is dropped", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    await runAuditPass(database, document, runOptions());

    await clearAuditAccounts(database, document.id);

    expect(await listAuditAccounts(database, document.id)).toEqual([]);
  });

  it("drops accounts when the Document is replaced by an import", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    await runAuditPass(database, document, runOptions());

    await importDocument(database, document, "# Replacement\n\nDifferent prose.");

    expect(await listAuditAccounts(database, document.id)).toEqual([]);
  });
});
