import type { Finding } from "../core/finding";
import type { Pass } from "../core/pass";

/**
 * The sidebar is grouped by Pass rather than by location, because the Writer
 * works one Pass over the whole Document before starting the next. Within a
 * Pass, Core already ordered the Findings in document order.
 */
export interface FindingsSidebarProps {
  findings: Finding[];
  passes: Pass[];
}

export function FindingsSidebar({ findings, passes }: FindingsSidebarProps) {
  const groups = groupByPass(findings, passes);

  if (groups.length === 0) {
    return (
      <p className="px-4 py-4 text-sm text-stone-500">
        No findings yet. Rule passes run free, with no Connection and no key.
      </p>
    );
  }

  return (
    <div>
      {groups.map((group) => (
        <section key={group.id} className="border-b border-stone-200">
          <h3 className="flex items-baseline justify-between gap-2 bg-stone-200/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-stone-600">
            <span>{group.name}</span>
            <span className="font-normal normal-case text-stone-500">{group.findings.length}</span>
          </h3>
          <ol>
            {group.findings.map((finding) => (
              <FindingRow key={finding.id} finding={finding} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const attached = finding.anchor.state === "attached";

  return (
    <li className="border-b border-stone-200/70 px-4 py-3 text-sm last:border-b-0">
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
        {finding.status !== "open" && ` · ${finding.status}`}
      </p>
    </li>
  );
}

interface PassGroup {
  id: string;
  name: string;
  findings: Finding[];
}

function groupByPass(findings: Finding[], passes: Pass[]): PassGroup[] {
  return passes
    .map((pass) => ({
      id: pass.id,
      name: pass.name,
      findings: findings.filter((finding) => finding.passId === pass.id),
    }))
    .filter((group) => group.findings.length > 0);
}
