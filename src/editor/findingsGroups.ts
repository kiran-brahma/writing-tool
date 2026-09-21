import type { Finding } from "../core/finding";
import { workingOrder, type Pass } from "../core/pass";

export interface PassGroup {
  id: string;
  name: string;
  findings: Finding[];
}

/**
 * Groups Findings under the Passes that produced them, in the recommended
 * working order — structure, then paragraph, then word (stories 146–148) — so
 * the sidebar and the `j`/`k` queue work globally before locally. Within a
 * group, Findings keep the order Core gave them, which is document order. A
 * Pass with no Findings is omitted.
 */
export function groupFindingsByPass(findings: Finding[], passes: Pass[]): PassGroup[] {
  const ordered = workingOrder(passes).groups.flatMap((group) => group.passes);
  return ordered
    .map((pass) => ({
      id: pass.id,
      name: pass.name,
      findings: findings.filter((finding) => finding.passId === pass.id),
    }))
    .filter((group) => group.findings.length > 0);
}
