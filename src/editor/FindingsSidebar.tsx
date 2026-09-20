import { useEffect, useRef, type Ref } from "react";
import { isOpenFinding, type Finding } from "../core/finding";
import type { Pass } from "../core/pass";
import { groupFindingsByPass } from "./findingsGroups";

/**
 * The sidebar is grouped by Pass rather than by location, because the Writer
 * works one Pass over the whole Document before starting the next. Within a
 * Pass, Core already ordered the Findings in document order.
 *
 * Only open Findings are the queue: addressing or declining one leaves it, so
 * the group's count is its open count and any Finding that has left the queue
 * is muted. Those rows stay visible because declining is logged, not erased.
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
}

export function FindingsSidebar({
  findings,
  passes,
  currentFindingId,
  onSelect,
  showRawResponse,
  rawResponses,
}: FindingsSidebarProps) {
  const groups = groupFindingsByPass(findings, passes);
  const currentRowRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentFindingId]);

  if (groups.length === 0) {
    return (
      <p className="px-4 py-4 text-sm text-stone-500">
        No findings yet. Rule passes run free, with no Connection and no key.
      </p>
    );
  }

  return (
    <div>
      <p className="border-b border-stone-200 bg-stone-100 px-4 py-2 text-xs text-stone-500">
        <kbd className="font-sans font-medium text-stone-700">j</kbd> /{" "}
        <kbd className="font-sans font-medium text-stone-700">k</kbd> move ·{" "}
        <kbd className="font-sans font-medium text-stone-700">a</kbd> address ·{" "}
        <kbd className="font-sans font-medium text-stone-700">x</kbd> decline
      </p>
      {groups.map((group) => {
        const openCount = group.findings.filter((finding) => finding.status === "open").length;
        return (
          <section key={group.id} className="border-b border-stone-200">
            <h3 className="flex items-baseline justify-between gap-2 bg-stone-200/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-stone-600">
              <span>{group.name}</span>
              <span className="font-normal normal-case text-stone-500">{openCount} open</span>
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
                    {...(showRawResponse ? { rawResponse: rawResponses[finding.passId] } : {})}
                    {...(current ? { rowRef: currentRowRef } : {})}
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

interface FindingRowProps {
  finding: Finding;
  current: boolean;
  onSelect: (findingId: string) => void;
  rowRef?: Ref<HTMLLIElement>;
  rawResponse?: string;
}

function FindingRow({ finding, current, onSelect, rowRef, rawResponse }: FindingRowProps) {
  const attached = finding.anchor.state === "attached";
  const leftQueue = !isOpenFinding(finding);

  return (
    <li ref={rowRef} className="border-b border-stone-200/70 last:border-b-0">
      <button
        type="button"
        onClick={() => onSelect(finding.id)}
        aria-current={current ? "true" : undefined}
        className={[
          "w-full px-4 py-3 text-left text-sm transition-colors",
          current ? "bg-amber-100/70" : "hover:bg-stone-200/50",
          leftQueue ? "opacity-60" : "",
        ].join(" ")}
      >
        <p className="flex items-start gap-2 text-stone-800">
          <span className="font-mono text-xs text-stone-500">“{finding.anchor.quote}”</span>
          <span className="font-medium">{finding.issue}</span>
        </p>
        <p className="mt-1 text-stone-600">{finding.diagnosis}</p>
        {!attached && (
          <p className="mt-1 text-xs italic text-stone-500">No longer found in the text.</p>
        )}
        <p className="mt-1 text-xs text-stone-400">
          {finding.provenance.model} · {new Date(finding.provenance.at).toLocaleString()}
          {leftQueue && (
            <span className="ml-2 rounded bg-stone-300/70 px-1.5 py-0.5 font-medium text-stone-700">
              {finding.status}
              {finding.declineReason === undefined ? "" : ` · ${finding.declineReason}`}
            </span>
          )}
        </p>
      </button>
      {rawResponse !== undefined && rawResponse !== "" && (
        <pre className="mx-4 mb-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-stone-900/90 p-2 font-mono text-xs text-stone-100">
          {rawResponse}
        </pre>
      )}
    </li>
  );
}
