import { describe, expect, it } from "vitest";
import { ruleMatches } from "../core/rulePass";
import { BANNED_WORDS_PASS, WORN_PHRASES_PASS } from "../core/starterPasses";
import { DEFAULT_DATABASE_NAME } from "../storage/obelusDatabase";
import {
  PRIVACY_DATABASE_NAME,
  PRIVACY_SECTIONS,
  PRIVACY_SOURCE_URL,
  PRIVACY_STORES,
  privacyLinks,
  privacyProse,
} from "./privacyContent";

/**
 * The privacy page is a requirement, not copy. These assertions read the page's
 * content as data — no DOM, which this project has no test layer for — and check
 * every claim the ticket names, that the two enforcement claims are not
 * conflated, and that the page keeps its second-person voice and the Starter
 * pack's house style. The behavioural halves (the CSP header and the Transport
 * seam) are asserted where they live: `worker/securityHeaders.test.ts` and
 * `src/wire/transport.test.ts`.
 */
const prose = privacyProse().toLowerCase();

describe("privacy page content", () => {
  it("states plainly that there is no account, telemetry, analytics, reporting or counter", () => {
    expect(prose).toContain("no obelus account");
    expect(prose).toContain("no telemetry");
    expect(prose).toContain("no analytics");
    expect(prose).toContain("no crash or error reporting");
    expect(prose).toContain("no usage counter");
  });

  it("says the key is sent only to the configured Connection", () => {
    expect(prose).toContain("sent only to the base url of the connection you configured");
    expect(prose).toContain("never sent anywhere else");
  });

  it("says where Documents and keys live, and how a session key differs", () => {
    // The database name is the storage module's, not a retyped literal; the
    // store list is checked against the real schema in `obelusDatabase.test.ts`.
    expect(PRIVACY_DATABASE_NAME).toBe(DEFAULT_DATABASE_NAME);
    expect(prose).toContain("indexeddb");
    expect(prose).toContain("your browser profile");
    for (const store of PRIVACY_STORES) {
      expect(prose).toContain(store.toLowerCase());
    }
    expect(prose).toContain("persisted key is written to the connections store");
    expect(prose).toContain("session key is held only in memory");
  });

  it("distinguishes the header's claim from the code's claim", () => {
    // The header claim, and that the header enforces it.
    expect(prose).toContain("script-src is 'self'");
    expect(prose).toContain("browser enforces this from the header");
    // The code claim, and that the header does NOT enforce it.
    expect(prose).toContain("the header does not enforce this one");
    expect(prose).toContain("connect-src is deliberately broad");
    expect(prose).toContain("assertwithinconnection");
    expect(prose).toContain("does not claim the header enforces the second");
  });

  it("gives the real verification steps: IndexedDB, network with preserve log, and the CSP header", () => {
    expect(prose).toContain("indexeddb");
    expect(prose).toContain("network");
    expect(prose).toContain("preserve log");
    expect(prose).toContain("response headers");
    expect(prose).toContain("no outbound request at all");
  });

  it("keeps the verification steps as actual steps", () => {
    const verify = PRIVACY_SECTIONS.find((section) => section.heading === "Verify it yourself");
    expect(verify?.steps?.map((step) => step.title)).toEqual([
      "Read your own data",
      "Watch the network",
      "Read the CSP header",
      "Read the source",
    ]);
  });
});

/**
 * The voice, held to the same standard as the claims. The page talks to the
 * reader as "you"; it is not the app's first-person plural and it is not a
 * third-person report about "the Writer". These assertions are the page's
 * version of the house style the Starter pack enforces on prose.
 */
describe("privacy page voice", () => {
  it("addresses the reader as you", () => {
    expect(prose).toMatch(/\byou\b/);
    expect(prose).toMatch(/\byour\b/);
  });

  it("carries no first-person pronoun", () => {
    for (const pronoun of ["i", "we", "our", "ours", "us"]) {
      expect(prose, `first person "${pronoun}"`).not.toMatch(new RegExp(`\\b${pronoun}\\b`));
    }
  });

  it("does not call the reader the Writer", () => {
    expect(prose).not.toContain("the writer");
  });

  it("keeps the Starter pack's banned words and worn phrases off the page", () => {
    expect(ruleMatches(privacyProse(), BANNED_WORDS_PASS)).toEqual([]);
    expect(ruleMatches(privacyProse(), WORN_PHRASES_PASS)).toEqual([]);
  });

  it("uses no em dash", () => {
    expect(privacyProse()).not.toContain("—");
  });
});

/**
 * Every link is a source the reader can open to check a claim. A link that is
 * not https, carries no label, or points somewhere other than where it says is
 * worse than no link, so the page's links are held to the same standard as its
 * claims.
 */
describe("privacy page links", () => {
  it("gives every link a label and an https source", () => {
    const links = privacyLinks();
    expect(links.length).toBeGreaterThanOrEqual(6);
    for (const link of links) {
      expect(link.label.trim(), link.href).not.toBe("");
      expect(link.href, link.label).toMatch(/^https:\/\//);
    }
  });

  it("links the reader to IndexedDB, the CSP header, DevTools and the source", () => {
    const hrefs = privacyLinks().map((link) => link.href);
    expect(hrefs).toContain("https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API");
    expect(hrefs).toContain(
      "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy",
    );
    expect(
      hrefs,
      "how to open DevTools",
    ).toContain(
      "https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Tools_and_setup/What_are_browser_developer_tools",
    );
    expect(hrefs, "the security headers the claim names").toContain(
      `${PRIVACY_SOURCE_URL}/blob/main/worker/securityHeaders.ts`,
    );
    expect(hrefs, "the seam the claim names").toContain(
      `${PRIVACY_SOURCE_URL}/blob/main/src/wire/transport.ts`,
    );
    expect(hrefs, "the test the claim names").toContain(
      `${PRIVACY_SOURCE_URL}/blob/main/src/wire/transport.test.ts`,
    );
  });
});
