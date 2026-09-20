import { useEffect, useState } from "react";
import type { Violation } from "../core/finding";
import type { Pass } from "../core/pass";
import type { ReaderAccountRecord } from "../storage/obelusDatabase";
import { QuarantinedRewrite, StruckText, StruckViolations } from "./ViolationDisplay";
import { splitViolations, violationsOutsideText } from "./violationMarks";

/**
 * Stories 91–93: the Reader accounts tab. It shows what each Section
 * communicates, what a distracted reader would miss, and the gap between the
 * two — the Reader pass's own output shape, kept apart from the Findings queue
 * so reader analysis never mixes with problems that still need work.
 *
 * Like the Findings display, nothing here can put text into the Document: an
 * account is analysis, a rewrite the linter caught is quarantined behind
 * `QuarantinedRewrite`, and praise is struck through rather than hidden.
 */
export interface ReaderPanelProps {
  /** The model Passes whose output is a Reader account. */
  passes: Pass[];
  /** The Document's accounts, already in Section order. */
  accounts: ReaderAccountRecord[];
  running: boolean;
  /** When the running Reader pass started, for the elapsed timer. */
  runningSince: number | null;
  error: string | null;
  criticName: string | null;
  onRun: (passId: string) => void;
  onToggle: (passId: string, enabled: boolean) => void;
}

export function ReaderPanel({
  passes,
  accounts,
  running,
  runningSince,
  error,
  criticName,
  onRun,
  onToggle,
}: ReaderPanelProps) {
  return (
    <div>
      <p className="border-b border-stone-200 bg-stone-100 px-4 py-2 text-xs text-stone-500">
        {criticName === null
          ? "No critic assigned"
          : `Reader accounts use the critic Connection: ${criticName}`}
      </p>

      {passes.length === 0 && (
        <p className="px-4 py-4 text-sm text-stone-500">
          No Reader pass is configured. The Starter pack adds one.
        </p>
      )}

      {passes.map((pass) => (
        <div key={pass.id} className="flex items-start gap-2 border-b border-stone-200 px-4 py-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={pass.enabled}
            aria-label={`Enable ${pass.name}`}
            onChange={(event) => onToggle(pass.id, event.target.checked)}
          />
          <div className="min-w-0 flex-1">
            <p
              className={
                pass.enabled
                  ? "text-sm font-medium text-stone-800"
                  : "text-sm font-medium text-stone-400"
              }
            >
              {pass.name}
            </p>
            <p className="mt-0.5 text-xs text-stone-500">{pass.description}</p>
          </div>
          {running ? (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-stone-600">
              <span
                className="h-3 w-3 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700"
                aria-hidden="true"
              />
              {runningSince === null ? null : <ElapsedTimer since={runningSince} />}
            </span>
          ) : (
            <button
              type="button"
              disabled={!pass.enabled || running}
              onClick={() => onRun(pass.id)}
              className="shrink-0 rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Read every Section
            </button>
          )}
        </div>
      ))}

      {error !== null && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {error}
        </p>
      )}

      {accounts.length === 0 ? (
        <p className="px-4 py-4 text-sm text-stone-500">
          No Reader accounts yet. Run the Reader pass to see what each Section communicates.
        </p>
      ) : (
        <ol>
          {accounts.map((account, index) => (
            <ReaderAccountRow
              key={account.id}
              account={account}
              first={
                index === 0 ||
                accounts[index - 1].section.headingBlockIndex !== account.section.headingBlockIndex
              }
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function ReaderAccountRow({ account, first }: { account: ReaderAccountRecord; first: boolean }) {
  const violations = account.violations ?? [];
  const { strikes, rewrites } = splitViolations(violations);
  // Praise or a rewrite the model put outside the three fields still shows,
  // struck through, rather than being persisted but invisible.
  const elsewhere = violationsOutsideText(
    [account.whatItSays, account.whatIsMissed, account.gap],
    violations,
  );

  return (
    <li className="border-b border-stone-200/70 px-4 py-3 last:border-b-0">
      {first && (
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
          {account.section.heading}
        </h3>
      )}
      <p className="text-xs text-stone-400">
        Read at {new Date(account.provenance.at).toLocaleString()} · {account.provenance.model}
      </p>

      <AccountField label="What this Section says" text={account.whatItSays} strikes={strikes} />
      <AccountField
        label="What a distracted reader would miss"
        text={account.whatIsMissed}
        strikes={strikes}
      />
      <AccountField label="The gap" text={account.gap} strikes={strikes} />

      {violations.length > 0 && (
        <div className="mt-2">
          {elsewhere.length > 0 && (
            <p className="text-xs text-stone-500">
              Model drift: <StruckViolations violations={elsewhere} />
            </p>
          )}
          {rewrites.length > 0 && <QuarantinedRewrite violations={rewrites} />}
        </div>
      )}
    </li>
  );
}

function AccountField({
  label,
  text,
  strikes,
}: {
  label: string;
  text: string;
  strikes: Violation[];
}) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-stone-600">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-stone-800">
        <StruckText text={text} violations={strikes} />
      </p>
    </div>
  );
}

/** The elapsed time of an in-flight Reader run, refreshed while it runs. */
function ElapsedTimer({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = globalThis.setInterval(() => setNow(Date.now()), 100);
    return () => globalThis.clearInterval(interval);
  }, []);

  return <span className="tabular-nums">{((now - since) / 1000).toFixed(1)}s</span>;
}
