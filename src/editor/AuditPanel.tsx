import type { AuditAccount } from "../core/audit";
import type { Violation } from "../core/finding";
import type { Pass } from "../core/pass";
import type { AuditAccountRecord } from "../storage/obelusDatabase";
import type { AuditRunReport } from "../useDocument";
import { ElapsedTimer } from "./ElapsedTimer";
import { QuarantinedRewrite, StruckText, StruckViolations } from "./ViolationDisplay";
import { splitViolations, violationsOutsideText } from "./violationMarks";

/**
 * Stories 118–136: the Audit surface. It shows the whole-piece account the
 * Audit pass returned — what type of piece it read, its argument map, whether
 * the reasoning is deductive or inductive, its soundness, any enthymemes,
 * fallacies, definitions and the one or two things to fix first. The account is
 * its own output shape, shown beside Findings and Reader accounts, never mixed
 * with either.
 *
 * Nothing here can put text into the Document: an account is analysis, a
 * rewrite the linter caught is quarantined behind `QuarantinedRewrite`, and
 * praise is struck through rather than hidden.
 */
export interface AuditPanelProps {
  /** The model Passes whose output is an Audit account. */
  passes: Pass[];
  /** The Document's Audit accounts. */
  accounts: AuditAccountRecord[];
  running: boolean;
  /** When the running Audit pass started, for the elapsed timer. */
  runningSince: number | null;
  error: string | null;
  /** The most recent Audit Run's chunk count and drift, keyed by Pass. */
  report: AuditRunReport | null;
  criticName: string | null;
  onRun: (passId: string) => void;
  onToggle: (passId: string, enabled: boolean) => void;
}

export function AuditPanel({
  passes,
  accounts,
  running,
  runningSince,
  error,
  report,
  criticName,
  onRun,
  onToggle,
}: AuditPanelProps) {
  return (
    <div>
      <p className="border-b border-stone-200 bg-stone-100 px-4 py-2 text-xs text-stone-500">
        {criticName === null
          ? "No critic assigned"
          : `Audit accounts use the critic Connection: ${criticName}`}
      </p>

      {passes.length === 0 && (
        <p className="px-4 py-4 text-sm text-stone-500">
          No Audit pass is configured. The Starter pack adds one.
        </p>
      )}

      {passes.map((pass) => {
        const runReport = report?.passId === pass.id ? report : null;
        const { strikes } = splitViolations(runReport?.violations ?? []);
        return (
          <div key={pass.id} className="border-b border-stone-200 px-4 py-3">
            <div className="flex items-start gap-2">
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
                  Audit the whole piece
                </button>
              )}
            </div>
            {runReport !== null && (
              <p className="mt-1 pl-6 text-xs text-stone-500">
                {runReport.chunks <= 1
                  ? "Read in a single call."
                  : `Read in ${runReport.chunks} overlapping chunks, then synthesized.`}
              </p>
            )}
            {runReport !== null && strikes.length > 0 && (
              <p className="mt-1 pl-6 text-xs text-stone-500">
                Model drift, struck through rather than hidden:{" "}
                <StruckViolations violations={strikes} />
              </p>
            )}
          </div>
        );
      })}

      {error !== null && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {error}
        </p>
      )}

      {accounts.length === 0 ? (
        <p className="px-4 py-4 text-sm text-stone-500">
          No Audit account yet. Run the Audit pass to see whether the piece's reasoning holds up.
        </p>
      ) : (
        <ol>
          {accounts.map((account) => (
            <AuditAccountRow key={account.id} account={account} />
          ))}
        </ol>
      )}
    </div>
  );
}

function AuditAccountRow({ account }: { account: AuditAccountRecord }) {
  const violations = account.violations ?? [];
  const { strikes, rewrites } = splitViolations(violations);
  // A violation the account's rendered text does not contain still shows,
  // struck through, rather than being persisted but invisible.
  const elsewhere = violationsOutsideText(renderedTexts(account), violations);

  return (
    <li className="border-b border-stone-200/70 px-4 py-3 last:border-b-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
        {account.type === "argument" ? "Argument" : "Observation"}
      </p>
      <p className="mt-0.5 text-xs text-stone-400">
        Audited {new Date(account.provenance.at).toLocaleString()} · {account.provenance.model}
      </p>

      <Field label="The central claim" text={account.corePayload} strikes={strikes} />

      {account.argumentMap !== undefined && (
        <div className="mt-3">
          <p className="text-xs font-medium text-stone-600">Argument map</p>
          <List label="Premises" entries={account.argumentMap.premises} strikes={strikes} />
          <List
            label="Sub-conclusions"
            entries={account.argumentMap.subConclusions}
            strikes={strikes}
          />
          <Field label="Conclusion" text={account.argumentMap.conclusion} strikes={strikes} />
        </div>
      )}

      {account.reasoning !== undefined && (
        <div className="mt-3">
          <p className="text-xs font-medium text-stone-600">
            {account.reasoning.kind === "deductive" ? "Deductive reasoning" : "Inductive reasoning"}
          </p>
          {account.reasoning.form !== undefined && (
            <Field label="Form" text={account.reasoning.form} strikes={strikes} />
          )}
          <Field label="Soundness" text={account.reasoning.soundness} strikes={strikes} />
          <List
            label="Unstated premises (enthymemes)"
            entries={account.reasoning.enthymemes}
            strikes={strikes}
          />
        </div>
      )}

      {account.fallacies.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-stone-600">Fallacies and faults</p>
          <ul className="mt-1 space-y-2">
            {account.fallacies.map((fallacy, index) => (
              <li
                key={index}
                className="rounded border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-800"
              >
                <p className="text-xs font-semibold text-stone-700">
                  {fallacy.name ?? "Unlabelled fault"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm italic text-stone-700">
                  <StruckText text={fallacy.passage} violations={[]} />
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-xs font-medium text-stone-500">Why it fails: </span>
                  <StruckText text={fallacy.why} violations={strikes} />
                </p>
                <p className="mt-0.5 text-sm">
                  <span className="text-xs font-medium text-stone-500">What is missing: </span>
                  <StruckText text={fallacy.missing} violations={strikes} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {account.definitions !== undefined && (
        <div className="mt-3">
          <p className="text-xs font-medium text-stone-600">Definitions</p>
          <NullableField label="Intensional" text={account.definitions.intensional} strikes={strikes} />
          <NullableField label="Example" text={account.definitions.extensional} strikes={strikes} />
        </div>
      )}

      {account.priority.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-stone-600">Fix first</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {account.priority.map((item, index) => (
              <li key={index} className="text-sm text-stone-800">
                <StruckText text={item} violations={strikes} />
              </li>
            ))}
          </ol>
        </div>
      )}

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

/** Every authored string the account renders, for locating a Violation on screen. */
function renderedTexts(account: AuditAccount): string[] {
  const texts = [account.corePayload, ...account.priority];
  if (account.argumentMap !== undefined) {
    texts.push(
      ...account.argumentMap.premises,
      ...account.argumentMap.subConclusions,
      account.argumentMap.conclusion,
    );
  }
  if (account.reasoning !== undefined) {
    if (account.reasoning.form !== undefined) texts.push(account.reasoning.form);
    texts.push(account.reasoning.soundness, ...account.reasoning.enthymemes);
  }
  for (const fallacy of account.fallacies) {
    if (fallacy.name !== null) texts.push(fallacy.name);
    texts.push(fallacy.why, fallacy.missing);
  }
  if (account.definitions !== undefined) {
    if (account.definitions.intensional !== null) texts.push(account.definitions.intensional);
    if (account.definitions.extensional !== null) texts.push(account.definitions.extensional);
  }
  return texts;
}

function Field({
  label,
  text,
  strikes,
}: {
  label: string;
  text: string;
  strikes: Violation[];
}) {
  return (
    <div className="mt-1">
      <p className="text-xs font-medium text-stone-600">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-stone-800">
        <StruckText text={text} violations={strikes} />
      </p>
    </div>
  );
}

function NullableField({
  label,
  text,
  strikes,
}: {
  label: string;
  text: string | null;
  strikes: Violation[];
}) {
  return (
    <div className="mt-1">
      <p className="text-xs font-medium text-stone-600">{label}</p>
      {text === null ? (
        <p className="mt-0.5 text-sm italic text-stone-400">None given.</p>
      ) : (
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-stone-800">
          <StruckText text={text} violations={strikes} />
        </p>
      )}
    </div>
  );
}

function List({
  label,
  entries,
  strikes,
}: {
  label: string;
  entries: string[];
  strikes: Violation[];
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-1">
      <p className="text-xs font-medium text-stone-600">{label}</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
        {entries.map((entry, index) => (
          <li key={index} className="text-sm text-stone-800">
            <StruckText text={entry} violations={strikes} />
          </li>
        ))}
      </ul>
    </div>
  );
}
