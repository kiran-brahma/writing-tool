/**
 * The privacy page's content, as data. Keeping it out of the JSX lets the
 * claims the page must make — no account, no telemetry, where things live, and
 * which claim the header enforces versus which the code path enforces — be
 * asserted by a pure test rather than by reading rendered DOM, which this
 * project deliberately has no test layer for.
 *
 * The voice is a requirement too. The page addresses the reader as "you": it
 * carries no first-person plural and never calls the reader "the Writer", and it
 * keeps the Starter pack's banned words and worn phrases out. The links are part
 * of that: each one is a real `https://` source the reader can follow, so a
 * claim can be checked rather than trusted. The prose is the requirement, not
 * decoration: if a claim, the voice or a link changes, it should fail
 * `privacyContent.test.ts`.
 */

/** A source the reader can open to check a claim for themselves. */
export interface PrivacyLink {
  /** The visible text of the link. */
  readonly label: string;
  readonly href: string;
}

export interface PrivacyStep {
  readonly title: string;
  readonly body: readonly string[];
  readonly links?: readonly PrivacyLink[];
}

export interface PrivacySection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly links?: readonly PrivacyLink[];
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
  "auditAccounts",
  "runResponses",
  "runCache",
  "passes",
  "connections",
  "settings",
];

/** The public source repository, for the links that point a reader at the code. */
export const PRIVACY_SOURCE_URL = "https://github.com/kiran-brahma/writing-tool";

export const PRIVACY_SECTIONS: readonly PrivacySection[] = [
  {
    heading: "What happens to your words",
    paragraphs: [
      "You write in Obelus, and everything runs in your browser. Your Documents stay on this machine until you ask a model to read one.",
      "When you run a model pass, Obelus sends only the text that pass needs. The text goes from this browser tab straight to the Connection you configured. The reply comes back to this tab and is saved here.",
      "You do not sign in, and there is no Obelus account. There is no telemetry, no analytics, no crash or error reporting and no usage counter. The only requests that leave your browser are the ones you trigger.",
      "One server serves the app itself. It sends the app's static files and the security headers described below. It has no API route and never touches a Provider. No Obelus machine sees your key or your prose.",
    ],
  },
  {
    heading: "Where your Documents live",
    paragraphs: [
      `Your Documents and everything derived from them live in your browser's IndexedDB, in a database named ${PRIVACY_DATABASE_NAME}. IndexedDB is local storage, owned by your browser profile on this machine. Obelus does not sync it, upload it, or keep another copy.`,
      "Because your data is local, you can lose it. Clearing your browser data, or a browser eviction, can remove it. That is what the Library's Backup button is for.",
      `The stores you will find are: ${PRIVACY_STORES.join(", ")}.`,
    ],
    links: [
      {
        label: "What IndexedDB is (MDN)",
        href: "https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API",
      },
      {
        label: "Browser storage quotas and eviction (MDN)",
        href: "https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria",
      },
    ],
  },
  {
    heading: "Where your keys live",
    paragraphs: [
      `A Connection holds its key in one of two ways. A persisted key is written to the connections store, in the same ${PRIVACY_DATABASE_NAME} database, beside the Connection. A session key is held only in memory in this tab. Nothing writes it to IndexedDB, and it is gone when the tab reloads. The Connection editor tells you which mode you are using.`,
      "A Library backup leaves keys out unless you tick the box that includes them.",
      "Your key is sent only to the base URL of the Connection you configured, in the auth header that Connection's Protocol calls for. It is never sent anywhere else.",
    ],
  },
  {
    heading: "Two claims, and what enforces each",
    paragraphs: [
      "Obelus makes two privacy claims. Different things enforce them, so keep them apart.",
      "No third-party script can load. The Worker sets a Content-Security-Policy header. Its script-src is 'self', so only JavaScript from Obelus's own origin can run. No third-party origin, CDN or inline script can execute. Your browser enforces this from the header. It is not a promise in application code.",
      "Requests go only to your Connection, and the header does not enforce this one. The CSP's connect-src is deliberately broad (*), because a static header cannot list a base URL you type for a Custom Connection or the local Ollama origin. The code path enforces it instead. Before any request leaves, assertWithinConnection checks that the request URL sits inside your Connection's base URL. A URL outside it is refused. Every model pass and the Judge go through this one seam, and a test asserts that the seam only ever sees the base URL you configured.",
      "So script-src 'self' is the header's claim, and only-your-Connection is the code's claim. Obelus does not claim the header enforces the second.",
    ],
    links: [
      {
        label: "Content-Security-Policy reference (MDN)",
        href: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy",
      },
      {
        label: "The security headers Obelus sets (source)",
        href: `${PRIVACY_SOURCE_URL}/blob/main/worker/securityHeaders.ts`,
      },
      {
        label: "The Transport seam that enforces one origin (source)",
        href: `${PRIVACY_SOURCE_URL}/blob/main/src/wire/transport.ts`,
      },
      {
        label: "The test that asserts a single origin (source)",
        href: `${PRIVACY_SOURCE_URL}/blob/main/src/wire/transport.test.ts`,
      },
    ],
  },
  {
    heading: "Verify it yourself",
    paragraphs: [
      "You do not have to take any of this on trust. Use the browser tools you already have.",
    ],
    links: [
      {
        label: "How to open DevTools (MDN)",
        href: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Tools_and_setup/What_are_browser_developer_tools",
      },
    ],
    steps: [
      {
        title: "Read your own data",
        body: [
          `Open DevTools, then Application, then IndexedDB, then ${PRIVACY_DATABASE_NAME}. Expand the stores. You will find your documents, revisions, findings, reader accounts, raw responses, the run cache, passes, connections and settings: the actual rows, on this machine. If you chose a session key, you will not find it in connections. That key exists only in memory, and it disappears on reload.`,
        ],
      },
      {
        title: "Watch the network",
        body: [
          "Open DevTools, then Network, and tick Preserve log. Reload, then run a model pass or use Test connection. Every request you see goes to the base URL of the Connection you configured. If you have not configured a Connection yet, reload with this tab open. Obelus makes no outbound request at all.",
        ],
      },
      {
        title: "Read the CSP header",
        body: [
          "With the Network tab open, click the top-level document request. Look at Response Headers for content-security-policy. The script-src directive reads 'self', which stops any third-party script origin from loading. The same policy is defined in worker/securityHeaders.ts.",
        ],
      },
      {
        title: "Read the source",
        body: [
          "Obelus is GPLv3, and its source is public. The single-origin check lives in the Transport seam (src/wire/transport.ts), and the tests that assert it sit next to it.",
        ],
        links: [
          { label: "The Obelus source (GitHub)", href: PRIVACY_SOURCE_URL },
        ],
      },
    ],
  },
];

/** Every link on the page, section-level and step-level, flattened. */
export function privacyLinks(): readonly PrivacyLink[] {
  return PRIVACY_SECTIONS.flatMap((section) => [
    ...(section.links ?? []),
    ...(section.steps ?? []).flatMap((step) => step.links ?? []),
  ]);
}

/** Every string in `PRIVACY_SECTIONS`, flattened — headings, paragraphs, step
 * titles and bodies, and link labels — so a test can assert what the sections
 * claim and how they read. The view's own chrome (the page title) is not
 * included. */
export function privacyProse(): string {
  return PRIVACY_SECTIONS.flatMap((section) => [
    section.heading,
    ...section.paragraphs,
    ...(section.links ?? []).map((link) => link.label),
    ...(section.steps ?? []).flatMap((step) => [
      step.title,
      ...step.body,
      ...(step.links ?? []).map((link) => link.label),
    ]),
  ]).join("\n");
}
