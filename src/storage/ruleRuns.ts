import type { Finding } from "../core/finding";
import type { Pass } from "../core/pass";
import { hasUnmatchedSpan, reconcileFindings } from "../core/reconcile";
import { ruleMatches, runRulePass, type RuleMatch } from "../core/rulePass";
import { listFindingsForPass, replaceFindingsForPass } from "./findings";
import type { DocumentRecord, ObelusDatabase } from "./obelusDatabase";
import { ensureRevisionForCanonical } from "./revisions";

/**
 * Runs the enabled rule Passes over a Document's canonical string, reconciles
 * each Pass's Findings against what is already stored, and persists the result.
 *
 * A rule Pass is free and offline, so this is safe to call on every save and on
 * open. It never touches the Transport.
 */
export interface RuleRunOptions {
  passes: Pass[];
  now?: number;
}

/**
 * Rule runs are serialised per database. A save, a `pagehide` flush and a
 * milestone flag can overlap, and each does a read-modify-write of a Pass's
 * Findings; without ordering the last writer can persist findings for text the
 * Document has already left.
 */
const ruleRunQueues = new WeakMap<ObelusDatabase, Promise<void>>();

export async function runRulePasses(
  database: ObelusDatabase,
  document: DocumentRecord,
  options: RuleRunOptions,
): Promise<Finding[]> {
  const previous = ruleRunQueues.get(database) ?? Promise.resolve();
  const queued = previous.then(() => runRulePassesNow(database, document, options));
  // Keep later runs ordered even if this one fails; the failure still reaches
  // this call's caller.
  ruleRunQueues.set(
    database,
    queued.then(
      () => undefined,
      () => undefined,
    ),
  );
  return queued;
}

async function runRulePassesNow(
  database: ObelusDatabase,
  document: DocumentRecord,
  options: RuleRunOptions,
): Promise<Finding[]> {
  const now = options.now ?? Date.now();
  const runs: { pass: Pass; matches: RuleMatch[]; existing: Finding[] }[] = [];
  for (const pass of options.passes) {
    if (pass.kind !== "rule" || !pass.enabled) continue;
    runs.push({
      pass,
      matches: ruleMatches(document.canonical, pass),
      existing: await listFindingsForPass(database, document.id, pass.id),
    });
  }

  // A Finding must name the Revision whose canonical its Anchor was measured
  // against, so a Revision is taken only when the Run has a span the stored
  // Findings do not already cover. Re-finding a stored span changes nothing.
  const hasNew = runs.some((run) =>
    hasUnmatchedSpan(run.matches, run.existing, document.canonical),
  );
  const revision = hasNew ? await ensureRevisionForCanonical(database, document, now) : null;
  const findings: Finding[] = [];

  for (const { pass, existing } of runs) {
    const produced =
      revision === null
        ? []
        : runRulePass(document.canonical, pass, { at: now, revisionId: revision.id });
    const merged = reconcileFindings(produced, existing, document.canonical);
    await replaceFindingsForPass(database, document.id, pass.id, merged);
    findings.push(...merged);
  }

  return findings;
}
