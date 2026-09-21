import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CHARACTER_LIMIT } from "../core/chunking";
import type { DocTree } from "../core/docTree";
import { responseKey } from "../core/finding";
import { hashPass } from "../core/pass";
import { passContext, documentContext } from "../core/passContext";
import { hashRunText } from "../core/runCache";
import { CLICHE_PASS, TOPIC_STRINGS_PASS } from "../core/starterPasses";
import type { Target } from "../core/critique";
import { CONNECTION_PREFILLS, connectionFromPrefill, type Connection } from "../wire/connection";
import { createFixtureTransport, type FixtureTransport } from "../wire/fixtureTransport";
import { loadOrCreateDocument, persistDocument, withTree } from "./documents";
import { declineFinding, listFindings, listFindingsForPass } from "./findings";
import { listRunResponses, loadRunResponse, runModelPass } from "./modelRuns";
import { openObelusDatabase, type DocumentRecord, type ObelusDatabase } from "./obelusDatabase";
import { saveRunCache } from "./runCache";
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

/** The Target for the Paragraph at `blockIndex`, for a different cursor. */
function targetAt(document: DocumentRecord, blockIndex: number): Target {
  const target = passContext(document.tree, blockIndex, document.title);
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
    characterLimit: DEFAULT_CHARACTER_LIMIT,
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

  it("persists a Finding's violations so the display survives a reload", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    const praise = JSON.stringify({
      findings: [
        { issue: "Cliché", diagnosis: "This is great writing.", quote: "cliché", offset: 14 },
      ],
    });

    await runModelPass(database, document, runOptions(document, praise));

    const stored = await listFindingsForPass(database, document.id, CLICHE_PASS.id);
    expect(stored[0].violations).toContainEqual({ kind: "praise", text: "great writing" });
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
    // A different model is a cache miss, so this Run reaches the Provider and
    // its raw response overwrites the one stored for the same promptHash.
    await runModelPass(database, document, {
      ...runOptions(document, second),
      connection: { ...connection(), model: "gpt-test-2" },
    });

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

  it("persists a document-scope Pass's Finding that a local Pass would have dropped", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    const wholeDocument = documentContext(document.tree, document.title);
    if (wholeDocument === null) throw new Error("fixture has no document text");

    // "Context paragraph." sits above the Paragraph a local Pass on block 1 is
    // shown, so the paragraph Target would drop this Finding as context. The
    // document Target is the whole Document, so it is inside the target.
    const anchoredAbove = JSON.stringify({
      findings: [{ issue: "Cohesion", diagnosis: "D", quote: "Context", offset: 0 }],
    });
    const run = await runModelPass(database, document, {
      ...runOptions(document, anchoredAbove),
      pass: TOPIC_STRINGS_PASS,
      target: wholeDocument,
    });

    expect(run.findings).toHaveLength(1);
    expect(run.droppedAnchors).toBe(0);
    await expect(
      listFindingsForPass(database, document.id, TOPIC_STRINGS_PASS.id),
    ).resolves.toHaveLength(1);
  });

  it("chunks a document past the limit and stores one Run of merged Findings", async () => {
    const database = await openTestDatabase();
    const document = await loadOrCreateDocument(database, 1_000);
    const tree: DocTree = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "One" }] },
        { type: "paragraph", content: [{ type: "text", text: "Alpha alpha alpha alpha alpha." }] },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Two" }] },
        { type: "paragraph", content: [{ type: "text", text: "Bravo bravo bravo bravo bravo." }] },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Three" }] },
        { type: "paragraph", content: [{ type: "text", text: "Charlie charlie charlie charlie." }] },
      ],
    };
    const saved = withTree(document, tree, 1_100);
    await persistDocument(database, saved);
    const wholeDocument = documentContext(saved.tree, saved.title);
    if (wholeDocument === null) throw new Error("fixture has no document text");

    const transport = createFixtureTransport({
      respond: (request) => {
        const prompt = request.messages[0].content;
        const chunk = prompt.slice(prompt.indexOf("DOC[") + 4, prompt.lastIndexOf("]"));
        const line = chunk.split("\n").filter((entry) => entry.trim() !== "").pop() ?? chunk;
        return JSON.stringify({
          findings: [{ issue: "Problem", diagnosis: "D", quote: line, offset: chunk.indexOf(line) }],
        });
      },
    });

    const pass = { ...TOPIC_STRINGS_PASS, prompt: "DOC[{{document}}]" };
    const run = await runModelPass(database, saved, {
      pass,
      connection: connection(),
      transport,
      target: wholeDocument,
      screeningFrame: true,
      characterLimit: 40,
    });

    expect(run.chunks).toBeGreaterThan(1);
    expect(transport.requests).toHaveLength(run.chunks);
    expect(run.findings.length).toBeGreaterThan(1);

    const stored = await listFindingsForPass(database, saved.id, pass.id);
    expect(stored).toHaveLength(run.findings.length);
    await expect(
      loadRunResponse(database, saved.id, pass.id, hashPass(pass)),
    ).resolves.toContain("--- chunk ---");
  });
});

describe("the Run cache (story 53)", () => {
  function optionsWith(document: DocumentRecord, transport: FixtureTransport) {
    return {
      pass: CLICHE_PASS,
      connection: connection(),
      transport,
      target: targetFor(document),
      screeningFrame: true,
      characterLimit: DEFAULT_CHARACTER_LIMIT,
    };
  }

  it("returns a cached Run without a Provider call on unchanged text", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    const firstTransport = createFixtureTransport({ respond: () => RESPONSE });

    const first = await runModelPass(database, document, optionsWith(document, firstTransport));
    expect(first.fromCache).toBe(false);
    expect(firstTransport.requests).toHaveLength(1);

    const secondTransport = createFixtureTransport({ respond: () => RESPONSE });
    const second = await runModelPass(database, document, optionsWith(document, secondTransport));

    expect(second.fromCache).toBe(true);
    expect(secondTransport.requests).toHaveLength(0);
    expect(second.rawResponse).toBe(RESPONSE);
    expect(second.findings).toHaveLength(1);
    expect(second.findings[0]).toMatchObject({ issue: "Cliché", promptHash: hashPass(CLICHE_PASS) });
    // A cache hit is still the document's stored Finding set, reconciled.
    await expect(listFindingsForPass(database, document.id, CLICHE_PASS.id)).resolves.toHaveLength(1);
  });

  it("misses when the Target changes, returning Findings for the current Paragraph", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    const firstTransport = createFixtureTransport({ respond: () => RESPONSE });
    const first = await runModelPass(database, document, optionsWith(document, firstTransport));
    expect(first.fromCache).toBe(false);
    expect(firstTransport.requests).toHaveLength(1);
    expect(first.findings[0].anchor.quote).toBe("cliché");

    // Same Document text, same Pass, same model: only the cursor (and so the
    // Target) moved to the first Paragraph. That is a different request, so it
    // must reach the Provider rather than reuse the other Paragraph's entry.
    const contextResponse = JSON.stringify({
      findings: [{ issue: "Cohesion", diagnosis: "D", quote: "Context", offset: 0 }],
    });
    const secondTransport = createFixtureTransport({ respond: () => contextResponse });
    const second = await runModelPass(database, document, {
      ...optionsWith(document, secondTransport),
      target: targetAt(document, 0),
    });

    expect(second.fromCache).toBe(false);
    expect(secondTransport.requests).toHaveLength(1);
    expect(second.findings).toHaveLength(1);
    expect(second.findings[0].anchor.quote).toBe("Context");
  });

  it("drops a cached Finding outside the current Target, and counts it", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    const current = targetFor(document);
    const outsideResponse = JSON.stringify({
      findings: [{ issue: "Cohesion", diagnosis: "D", quote: "Context", offset: 0 }],
    });
    // A genuine Finding anchored in the neighbouring Paragraph, from a Run on
    // that Target.
    const outsideRun = await runModelPass(database, document, {
      ...optionsWith(document, createFixtureTransport({ respond: () => outsideResponse })),
      target: targetAt(document, 0),
    });
    const outsideFinding = outsideRun.findings[0];

    // A cache entry that claims the current Target but holds a Finding anchored
    // outside it: the shape any future gap in the key would produce. Defence in
    // depth must refuse to surface or store it.
    await saveRunCache(
      database,
      {
        documentId: document.id,
        canonicalHash: hashRunText(document.title, document.canonical),
        passId: CLICHE_PASS.id,
        promptHash: hashPass(CLICHE_PASS),
        connectionId: connection().id,
        protocol: connection().protocol,
        baseUrl: connection().baseUrl,
        model: connection().model,
        screeningFrame: true,
        characterLimit: DEFAULT_CHARACTER_LIMIT,
        target: current.interval,
      },
      {
        findings: [outsideFinding],
        violations: [],
        droppedAnchors: 0,
        rawResponse: outsideResponse,
        fromCache: false,
        chunks: 1,
      },
      2_000,
    );

    const transport = createFixtureTransport({ respond: () => outsideResponse });
    const hit = await runModelPass(database, document, optionsWith(document, transport));

    expect(transport.requests).toHaveLength(0);
    expect(hit.fromCache).toBe(true);
    expect(hit.findings).toHaveLength(0);
    expect(hit.droppedAnchors).toBe(1);
    await expect(listFindingsForPass(database, document.id, CLICHE_PASS.id)).resolves.toHaveLength(0);
  });

  it("misses when the model changes", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    await runModelPass(database, document, optionsWith(document, createFixtureTransport({ respond: () => RESPONSE })));

    const transport = createFixtureTransport({ respond: () => RESPONSE });
    await runModelPass(database, document, {
      ...optionsWith(document, transport),
      connection: { ...connection(), model: "gpt-other" },
    });

    expect(transport.requests).toHaveLength(1);
  });

  it("misses when the Connection id changes even for the same model", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    await runModelPass(database, document, optionsWith(document, createFixtureTransport({ respond: () => RESPONSE })));

    const transport = createFixtureTransport({ respond: () => RESPONSE });
    await runModelPass(database, document, {
      ...optionsWith(document, transport),
      connection: { ...connection(), id: "openai-alt" },
    });

    expect(transport.requests).toHaveLength(1);
  });

  it("misses when the base URL changes even for the same Connection id and model", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    await runModelPass(database, document, optionsWith(document, createFixtureTransport({ respond: () => RESPONSE })));

    // A Custom Connection can be repointed in place: same id, same model, a
    // different endpoint. That is a different request and must not be a hit.
    const transport = createFixtureTransport({ respond: () => RESPONSE });
    await runModelPass(database, document, {
      ...optionsWith(document, transport),
      connection: { ...connection(), baseUrl: "http://localhost:9999/v1" },
    });

    expect(transport.requests).toHaveLength(1);
  });

  it("misses when the canonical text is edited", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    await runModelPass(database, document, optionsWith(document, createFixtureTransport({ respond: () => RESPONSE })));

    const editedTree: DocTree = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Context paragraph." }] },
        { type: "paragraph", content: [{ type: "text", text: "Target with a cliché, edited." }] },
      ],
    };
    const edited = withTree(document, editedTree, 2_000);
    await persistDocument(database, edited);

    const transport = createFixtureTransport({ respond: () => RESPONSE });
    await runModelPass(database, edited, optionsWith(edited, transport));

    expect(transport.requests).toHaveLength(1);
  });

  it("misses when the Document title changes, because {{title}} is in the prompt", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    await runModelPass(database, document, optionsWith(document, createFixtureTransport({ respond: () => RESPONSE })));

    const retitled: DocumentRecord = { ...document, title: "A Different Title" };
    await persistDocument(database, retitled);

    const transport = createFixtureTransport({ respond: () => RESPONSE });
    await runModelPass(database, retitled, optionsWith(retitled, transport));

    expect(transport.requests).toHaveLength(1);
  });

  it("misses when the Pass prompt changes (a different promptHash)", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    await runModelPass(database, document, optionsWith(document, createFixtureTransport({ respond: () => RESPONSE })));

    const transport = createFixtureTransport({ respond: () => RESPONSE });
    await runModelPass(database, document, {
      ...optionsWith(document, transport),
      pass: { ...CLICHE_PASS, prompt: `${CLICHE_PASS.prompt}\nExtra line.` },
    });

    expect(transport.requests).toHaveLength(1);
  });

  it("a cache hit on a second Document writes independent Findings", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    const second: DocumentRecord = {
      ...document,
      id: "second-document",
      // Same title and same text: the prompt is identical, so this is a genuine
      // cross-Document cache hit.
      title: document.title,
      createdAt: 1,
      updatedAt: 1,
    };
    await database.documents.put(second);

    const first = await runModelPass(
      database,
      document,
      optionsWith(document, createFixtureTransport({ respond: () => RESPONSE })),
    );
    const secondTransport = createFixtureTransport({ respond: () => RESPONSE });
    const hit = await runModelPass(database, second, optionsWith(second, secondTransport));

    expect(hit.fromCache).toBe(true);
    expect(secondTransport.requests).toHaveLength(0);
    // A Finding is stored by id, so the second Document must not have overwritten
    // the first's row: both Document sets stand, with different ids.
    const firstFindings = await listFindingsForPass(database, document.id, CLICHE_PASS.id);
    const secondFindings = await listFindingsForPass(database, second.id, CLICHE_PASS.id);
    expect(firstFindings).toHaveLength(1);
    expect(secondFindings).toHaveLength(1);
    expect(secondFindings[0].id).not.toBe(firstFindings[0].id);
    expect(secondFindings[0].id).not.toBe(first.findings[0].id);
  });
});

describe("cancellation (story 54)", () => {
  it("an aborted Run stores no Findings, writes no cache entry, and does not retry", async () => {
    const database = await openTestDatabase();
    const document = await savedDocument(database);
    const controller = new AbortController();
    const transport = createFixtureTransport({
      respond: () => new Promise<string>(() => {
        // Never resolves: the abort is the only way out.
      }),
    });

    const pending = runModelPass(database, document, {
      pass: CLICHE_PASS,
      connection: connection(),
      transport,
      target: targetFor(document),
      screeningFrame: true,
      characterLimit: DEFAULT_CHARACTER_LIMIT,
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "CancelledError" });
    await expect(listFindingsForPass(database, document.id, CLICHE_PASS.id)).resolves.toHaveLength(0);
    await expect(database.runCache.count()).resolves.toBe(0);
    expect(transport.requests).toHaveLength(1);
  });
});
