import { afterEach, describe, expect, it } from "vitest";
import type { DocTree } from "../core/docTree";
import { responseKey } from "../core/finding";
import { hashPass } from "../core/pass";
import { passContext } from "../core/passContext";
import { CLICHE_PASS } from "../core/starterPasses";
import type { Target } from "../core/critique";
import { CONNECTION_PREFILLS, connectionFromPrefill, type Connection } from "../wire/connection";
import { createFixtureTransport } from "../wire/fixtureTransport";
import { loadOrCreateDocument, persistDocument, withTree } from "./documents";
import { declineFinding, listFindings, listFindingsForPass } from "./findings";
import { listRunResponses, loadRunResponse, runModelPass } from "./modelRuns";
import { openObelusDatabase, type DocumentRecord, type ObelusDatabase } from "./obelusDatabase";
import { listRevisions } from "./revisions";

const openedDatabases: ObelusDatabase[] = [];

function uniqueName(): string {
  return `obelus-modelruns-${crypto.randomUUID()}`;
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

/** A Document with a context Paragraph and a Target Paragraph. */
async function savedDocument(database: ObelusDatabase): Promise<DocumentRecord> {
  const document = await loadOrCreateDocument(database, 1_000);
  const tree: DocTree = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Context paragraph." }] },
      { type: "paragraph", content: [{ type: "text", text: "Target with a cliché." }] },
    ],
  };
  const saved = withTree(document, tree, 1_100);
  await persistDocument(database, saved);
  return saved;
}

function targetFor(document: DocumentRecord): Target {
  const target = passContext(document.tree, 1, document.title);
  if (target === null) throw new Error("no paragraph");
  return target;
}

const RESPONSE = JSON.stringify({
  findings: [{ issue: "Cliché", diagnosis: "Worn.", quote: "cliché", offset: 14 }],
});

function runOptions(document: DocumentRecord, respond = RESPONSE) {
  return {
    pass: CLICHE_PASS,
    connection: connection(),
    transport: createFixtureTransport({ respond: () => respond }),
    target: targetFor(document),
    screeningFrame: true,
  };
}

describe("runModelPass", () => {
  it("persists the Findings and the raw response, and records a Revision", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);

    const run = await runModelPass(database, document, runOptions(document, RESPONSE));

    expect(run.findings).toHaveLength(1);
    expect(run.findings[0]).toMatchObject({
      passId: "cliche",
      promptHash: hashPass(CLICHE_PASS),
      status: "open",
      provenance: { providerId: "openai", model: "gpt-test" },
    });
    expect(run.droppedAnchors).toBe(0);

    const stored = await listFindingsForPass(database, document.id, CLICHE_PASS.id);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(run.findings[0].id);

    await expect(
      loadRunResponse(database, document.id, CLICHE_PASS.id, hashPass(CLICHE_PASS)),
    ).resolves.toBe(RESPONSE);
    await expect(listRunResponses(database, document.id)).resolves.toEqual({
      [responseKey(CLICHE_PASS.id, hashPass(CLICHE_PASS))]: RESPONSE,
    });

    const revisions = await listRevisions(database, document.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0].canonical).toBe("Context paragraph.\n\nTarget with a cliché.\n");
  });

  it("does not raise a declined Finding again when the model returns it unchanged", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    const first = await runModelPass(database, document, runOptions(document, RESPONSE));
    await declineFinding(database, first.findings[0].id, "advice");

    const second = await runModelPass(database, document, runOptions(document, RESPONSE));

    expect(second.findings).toHaveLength(1);
    expect(second.findings[0].id).toBe(first.findings[0].id);
    expect(second.findings[0].status).toBe("declined");
    expect(second.findings[0].declineReason).toBe("advice");
    expect(await listFindings(database, document.id)).toHaveLength(1);
  });

  it("keeps the raw response of the most recent Run for the same promptHash", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    await runModelPass(database, document, runOptions(document, RESPONSE));

    const second = JSON.stringify({
      findings: [{ issue: "Other", diagnosis: "D", quote: "Target", offset: 0 }],
    });
    await runModelPass(database, document, runOptions(document, second));

    await expect(
      loadRunResponse(database, document.id, CLICHE_PASS.id, hashPass(CLICHE_PASS)),
    ).resolves.toBe(second);
  });

  it("keeps a raw response from an earlier prompt alongside the current one", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    const edited = { ...CLICHE_PASS, prompt: `${CLICHE_PASS.prompt}\nExtra line.` };

    await runModelPass(database, document, runOptions(document, RESPONSE));
    const secondResponse = JSON.stringify({
      findings: [{ issue: "Second", diagnosis: "D", quote: "Target", offset: 0 }],
    });
    await runModelPass(database, document, {
      ...runOptions(document, secondResponse),
      pass: edited,
    });

    const stored = await listRunResponses(database, document.id);
    expect(stored[responseKey(CLICHE_PASS.id, hashPass(CLICHE_PASS))]).toBe(RESPONSE);
    expect(stored[responseKey(edited.id, hashPass(edited))]).toBe(secondResponse);
  });
});
