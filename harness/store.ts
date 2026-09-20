import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HarnessReport } from "./constitution";

/**
 * The harness stores its result locally, timestamped, so a run before a prompt
 * change leaves the evidence of what was green. `.scratch/` is gitignored: the
 * result is the Writer's local record, not a repository artifact.
 */
const HARNESS_RESULTS_DIR = ".scratch/harness";

export function storeHarnessReport(repoRoot: string, report: HarnessReport): string {
  const directory = join(repoRoot, HARNESS_RESULTS_DIR);
  mkdirSync(directory, { recursive: true });

  const json = `${JSON.stringify(report, null, 2)}\n`;
  const stamped = join(directory, `${timestampFor(report.ranAt)}.json`);
  writeFileSync(stamped, json, "utf8");
  writeFileSync(join(directory, "latest.json"), json, "utf8");
  return stamped;
}

function timestampFor(at: number): string {
  return new Date(at).toISOString().replace(/[:.]/g, "-");
}
