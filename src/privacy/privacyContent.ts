/**
 * The privacy page's content, as data. Keeping it out of the JSX lets the
 * claims the page must make — no account, no telemetry, where things live, and
 * which claim the header enforces versus which the code path enforces — be
 * asserted by a pure test rather than by reading rendered DOM, which this
 * project deliberately has no test layer for.
 *
 * The prose is the requirement, not decoration: if a claim is removed from
 * here it should fail `privacyContent.test.ts`.
 */

export interface PrivacyStep {
  readonly title: string;
  readonly body: readonly string[];
}

export interface PrivacySection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly steps?: readonly PrivacyStep[];
}

/** The one database the Writer can open in DevTools to read their own work. */
export const PRIVACY_DATABASE_NAME = "obelus";

/**
 * The IndexedDB stores the Writer will find, in the order the page lists them.
 * Names match `src/storage/obelusDatabase.ts`.
 */
export const PRIVACY_STORES: readonly string[] = [
  "documents",
  "revisions",
  "findings",
  "readerAccounts",
  "runResponses",
  "passes",
  "connections",
  "settings",
];

export const PRIVACY_SECTIONS: readonly PrivacySection[] = [
  {
    heading: "What Obelus does with your words",
    paragraphs: [
      "Obelus runs entirely in this browser. Your Documents never leave this machine except when you ask a model to read one of them.",
      "When you run a model pass or ask the Judge to compare two Revisions, Obelus sends the text that pass needs — and nothing more — from this browser tab straight to the Connection you configured. The reply comes back to this tab and is stored here.",
      "There is no Obelus account. There is no telemetry, no analytics, no crash or error reporting, and no usage counter anywhere in Obelus. The only requests that leave this browser are the ones you trigger against a Connection.",
      "The one server involved serves the app itself: static files, plus the security headers described below. It has no API route and never touches a Provider, so no machine of ours ever sees your key or your prose.",
    ],
  },
  {
    heading: "Where your Documents live",
    paragraphs: [
      `Your Documents, Revisions, Findings, Reader accounts, raw model responses, Passes, Connections and settings live in this browser's IndexedDB, in a database named ${PRIVACY_DATABASE_NAME}. IndexedDB is local storage owned by this browser profile on this machine. Obelus does not sync it, upload it, or keep a copy of it anywhere else.`,
      `Because it is local, it can also be lost: clearing your browser data or a browser eviction can remove it. That is what the Library's Backup button is for.`,
      `The stores you will find are: ${PRIVACY_STORES.join(", ")}.`,
    ],
  },
  {
    heading: "Where your keys live",
    paragraphs: [
      `A Connection can hold its key in one of two ways. A persisted key is written to the connections store in the same ${PRIVACY_DATABASE_NAME} database, alongside the Connection. A session key is held only in memory in this tab; it is never written to IndexedDB and is gone when the tab reloads. The Connection editor tells you which mode you are using.`,
      "A Library backup leaves keys out unless you tick the box that includes them.",
      "Your key is sent only to the base URL of the Connection you configured, in the auth header that Connection's Protocol calls for. It is never sent anywhere else.",
    ],
  },
  {
    heading: "Two claims, and what actually enforces each",
    paragraphs: [
      "Obelus makes two privacy claims. Different things enforce them, and it is worth keeping them apart.",
      "No third-party script can load. The app is served with a Content-Security-Policy header set by the Worker. Its script-src is 'self': only JavaScript from Obelus's own origin can run, so no third-party origin, CDN or inline script can execute. The browser enforces this from the header — it is not a promise in application code.",
      "Requests go only to your Connection. This one is not enforced by the header. The CSP's connect-src is deliberately broad (*), because a static header cannot list a base URL you type for a Custom Connection or the local Ollama origin. The single-origin property is enforced by the code path instead: before any request leaves, assertWithinConnection requires the request URL to sit inside your Connection's base URL, or the request is refused. Every model pass and the Judge go through this one seam, and a test asserts that the seam only ever sees the configured Connection's base URL.",
      "So script-src 'self' is the header's claim, and only-your-Connection is the code's claim. Obelus does not claim the header enforces the second.",
    ],
  },
  {
    heading: "Verify it yourself",
    paragraphs: [
      "None of the above has to be taken on trust. These steps use browser tools you already have.",
    ],
    steps: [
      {
        title: "Read your own data",
        body: [
          `Open DevTools, then Application, then IndexedDB, then ${PRIVACY_DATABASE_NAME}. Expand the stores and you will find your documents, revisions, findings, reader accounts, raw responses, passes, connections and settings — the actual rows, on this machine. If you chose a session key, you will not find it in connections; it exists only in memory and disappears on reload.`,
        ],
      },
      {
        title: "Watch the network",
        body: [
          "Open DevTools, then Network, and tick Preserve log. Reload, then run a model pass or use Test connection. Every request you see goes to the base URL of the Connection you configured. If you have not configured a Connection yet, reload with this tab open: Obelus makes no outbound request at all.",
        ],
      },
      {
        title: "Read the CSP header",
        body: [
          "With the Network tab open, click the top-level document request and look at Response Headers for content-security-policy. The script-src directive reads 'self', which is what stops any third-party script origin from loading. The same policy is defined in worker/securityHeaders.ts.",
        ],
      },
      {
        title: "Read the source",
        body: [
          "Obelus is GPLv3 and its source is public. The single-origin property lives in the Transport seam (src/wire/transport.ts), and the tests that assert it are next to it.",
        ],
      },
    ],
  },
];

/** Every string in `PRIVACY_SECTIONS`, flattened, so a test can assert what the
 * sections claim. The view's own chrome (the page title) is not included. */
export function privacyProse(): string {
  return PRIVACY_SECTIONS.flatMap((section) => [
    section.heading,
    ...section.paragraphs,
    ...(section.steps ?? []).flatMap((step) => [step.title, ...step.body]),
  ]).join("\n");
}
