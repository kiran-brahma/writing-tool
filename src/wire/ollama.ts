import type { Connection } from "./connection";

/**
 * Local Ollama refuses a browser request from any origin it has not been told
 * to allow, and the browser reports the refused preflight as a bare "Failed to
 * fetch". The fix is on the Writer's machine (`OLLAMA_ORIGINS`), never a route
 * around it (ADR 0002), so the most Obelus can do is name the exact step.
 */

const OLLAMA_PORT = "11434";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

/** True for a Connection whose base URL is an Ollama daemon on this machine. */
export function isLocalOllama(connection: Connection): boolean {
  let base: URL;
  try {
    base = new URL(connection.baseUrl);
  } catch {
    return false;
  }
  return LOOPBACK_HOSTS.has(base.hostname) && base.port === OLLAMA_PORT;
}

/** The origin this page is served from, or null outside a browser. */
export function pageOrigin(): string | null {
  const origin = (globalThis as { location?: { origin?: unknown } }).location?.origin;
  return typeof origin === "string" && origin !== "null" ? origin : null;
}

/**
 * Ollama allows loopback origins by default, so a page served from this machine
 * needs no `OLLAMA_ORIGINS` at all: a failure there means the daemon is down.
 */
export function originNeedsAllowing(origin: string): boolean {
  try {
    return !LOOPBACK_HOSTS.has(new URL(origin).hostname);
  } catch {
    return true;
  }
}

/** The per-platform commands that allow `origin`, as the Writer would type them. */
export function allowOriginCommands(origin: string): {
  macos: string;
  windows: string;
  linuxServiceLine: string;
} {
  return {
    macos: `launchctl setenv OLLAMA_ORIGINS "${origin}"`,
    windows: `setx OLLAMA_ORIGINS "${origin}"`,
    linuxServiceLine: `Environment="OLLAMA_ORIGINS=${origin}"`,
  };
}

/**
 * What to say when a local Ollama Connection could not be reached. Replaces
 * the generic "check the base URL and key" advice, which points at the wrong
 * thing: local Ollama has no key, and its base URL is almost always right.
 */
export function ollamaUnreachableAdvice(origin: string | null): string {
  if (origin !== null && !originNeedsAllowing(origin)) {
    return (
      `Ollama does not appear to be running. Open the Ollama app, or run "ollama serve", ` +
      `then use "Test connection".`
    );
  }
  const site = origin ?? "this site's address";
  const commands = allowOriginCommands(site);
  return (
    `Either Ollama is not running, or it has not been told to allow ${site}. ` +
    `On macOS, run ${commands.macos} then quit Ollama from the menu bar and open it again. ` +
    `On Windows or Linux, set OLLAMA_ORIGINS to ${site} and restart Ollama. ` +
    `If OLLAMA_ORIGINS is already set, add ${site} to it, separated by a comma. ` +
    `Then use "Test connection". The Ollama (local) card in AI Settings has the full steps.`
  );
}
