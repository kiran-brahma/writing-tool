import { readFileSync } from "node:fs";
import { join } from "node:path";
import { finding } from "./scan.mjs";

/**
 * Build gate: the Content-Security-Policy has one source of truth.
 *
 * `worker/securityHeaders.ts` sets it on every Cloudflare response, which is the
 * supported target. `docs/reference/vercel.json` repeats it for the optional
 * Vercel deploy path, where the Worker does not run. A copy-pasted security
 * policy drifts silently, and a weaker copy is not a cosmetic problem, so the
 * two must stay byte-equal — the reference may be unused, but it must not be
 * wrong.
 */

/** Where the optional Vercel reference lives, relative to the repo root. */
export const VERCEL_REFERENCE = "docs/reference/vercel.json";

/** The CSP the Worker builds, from the array it joins into a header. */
export function workerCsp(sourceText) {
  const start = sourceText.indexOf("CONTENT_SECURITY_POLICY = [");
  const end = sourceText.indexOf("].join");
  if (start === -1 || end === -1) return null;
  return [...sourceText.slice(start, end).matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .join("; ");
}

/** The CSP the Vercel reference declares, or null when it declares none. */
export function vercelCsp(vercelJson) {
  for (const header of vercelJson.headers ?? []) {
    for (const entry of header.headers ?? []) {
      if (entry.key === "Content-Security-Policy") return entry.value;
    }
  }
  return null;
}

export function checkSecurityHeaderParity({ repoRoot }) {
  const worker = workerCsp(readFileSync(join(repoRoot, "worker/securityHeaders.ts"), "utf8"));
  const vercel = vercelCsp(
    JSON.parse(readFileSync(join(repoRoot, VERCEL_REFERENCE), "utf8")),
  );

  if (worker === null) {
    return [
      finding("worker/securityHeaders.ts", 1, "could not read CONTENT_SECURITY_POLICY from the Worker."),
    ];
  }
  if (vercel === null) {
    return [
      finding(VERCEL_REFERENCE, 1, `the Vercel reference declares no Content-Security-Policy header.`),
    ];
  }
  if (worker !== vercel) {
    return [
      finding(
        VERCEL_REFERENCE,
        1,
        "the Content-Security-Policy here differs from worker/securityHeaders.ts, so the \n" +
          `        reference would serve a different policy than the supported target.\n        worker: ${worker}\n        vercel: ${vercel}`,
      ),
    ];
  }
  return [];
}
