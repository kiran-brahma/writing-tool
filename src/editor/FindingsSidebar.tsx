import { responseKey, type DeclineReason, type Finding } from "../core/finding";
import type { Pass } from "../core/pass";
import { groupFindingsByPass, ORPHANED_GROUP_ID } from "./findingsGroups";
import { FindingRow } from "./FindingRow";
import { PANEL_GLOSSES, type HelpSectionId } from "../help/helpContent";

/**
 * The **All** queue: every open Finding across every Pass, grouped by the Pass
 * that produced it in the recommended working order. It is not a Band (ADR
 * 0010) — it is the whole queue in one place, so navigating by Band never hides
 * work from the Writer.
 *
 * Only open Findings are the queue: addressing or declining one leaves it, so
 * the group's count is its open count and any Finding that has left the queue is
 * muted. Those rows stay visible because declining is logged, not erased.
 */
export interface FindingsSidebarProps {
  findings: Finding[];
  passes: Pass[];
  currentFindingId: string | null;
  onSelect: (findingId: string) => void;
  /** Story 73: the global raw-response toggle. */
  showRawResponse: boolean;
  /** The most recent raw response per Pass, keyed by Pass id. */
  rawResponses: Record<string, string>;
  /** Story 72: decline a Finding, recording why — `advice` or `violation`. */
  onDecline: (findingId: string, reason: DeclineReason) => void;
  /**
   * Stories 179 and 182: decline the remaining open Findings in one Pass. It is
   * offered on a Pass group only, never on **All** and never on a Band.
   */
  onDeclineRest: (passId: string) => void;
  /** Story 181: return a Finding that left the queue to `open`. */
  onReopen: (findingId: string) => void;
  onOpenHelp?: (sectionId: HelpSectionId) => void;
}

export function FindingsSidebar({
  findings,
  passes,
  currentFindingId,
  onSelect,
  showRawResponse,
  rawResponses,
  onDecline,
  onDeclineRest,
  onReopen,
  onOpenHelp,
}: FindingsSidebarProps) {
  const groups = groupFindingsByPass(findings, passes);

  const gloss = (
    <p className="border-b border-rule-soft px-4 py-2 text-xs text-muted-ink">
      {PANEL_GLOSSES.allFindings.text}{" "}
      <button
        type="button"
        onClick={() => onOpenHelp?.(PANEL_GLOSSES.allFindings.sectionId)}
        className="rounded px-0.5 underline hover:text-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        How this works
      </button>
    </p>
  );

  if (groups.length === 0) {
    return (
      <div>
        {gloss}
        <p className="px-4 py-4 text-sm text-muted-ink">
          No findings across any pass. Rule passes run free, with no connection and no key.
        </p>
      </div>
    );
  }

  return (
    <div>
      {gloss}
      {groups.map((group) => {
        const openCount = group.findings.filter((finding) => finding.status === "open").length;
        return (
          <section key={group.id} className="border-b border-rule-soft">
            <h3 className="flex items-baseline justify-between gap-2 bg-sunk-strong/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-ink">
              <span>{group.name}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-normal normal-case text-muted-ink">{openCount} open</span>
                {openCount > 0 && group.id !== ORPHANED_GROUP_ID && (
                  <button
                    type="button"
                    onClick={() => onDeclineRest(group.id)}
                    title={`Decline every open finding in ${group.name} as advice`}
                    className="rounded border border-rule bg-paper px-2 py-0.5 font-normal normal-case text-quiet-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    Decline the rest
                  </button>
                )}
              </span>
            </h3>
            <ol>
              {group.findings.map((finding) => {
                const current = finding.id === currentFindingId;
                return (
                  <FindingRow
                    key={finding.id}
                    finding={finding}
                    current={current}
                    onSelect={onSelect}
                    onDecline={onDecline}
                    onReopen={onReopen}
                    {...(showRawResponse
                      ? { rawResponse: rawResponses[responseKey(finding.passId, finding.promptHash)] }
                      : {})}
                  />
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
