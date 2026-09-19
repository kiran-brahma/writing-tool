import type { Finding } from "../core/finding";
import type { Pass } from "../core/pass";

export interface PassGroup {
  id: string;
  name: string;
  findings: Finding[];
}

/**
 * Groups Findings under the Passes that produced them, in the order the Passes
 * are listed. Findings within a group keep the order Core gave them, which is
 * document order. A Pass with no Findings is omitted.
 */
export function groupFindingsByPass(findings: Finding[], passes: Pass[]): PassGroup[] {
  return passes
    .map((pass) => ({
      id: pass.id,
      name: pass.name,
      findings: findings.filter((finding) => finding.passId === pass.id),
    }))
    .filter((group) => group.findings.length > 0);
}
