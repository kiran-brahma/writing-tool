import type { Finding } from "../core/finding";
import type { Pass } from "../core/pass";
import { reconcileFindings } from "../core/reconcile";
import { ruleMatches, runRulePass, type RuleMatch } from "../core/rulePass";
import { listFindingsForPass, replaceFindingsForPass } from "./findings";
import { enqueueMutation } from "./mutationQueue";
import type { DocumentRecord, ObelusDatabase } from "./obelusDatabase";
import { ensureRevision } from "./revisions";

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
 * Rule runs are serialised with status writes through `enqueueMutation`. A
 * save, a `pagehide` flush and a milestone flag can overlap, and each does a
 * read-modify-write of a Pass's Findings; without ordering the last writer can
 * persist findings for text the Document has already left, or reset a status
 * the Writer set.
 */
export function runRulePasses(
  database: ObelusDatabase,
  document: DocumentRecord,
  options: RuleRunOptions,
): Promise<Finding[]> {
  return enqueueMutation(database, () => runRulePassesNow(database, document, options));
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

  // A Finding must name the Revision current when it was produced, so a Run
  // that found something needs one; re-running over clean prose takes nothing
  // and so never mints an empty baseline Revision.
  const needsRevision = runs.some((run) => run.matches.length > 0);
  const revision = needsRevision ? await ensureRevision(database, document, now) : null;
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
