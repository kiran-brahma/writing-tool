import { readFileSync } from "node:fs";
import { join } from "node:path";
import { finding } from "./scan.mjs";

/**
 * Build gate: the Content-Security-Policy has one source of truth.
 *
 * It is declared twice — `worker/securityHeaders.ts` sets it on every Cloudflare
 * response, and `vercel.json` repeats it for the second deploy target. A
 * copy-pasted security policy drifts silently, and a weaker copy is not a
 * cosmetic problem. The gate does not choose a target: it asserts the two copies
 * agree, so the duplication cannot rot unnoticed.
 */

/** The CSP the Worker builds, from the array it joins into a header. */
export function workerCsp(sourceText) {
  const start = sourceText.indexOf("CONTENT_SECURITY_POLICY = [");
  const end = sourceText.indexOf("].join");
  if (start === -1 || end === -1) return null;
  return [...sourceText.slice(start, end).matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .join("; ");
}

/** The CSP `vercel.json` declares, or null when it declares none. */
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
  const vercel = vercelCsp(JSON.parse(readFileSync(join(repoRoot, "vercel.json"), "utf8")));

  if (worker === null) {
    return [
      finding("worker/securityHeaders.ts", 1, "could not read CONTENT_SECURITY_POLICY from the Worker."),
    ];
  }
  if (vercel === null) {
    return [finding("vercel.json", 1, "vercel.json declares no Content-Security-Policy header.")];
  }
  if (worker !== vercel) {
    return [
      finding(
        "vercel.json",
        1,
        "the Content-Security-Policy here differs from worker/securityHeaders.ts, so one deploy\n" +
          `        target now serves a different policy.\n        worker: ${worker}\n        vercel: ${vercel}`,
      ),
    ];
  }
  return [];
}
