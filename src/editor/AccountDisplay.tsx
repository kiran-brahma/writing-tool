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
    <li className="border-b border-rule-soft/70 bg-paper px-4 py-3 last:border-b-0">
      {first && (
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-ink">
          {account.section.heading}
        </h4>
      )}
      <p className="text-xs text-muted-ink">
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
            <p className="text-xs text-muted-ink">
              Praise from the model: <StruckViolations violations={elsewhere} />
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
    <li className="border-b border-rule-soft/70 bg-paper px-4 py-3 last:border-b-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">
        {account.type === "argument" ? "Argument" : "Observation"}
      </p>
      <p className="mt-0.5 text-xs text-muted-ink">
        Audited {new Date(account.provenance.at).toLocaleString()} · {account.provenance.model}
      </p>

      <MarkedField label="The central claim" text={account.corePayload} strikes={strikes} />

      {account.argumentMap !== undefined && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-ink">Argument map</p>
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
          <p className="text-xs font-medium text-muted-ink">
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
          <p className="text-xs font-medium text-muted-ink">Fallacies and faults</p>
          <ul className="mt-1 space-y-2">
            {account.fallacies.map((fallacy, index) => (
              <li
                key={index}
                className="rounded border border-rule-soft bg-paper px-2.5 py-2 text-sm text-soft-ink"
              >
                <p className="text-xs font-semibold text-quiet-ink">
                  {fallacy.name ?? "Unlabelled fault"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm italic text-quiet-ink">
                  <StruckText text={fallacy.passage} violations={[]} />
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-xs font-medium text-muted-ink">Why it fails: </span>
                  <StruckText text={fallacy.why} violations={strikes} />
                </p>
                <p className="mt-0.5 text-sm">
                  <span className="text-xs font-medium text-muted-ink">What is missing: </span>
                  <StruckText text={fallacy.missing} violations={strikes} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {account.definitions !== undefined && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-ink">Definitions</p>
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
          <p className="text-xs font-medium text-muted-ink">Fix first</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {account.priority.map((item, index) => (
              <li key={index} className="text-sm text-soft-ink">
                <StruckText text={item} violations={strikes} />
              </li>
            ))}
          </ol>
        </div>
      )}

      {violations.length > 0 && (
        <div className="mt-2">
          {elsewhere.length > 0 && (
            <p className="text-xs text-muted-ink">
              Praise from the model: <StruckViolations violations={elsewhere} />
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
      <p className="text-xs font-medium text-muted-ink">{label}</p>
      {nullable && text === null ? (
        <p className="mt-0.5 text-sm italic text-muted-ink">None given.</p>
      ) : (
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-soft-ink">
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
      <p className="text-xs font-medium text-muted-ink">{label}</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
        {entries.map((entry, index) => (
          <li key={index} className="text-sm text-soft-ink">
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
