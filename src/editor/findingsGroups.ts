import type { Finding } from "../core/finding";
import { workingOrder, type Pass } from "../core/pass";

export interface PassGroup {
  id: string;
  name: string;
  findings: Finding[];
}

/**
 * The group Findings whose Pass has left the set (a restored Starter pack, an
 * imported Pass set) are shown under. The id is not a Pass id, so it cannot
 * collide with one.
 */
export const ORPHANED_GROUP_ID = "orphaned-findings";

/**
 * Groups Findings under the Passes that produced them, in the recommended
 * working order — structure, then paragraph, then word (stories 146–148) — so
 * the sidebar and the `j`/`k` queue work globally before locally. Within a
 * group, Findings keep the order Core gave them, which is document order. A
 * Pass with no Findings is omitted.
 *
 * A Finding whose Pass is no longer in the set is not hidden: it gets a trailing
 * group, so the **All** queue stays true to ADR 0010's promise that navigating
 * by Band never hides work.
 */
export function groupFindingsByPass(findings: Finding[], passes: Pass[]): PassGroup[] {
  const groups = workingOrder(passes, findings).groups.flatMap((group) =>
    group.passes.map((pass) => ({
      id: pass.id,
      name: pass.name,
      findings: group.findings.filter((finding) => finding.passId === pass.id),
    })),
  );
  const known = new Set(passes.map((pass) => pass.id));
  const orphans = findings.filter((finding) => !known.has(finding.passId));
  if (orphans.length > 0) {
    groups.push({ id: ORPHANED_GROUP_ID, name: "Pass no longer in the set", findings: orphans });
  }
  return groups.filter((group) => group.findings.length > 0);
}
