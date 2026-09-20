import { describe, expect, it } from "vitest";
import {
  PRIVACY_DATABASE_NAME,
  PRIVACY_SECTIONS,
  PRIVACY_STORES,
  privacyProse,
} from "./privacyContent";

/**
 * The privacy page is a requirement, not copy. These assertions read the page's
 * content as data — no DOM, which this project has no test layer for — and check
 * that every claim the ticket names is present and that the two enforcement
 * claims are not conflated. The behavioural halves (the CSP header and the
 * Transport seam) are asserted where they live: `worker/securityHeaders.test.ts`
 * and `src/wire/transport.test.ts`.
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
    expect(PRIVACY_DATABASE_NAME).toBe("obelus");
    expect(prose).toContain("indexeddb");
    expect(prose).toContain("this browser profile");
    expect(PRIVACY_STORES).toEqual([
      "documents",
      "revisions",
      "findings",
      "readerAccounts",
      "runResponses",
      "passes",
      "connections",
      "settings",
    ]);
    expect(prose).toContain("persisted key is written to the connections store");
    expect(prose).toContain("session key is held only in memory");
  });

  it("distinguishes the header's claim from the code's claim", () => {
    // The header claim, and that the header enforces it.
    expect(prose).toContain("script-src is 'self'");
    expect(prose).toContain("browser enforces this from the header");
    // The code claim, and that the header does NOT enforce it.
    expect(prose).toContain("this one is not enforced by the header");
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
