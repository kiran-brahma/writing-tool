import { useState, type ReactNode } from "react";
import type { CostEstimate } from "../core/cost";
import type { RunReport } from "../core/critique";
import {
  isOpenFinding,
  responseKey,
  type DeclineReason,
  type Finding,
} from "../core/finding";
import {
  isAuditPass,
  isReaderPass,
  scopeVocab,
  soloRulePass,
  type Pass,
  type RuleConfig,
} from "../core/pass";
import type { AuditAccountRecord, ReaderAccountRecord } from "../storage/obelusDatabase";
import type { AuditRunReport } from "../useDocument";
import { AuditAccountRow, ReaderAccountRow } from "./AccountDisplay";
import { ElapsedTimer } from "./ElapsedTimer";
import { FindingRow } from "./FindingRow";
import { formatCostEstimate } from "./formatUsd";
import { RuleConfigEditor } from "./RuleConfigEditor";
import { QuarantinedRewrite, StruckViolations } from "./ViolationDisplay";
import { splitViolations } from "./violationMarks";
import { PANEL_GLOSSES, type HelpSectionId } from "../help/helpContent";

/**
 * ADR 0010: one Band's panel. It shows the Band's Passes **together with the
 * Findings and accounts those Passes produced**, so running a Pass and reading
 * what it found is one view rather than two scrolls. A Pass is a block: its
 * controls, then its own output beneath it.
 *
 * The panel is display and orchestration only. It never inserts model-derived
 * text: findings and accounts are analysis, and a rewrite the linter caught is
 * quarantined behind `QuarantinedRewrite`.
 */
export interface BandPanelProps {
  /** The Band's Passes, in the order the Pass set gave them. */
  passes: Pass[];
  /** Every Finding produced by those Passes. */
  findings: Finding[];
  readerAccounts: ReaderAccountRecord[];
  auditAccounts: AuditAccountRecord[];
  currentFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
  showRawResponse: boolean;
  rawResponses: Record<string, string>;
  onDecline: (findingId: string, reason: DeclineReason) => void;
  /** Story 181: return a Finding that left the queue to `open`. */
  onReopen: (findingId: string) => void;
  runningPassId: string | null;
  runningSince: number | null;
  lastRunReport: RunReport | null;
  estimates: Record<string, CostEstimate>;
  busy: boolean;
  onRun: (passId: string) => void;
  readerRunning: boolean;
  readerStartedAt: number | null;
  /** The Reader pass's last failure, surfaced verbatim in its block. */
  readerError: string | null;
  onRunReader: (passId: string) => void;
  auditRunning: boolean;
  auditStartedAt: number | null;
  /** The Audit pass's last failure, surfaced verbatim in its block. */
  auditError: string | null;
  auditReport: AuditRunReport | null;
  onRunAudit: (passId: string) => void;
  criticName: string | null;
  onToggle: (passId: string, enabled: boolean) => void;
  onSaveRuleConfig: (passId: string, ruleConfig: RuleConfig) => void;
  onOpenHelp?: (sectionId: HelpSectionId) => void;
}

/** The Target a Pass of this scope runs against, for its controls and copy. */
function targetLabel(scope: Pass["scope"]): string {
  return scopeVocab(scope).targetPhrase;
}

export function BandPanel({
  passes,
  findings,
  readerAccounts,
  auditAccounts,
  currentFindingId,
  onSelectFinding,
  showRawResponse,
  rawResponses,
  onDecline,
  onReopen,
  runningPassId,
  runningSince,
  lastRunReport,
  estimates,
  busy,
  onRun,
  readerRunning,
  readerStartedAt,
  readerError,
  onRunReader,
  auditRunning,
  auditStartedAt,
  auditError,
  auditReport,
  onRunAudit,
  criticName,
  onToggle,
  onSaveRuleConfig,
  onOpenHelp,
}: BandPanelProps) {
  const solo = soloRulePass(passes);

  return (
    <div>
      <p className="border-b border-stone-200 px-4 py-2 text-xs text-stone-600">
        {PANEL_GLOSSES.band.text}{" "}
        <button
          type="button"
          onClick={() => onOpenHelp?.(PANEL_GLOSSES.band.sectionId)}
          className="rounded px-0.5 underline hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600"
        >
          How this works
        </button>
      </p>

      <p className="border-b border-stone-200 bg-stone-100 px-4 py-2 text-xs text-stone-600">
        {criticName === null
          ? "No critic assigned."
          : `Bands that call a model use the critic connection: ${criticName}`}
      </p>

      {solo !== null && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {solo.name} runs on its own. The other rule passes are held while it is on; turn it off
          to run them again.
        </p>
      )}

      {passes.length === 0 ? (
        <p className="px-4 py-4 text-sm text-stone-600">
          No pass sits in this band yet. The starter pack adds them as tickets land.
        </p>
      ) : (
        passes.map((pass) => {
          const passFindings = findings.filter((finding) => finding.passId === pass.id);
          if (pass.kind === "rule") {
            return (
              <RulePassBlock
                key={pass.id}
                pass={pass}
                findings={passFindings}
                held={solo !== null && pass.id !== solo.id}
                currentFindingId={currentFindingId}
                onSelectFinding={onSelectFinding}
                onDecline={onDecline}
                onReopen={onReopen}
                showRawResponse={showRawResponse}
                rawResponses={rawResponses}
                onToggle={onToggle}
                onSaveRuleConfig={onSaveRuleConfig}
              />
            );
          }
          if (isReaderPass(pass)) {
            return (
              <ReaderPassBlock
                key={pass.id}
                pass={pass}
                accounts={readerAccounts.filter((account) => account.passId === pass.id)}
                running={readerRunning}
                runningSince={readerStartedAt}
                error={readerError}
                onRun={onRunReader}
                onToggle={onToggle}
              />
            );
          }
          if (isAuditPass(pass)) {
            return (
              <AuditPassBlock
                key={pass.id}
                pass={pass}
                accounts={auditAccounts.filter((account) => account.passId === pass.id)}
                running={auditRunning}
                runningSince={auditStartedAt}
                error={auditError}
                report={auditReport?.passId === pass.id ? auditReport : null}
                onRun={onRunAudit}
                onToggle={onToggle}
              />
            );
          }
          return (
            <FindingsPassBlock
              key={pass.id}
              pass={pass}
              findings={passFindings}
              running={pass.id === runningPassId}
              runningSince={runningSince}
              report={lastRunReport?.passId === pass.id ? lastRunReport : null}
              estimate={estimates[pass.id]}
              busy={busy}
              currentFindingId={currentFindingId}
              onSelectFinding={onSelectFinding}
              onDecline={onDecline}
              onReopen={onReopen}
              showRawResponse={showRawResponse}
              rawResponses={rawResponses}
              onRun={onRun}
              onToggle={onToggle}
            />
          );
        })
      )}
    </div>
  );
}

/** The toggle, the name and the description every Pass block shares. */
function PassHeading({
  pass,
  onToggle,
  action,
  badge,
  detail,
}: {
  pass: Pass;
  onToggle: (passId: string, enabled: boolean) => void;
  action?: ReactNode;
  badge?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 px-4 py-3">
      <input
        type="checkbox"
        className="mt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600 rounded-xs"
        checked={pass.enabled}
        aria-label={`Enable ${pass.name}`}
        onChange={(event) => onToggle(pass.id, event.target.checked)}
      />
      <div className="min-w-0 flex-1">
        <p
          className={
            pass.enabled
              ? "text-sm font-semibold text-stone-900"
              : "text-sm font-medium text-stone-600"
          }
        >
          {pass.name}
          {badge}
        </p>
        <p className="mt-0.5 text-xs text-stone-600">{pass.description}</p>
        {detail}
        {!pass.enabled && <p className="mt-1 text-xs italic text-stone-600">Disabled.</p>}
      </div>
      {action}
    </div>
  );
}

/** A spinner and elapsed timer while a Run is in flight. */
function RunningBadge({ since }: { since: number | null }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs text-stone-600">
      <span
        className="h-3 w-3 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700"
        aria-hidden="true"
      />
      {since === null ? null : <ElapsedTimer since={since} />}
    </span>
  );
}

function RunButton({
  disabled,
  onClick,
  children,
  title,
}: {
  disabled: boolean;
  onClick: () => void;
  children: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="shrink-0 rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600"
    >
      {children}
    </button>
  );
}

/** The Findings and report for one critic Finding Pass. */
function FindingsPassBlock({
  pass,
  findings,
  running,
  runningSince,
  report,
  estimate,
  busy,
  currentFindingId,
  onSelectFinding,
  onDecline,
  onReopen,
  showRawResponse,
  rawResponses,
  onRun,
  onToggle,
}: {
  pass: Pass;
  findings: Finding[];
  running: boolean;
  runningSince: number | null;
  report: RunReport | null;
  estimate: CostEstimate | undefined;
  busy: boolean;
  currentFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
  onDecline: (findingId: string, reason: DeclineReason) => void;
  onReopen: (findingId: string) => void;
  showRawResponse: boolean;
  rawResponses: Record<string, string>;
  onRun: (passId: string) => void;
  onToggle: (passId: string, enabled: boolean) => void;
}) {
  const { strikes, rewrites } = splitViolations(report?.violations ?? []);
  const openCount = findings.filter(isOpenFinding).length;
  const target = targetLabel(pass.scope);
  return (
    <section className="border-b border-stone-200">
      <PassHeading
        pass={pass}
        onToggle={onToggle}
        action={
          running ? (
            <RunningBadge since={runningSince} />
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              {estimate !== undefined && (
                <span
                  className="text-xs text-stone-600 tabular-nums"
                  title={`${estimate.tokens.toLocaleString()} tokens estimated${estimate.costKnown ? "" : " · cost is unknown"}`}
                >
                  {formatCostEstimate(estimate)}
                </span>
              )}
              <RunButton
                disabled={!pass.enabled || busy}
                onClick={() => onRun(pass.id)}
                title={
                  estimate !== undefined && !estimate.costKnown
                    ? `Run against ${target} (cost is unknown)`
                    : `Run against ${target}`
                }
              >
                Run
              </RunButton>
            </div>
          )
        }
      />
      {report !== null && (
        <p className="px-4 pb-2 text-xs text-stone-600">
          {report.fromCache && "Served from the cache; no provider call. "}
          {report.droppedAnchors === 0
            ? "All findings stayed inside the text examined."
            : `${report.droppedAnchors} ${report.droppedAnchors === 1 ? "finding fell" : "findings fell"} outside the text examined and ${report.droppedAnchors === 1 ? "was" : "were"} dropped.`}
          {report.chunks > 1 && ` Ran in ${report.chunks} overlapping chunks.`}
        </p>
      )}
      {strikes.length > 0 && (
        <p className="px-4 pb-2 text-xs text-stone-600">
          Praise from the model, struck through rather than hidden: <StruckViolations violations={strikes} />
        </p>
      )}
      {rewrites.length > 0 && (
        <div className="px-4 pb-2">
          <QuarantinedRewrite violations={rewrites} />
        </div>
      )}
      {findings.length === 0 ? (
        <p className="border-t border-stone-200/70 px-4 py-2 text-xs text-stone-600">
          No findings yet. Run it against {target}.
        </p>
      ) : (
        <>
          <p className="border-t border-stone-200/70 bg-stone-100/70 px-4 py-1.5 text-xs text-stone-600">
            {openCount} open
          </p>
          <ol>
            {findings.map((finding) => (
              <FindingRow
                key={finding.id}
                finding={finding}
                current={finding.id === currentFindingId}
                onSelect={onSelectFinding}
                onDecline={onDecline}
                onReopen={onReopen}
                {...(showRawResponse
                  ? { rawResponse: rawResponses[responseKey(finding.passId, finding.promptHash)] }
                  : {})}
              />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/** One rule Pass: its toggle, its editable Rule config, and its Findings. */
function RulePassBlock({
  pass,
  findings,
  held,
  currentFindingId,
  onSelectFinding,
  onDecline,
  onReopen,
  showRawResponse,
  rawResponses,
  onToggle,
  onSaveRuleConfig,
}: {
  pass: Pass;
  findings: Finding[];
  held: boolean;
  currentFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
  onDecline: (findingId: string, reason: DeclineReason) => void;
  onReopen: (findingId: string) => void;
  showRawResponse: boolean;
  rawResponses: Record<string, string>;
  onToggle: (passId: string, enabled: boolean) => void;
  onSaveRuleConfig: (passId: string, ruleConfig: RuleConfig) => void;
}) {
  const [editing, setEditing] = useState(false);
  const openCount = findings.filter(isOpenFinding).length;
  return (
    <section className="border-b border-stone-200">
      <PassHeading
        pass={pass}
        onToggle={onToggle}
        badge={
          held ? (
            <span className="ml-1.5 rounded bg-stone-200 px-1 py-0.5 text-xs font-medium uppercase tracking-wide text-stone-700">
              held
            </span>
          ) : null
        }
        action={
          <button
            type="button"
            className="shrink-0 rounded border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600"
            onClick={() => setEditing((current) => !current)}
          >
            {editing ? "Close" : "Edit"}
          </button>
        }
      />
      {editing && (
        <RuleConfigEditor
          key={pass.id}
          pass={pass}
          onSave={(ruleConfig) => {
            onSaveRuleConfig(pass.id, ruleConfig);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
      {findings.length === 0 ? (
        <p className="border-t border-stone-200/70 px-4 py-2 text-xs text-stone-600">
          Nothing marked. Rule passes run free, on every save.
        </p>
      ) : (
        <>
          <p className="border-t border-stone-200/70 bg-stone-100/70 px-4 py-1.5 text-xs text-stone-600">
            {openCount} open · free, offline
          </p>
          <ol>
            {findings.map((finding) => (
              <FindingRow
                key={finding.id}
                finding={finding}
                current={finding.id === currentFindingId}
                onSelect={onSelectFinding}
                onDecline={onDecline}
                onReopen={onReopen}
                {...(showRawResponse
                  ? { rawResponse: rawResponses[responseKey(finding.passId, finding.promptHash)] }
                  : {})}
              />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/** One Reader Pass: its toggle, its Run control and the accounts it produced. */
function ReaderPassBlock({
  pass,
  accounts,
  running,
  runningSince,
  error,
  onRun,
  onToggle,
}: {
  pass: Pass;
  accounts: ReaderAccountRecord[];
  running: boolean;
  runningSince: number | null;
  error: string | null;
  onRun: (passId: string) => void;
  onToggle: (passId: string, enabled: boolean) => void;
}) {
  return (
    <section className="border-b border-stone-200">
      <PassHeading
        pass={pass}
        onToggle={onToggle}
        action={
          running ? (
            <RunningBadge since={runningSince} />
          ) : (
            <RunButton disabled={!pass.enabled || running} onClick={() => onRun(pass.id)}>
              Read every Section
            </RunButton>
          )
        }
      />
      {error !== null && (
        <p className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {error}
        </p>
      )}
      {accounts.length === 0 ? (
        <p className="border-t border-stone-200/70 px-4 py-2 text-xs text-stone-600">
          No Reader accounts yet. Run the pass to see what each Section communicates.
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
    </section>
  );
}

/** One Audit Pass: its toggle, its Run control and the account it produced. */
function AuditPassBlock({
  pass,
  accounts,
  running,
  runningSince,
  error,
  report,
  onRun,
  onToggle,
}: {
  pass: Pass;
  accounts: AuditAccountRecord[];
  running: boolean;
  runningSince: number | null;
  error: string | null;
  report: AuditRunReport | null;
  onRun: (passId: string) => void;
  onToggle: (passId: string, enabled: boolean) => void;
}) {
  const { strikes } = splitViolations(report?.violations ?? []);
  return (
    <section className="border-b border-stone-200">
      <PassHeading
        pass={pass}
        onToggle={onToggle}
        action={
          running ? (
            <RunningBadge since={runningSince} />
          ) : (
            <RunButton disabled={!pass.enabled || running} onClick={() => onRun(pass.id)}>
              Audit the whole document
            </RunButton>
          )
        }
      />
      {report !== null && (
        <p className="px-4 pb-2 text-xs text-stone-600">
          {report.chunks <= 1
            ? "Read in a single call."
            : `Read in ${report.chunks} overlapping chunks, then synthesized.`}
        </p>
      )}
      {report !== null && strikes.length > 0 && (
        <p className="px-4 pb-2 text-xs text-stone-600">
          Praise from the model, struck through rather than hidden: <StruckViolations violations={strikes} />
        </p>
      )}
      {error !== null && (
        <p className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {error}
        </p>
      )}
      {accounts.length === 0 ? (
        <p className="border-t border-stone-200/70 px-4 py-2 text-xs text-stone-600">
          No audit account yet. Run the pass to see whether the document's reasoning holds up.
        </p>
      ) : (
        <ol>
          {accounts.map((account) => (
            <AuditAccountRow key={account.id} account={account} />
          ))}
        </ol>
      )}
    </section>
  );
}
