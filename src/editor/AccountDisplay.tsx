import type { AuditAccount } from "../core/audit";
import type { Violation } from "../core/finding";
import type { AuditAccountRecord, ReaderAccountRecord } from "../storage/obelusDatabase";
import { QuarantinedRewrite, StruckText, StruckViolations } from "./ViolationDisplay";
import { splitViolations, violationsOutsideText } from "./violationMarks";

/**
 * The rendered forms of the two account shapes, kept apart from the rail so
 * `BandPanel` holds only per-Pass blocks. An account is analysis: nothing here
 * can put text into the Document, a rewrite the linter caught stays quarantined
 * behind `QuarantinedRewrite`, and praise is struck through rather than hidden.
 */

export function ReaderAccountRow({
  account,
  first,
}: {
  account: ReaderAccountRecord;
  first: boolean;
}) {
  const violations = account.violations ?? [];
  const { strikes, rewrites } = splitViolations(violations);
  const elsewhere = violationsOutsideText(
    [account.whatItSays, account.whatIsMissed, account.gap],
    violations,
  );

  return (
    <li className="border-b border-stone-200/70 bg-white px-4 py-3 last:border-b-0">
      {first && (
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-600">
          {account.section.heading}
        </h4>
      )}
      <p className="text-xs text-stone-600">
        Read at {new Date(account.provenance.at).toLocaleString()} · {account.provenance.model}
      </p>

      <MarkedField label="What this Section says" text={account.whatItSays} strikes={strikes} />
      <MarkedField
        label="What a distracted reader would miss"
        text={account.whatIsMissed}
        strikes={strikes}
      />
      <MarkedField label="The gap" text={account.gap} strikes={strikes} />

      {violations.length > 0 && (
        <div className="mt-2">
          {elsewhere.length > 0 && (
            <p className="text-xs text-stone-600">
              Model drift: <StruckViolations violations={elsewhere} />
            </p>
          )}
          {rewrites.length > 0 && <QuarantinedRewrite violations={rewrites} />}
        </div>
      )}
    </li>
  );
}

export function AuditAccountRow({ account }: { account: AuditAccountRecord }) {
  const violations = account.violations ?? [];
  const { strikes, rewrites } = splitViolations(violations);
  // A violation the account's rendered text does not contain still shows,
  // struck through, rather than being persisted but invisible.
  const elsewhere = violationsOutsideText(renderedTexts(account), violations);

  return (
    <li className="border-b border-stone-200/70 bg-white px-4 py-3 last:border-b-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">
        {account.type === "argument" ? "Argument" : "Observation"}
      </p>
      <p className="mt-0.5 text-xs text-stone-600">
        Audited {new Date(account.provenance.at).toLocaleString()} · {account.provenance.model}
      </p>

      <MarkedField label="The central claim" text={account.corePayload} strikes={strikes} />

      {account.argumentMap !== undefined && (
        <div className="mt-3">
          <p className="text-xs font-medium text-stone-600">Argument map</p>
          <StringList label="Premises" entries={account.argumentMap.premises} strikes={strikes} />
          <StringList
            label="Sub-conclusions"
            entries={account.argumentMap.subConclusions}
            strikes={strikes}
          />
          <MarkedField
            label="Conclusion"
            text={account.argumentMap.conclusion}
            strikes={strikes}
          />
        </div>
      )}

      {account.reasoning !== undefined && (
        <div className="mt-3">
          <p className="text-xs font-medium text-stone-600">
            {account.reasoning.kind === "deductive" ? "Deductive reasoning" : "Inductive reasoning"}
          </p>
          {account.reasoning.form !== undefined && (
            <MarkedField label="Form" text={account.reasoning.form} strikes={strikes} />
          )}
          <MarkedField label="Soundness" text={account.reasoning.soundness} strikes={strikes} />
          <StringList
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
                  <span className="text-xs font-medium text-stone-600">Why it fails: </span>
                  <StruckText text={fallacy.why} violations={strikes} />
                </p>
                <p className="mt-0.5 text-sm">
                  <span className="text-xs font-medium text-stone-600">What is missing: </span>
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
          <MarkedField
            label="Intensional"
            text={account.definitions.intensional}
            strikes={strikes}
            nullable
          />
          <MarkedField
            label="Example"
            text={account.definitions.extensional}
            strikes={strikes}
            nullable
          />
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
            <p className="text-xs text-stone-600">
              Model drift: <StruckViolations violations={elsewhere} />
            </p>
          )}
          {rewrites.length > 0 && <QuarantinedRewrite violations={rewrites} />}
        </div>
      )}
    </li>
  );
}

/** One labelled string an account renders, with any Violations struck through. */
function MarkedField({
  label,
  text,
  strikes,
  nullable = false,
}: {
  label: string;
  text: string | null;
  strikes: Violation[];
  nullable?: boolean;
}) {
  return (
    <div className="mt-1">
      <p className="text-xs font-medium text-stone-600">{label}</p>
      {nullable && text === null ? (
        <p className="mt-0.5 text-sm italic text-stone-500">None given.</p>
      ) : (
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-stone-800">
          <StruckText text={text ?? ""} violations={strikes} />
        </p>
      )}
    </div>
  );
}

/** A labelled list of short strings, omitted when it is empty. */
function StringList({
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
