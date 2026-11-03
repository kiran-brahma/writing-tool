import { useState } from "react";
import type { ColorSchemeSetting } from "../core/colorScheme";
import type { Pass, RuleConfig } from "../core/pass";
import type { Slot, SlotAssignment, SlotBinding } from "../storage/connections";
import type { Connection } from "../wire/connection";
import { ConnectionsPanel } from "../wire/ConnectionsPanel";
import { RuleConfigEditor } from "../editor/RuleConfigEditor";
import { ColorSchemePanel, SlotsPanel } from "./ConnectionSettings";

export interface SettingsViewProps {
  connections: Connection[];
  slots: SlotAssignment;
  judgeIsDefault: boolean;
  judgeDefaultName: string | null;
  passes: Pass[];
  colorScheme: ColorSchemeSetting;
  passSetError: string | null;
  onClearPassSetError: () => void;
  onSaveConnection: (connection: Connection) => void;
  onAddCustom: () => void;
  onRemoveConnection: (connectionId: string) => void;
  onAssignSlot: (slot: Slot, binding: SlotBinding | null) => void;
  onSetColorScheme: (setting: ColorSchemeSetting) => void;
  onSaveRuleConfig: (passId: string, ruleConfig: RuleConfig) => void;
  onRestoreDefaults: () => void;
}

/**
 * The one Settings destination: Connections, Rules, Appearance and Help. There
 * is no Advanced tab, no Guide tab and no per-run tuning. A setting that does
 * not change what the Writer sees or does is not here.
 */
export function SettingsView({
  connections,
  slots,
  judgeIsDefault,
  judgeDefaultName,
  passes,
  colorScheme,
  passSetError,
  onClearPassSetError,
  onSaveConnection,
  onAddCustom,
  onRemoveConnection,
  onAssignSlot,
  onSetColorScheme,
  onSaveRuleConfig,
  onRestoreDefaults,
}: SettingsViewProps) {
  const rulePasses = passes.filter((pass) => pass.kind === "rule");
  const scrollToHelp = () => {
    window.document.getElementById("settings-help")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
        <header>
          <h1 className="text-lg font-semibold tracking-tight text-ink">Settings</h1>
          <p className="mt-1 text-sm text-muted-ink">
            Connections, the three rule passes, the colour scheme and the one-page help.
          </p>
        </header>

        <SlotsPanel
          connections={connections}
          slots={slots}
          judgeNote={
            judgeIsDefault
              ? `Not set — defaulting to ${judgeDefaultName ?? "another connection"}.`
              : null
          }
          onAssignSlot={onAssignSlot}
        />

        <div className="overflow-hidden rounded border border-rule bg-paper">
          <ConnectionsPanel
            connections={connections}
            onSave={onSaveConnection}
            onAddCustom={onAddCustom}
            onRemove={onRemoveConnection}
            onOpenHelp={scrollToHelp}
          />
        </div>

        <section className="overflow-hidden rounded border border-rule bg-paper">
          <div className="flex items-center justify-between border-b border-rule-soft px-4 py-2">
            <div>
              <h2 className="text-sm font-semibold text-ink">Rules</h2>
              <p className="mt-0.5 text-xs text-faint-ink">
                The three rule passes run on save, offline and with no API key. Their word lists
                are yours.
              </p>
            </div>
            <button
              type="button"
              onClick={onRestoreDefaults}
              className="shrink-0 rounded border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-quiet-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Restore defaults
            </button>
          </div>

          {passSetError !== null && (
            <div className="flex items-start justify-between gap-3 border-b border-rule-soft bg-warning-surface px-4 py-2 text-xs text-warning">
              <span>{passSetError}</span>
              <button
                type="button"
                onClick={onClearPassSetError}
                className="shrink-0 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-focus"
              >
                Dismiss
              </button>
            </div>
          )}

          <ul className="divide-y divide-rule-soft">
            {rulePasses.map((pass) => (
              <RuleRow key={pass.id} pass={pass} onSave={onSaveRuleConfig} />
            ))}
          </ul>
        </section>

        <ColorSchemePanel colorScheme={colorScheme} onSetColorScheme={onSetColorScheme} />

        <HelpPanel />
      </div>
    </main>
  );
}

function RuleRow({
  pass,
  onSave,
}: {
  pass: Pass;
  onSave: (passId: string, ruleConfig: RuleConfig) => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">{pass.name}</p>
          <p className="mt-0.5 text-xs text-muted-ink">{pass.description}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((current) => !current)}
          className="shrink-0 rounded border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-quiet-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {editing ? "Close" : "Edit word lists"}
        </button>
      </div>
      {editing && (
        <div className="mt-3 overflow-hidden rounded border border-rule-soft">
          <RuleConfigEditor
            pass={pass}
            onSave={(ruleConfig) => {
              onSave(pass.id, ruleConfig);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </li>
  );
}

function HelpPanel() {
  return (
    <section id="settings-help" className="overflow-hidden rounded border border-rule bg-paper">
      <div className="border-b border-rule-soft px-4 py-2">
        <h2 className="text-sm font-semibold text-ink">Help</h2>
      </div>
      <div className="space-y-4 px-4 py-4 text-sm leading-relaxed text-soft-ink">
        <div>
          <h3 className="font-semibold text-ink">What Obelus does</h3>
          <p className="mt-1 text-muted-ink">
            You write. Obelus marks problems in your prose, anchors each mark to the words it
            concerns, and leaves the rewriting to you. It never inserts model-written text into
            the document.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-ink">The two rules</h3>
          <p className="mt-1 text-muted-ink">
            Do not use a word a model suggests. Do not ask a model to encourage you. The findings
            schema has no rewrite field, and a client-side linter strikes through praise rather
            than hiding it.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-ink">The loop</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-ink">
            <li>The three rule passes run on every save. They are free and offline.</li>
            <li>
              <strong className="text-soft-ink">Review</strong> runs the three model passes on the
              paragraph at your cursor. Their findings join the same rail.
            </li>
            <li>Rewrite in your own words, then mark the finding addressed or decline it.</li>
            <li>
              <strong className="text-soft-ink">Compare</strong> opens the Judge: it compares two
              versions of the section, or of the span you selected, twice with the labels
              swapped.
            </li>
          </ol>
        </div>

        <div>
          <h3 className="font-semibold text-ink">Shortcuts</h3>
          <p className="mt-1 text-muted-ink">
            In the findings rail, <kbd>j</kbd> and <kbd>k</kbd> step through open findings,{" "}
            <kbd>a</kbd> marks the current one addressed, and <kbd>x</kbd> declines it. The keys
            stand down while you are typing in the prose.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-ink">Privacy</h3>
          <p className="mt-1 text-muted-ink">
            Documents, revisions, findings, passes and connections live in this browser's
            IndexedDB. A connection's key is stored there unless you choose session-only, in which
            case it is held in memory and gone on reload. Requests go only to the provider you
            configured; there is no account, no sync, no telemetry and no server route.
          </p>
          <p className="mt-1 text-muted-ink">
            Local Ollama refuses origins it has not been told to allow. Start it with{" "}
            <code className="rounded bg-sunk px-1 py-0.5 font-mono text-xs">
              OLLAMA_ORIGINS={"{this site's origin}"} ollama serve
            </code>
            . The README has the full steps for macOS, Windows and Linux.
          </p>
        </div>
      </div>
    </section>
  );
}
