import { useEffect, useState } from "react";
import { MIN_CHARACTER_LIMIT } from "../core/chunking";
import { COLOR_SCHEME_SETTINGS, type ColorSchemeSetting } from "../core/colorScheme";
import { parsePriceTable, serializePriceTable, type PriceTable } from "../core/cost";
import { describeError } from "../errors";
import type { Slot, SlotAssignment, SlotBinding } from "../storage/connections";
import type { Connection } from "../wire/connection";
import { ConnectionsPanel } from "../wire/ConnectionsPanel";
import { transport } from "../wire/productionTransport";
import { PANEL_GLOSSES, type HelpSectionId } from "../help/helpContent";

/**
 * The AI Settings view: every global choice about how Obelus talks to a model,
 * in one place. Slots name the Connection *and* the model for the Critic and
 * the Judge; the two may share one Connection while running different models,
 * so an independent Judge needs no second route to the Provider. Connections
 * hold the keys, base URLs and concurrency. The run settings shape what a model
 * Run sends. The colour scheme sits last: it is about the app, not the model.
 */
export interface AiSettingsViewProps {
  connections: Connection[];
  slots: SlotAssignment;
  /** True when the judge Slot is unset and the story-90 default is in use. */
  judgeIsDefault: boolean;
  /** The default judge Connection's name, or null when there is none. */
  judgeDefaultName: string | null;
  screeningFrame: boolean;
  characterLimit: number;
  /** Stories 149–152: the words and phrases the Writer has declared theirs. */
  voiceList: string[];
  priceTable: PriceTable;
  /** Stories 201–202: Light, Dark or System. */
  colorScheme: ColorSchemeSetting;
  /** Stories 73 and 238: whether Finding rows in the Rail show their raw provider response. */
  showRawResponse: boolean;
  onSaveConnection: (connection: Connection) => void;
  onAddCustom: () => void;
  onRemoveConnection: (connectionId: string) => void;
  onAssignSlot: (slot: Slot, binding: SlotBinding | null) => void;
  onToggleScreening: (enabled: boolean) => void;
  onSetCharacterLimit: (limit: number) => void;
  onSaveVoiceList: (voiceList: string[]) => void;
  onSavePriceTable: (table: PriceTable) => void;
  onSetColorScheme: (setting: ColorSchemeSetting) => void;
  onToggleRawResponse: (show: boolean) => void;
  onOpenHelp?: (sectionId: HelpSectionId) => void;
}

export function AiSettingsView({
  connections,
  slots,
  judgeIsDefault,
  judgeDefaultName,
  screeningFrame,
  characterLimit,
  voiceList,
  priceTable,
  colorScheme,
  showRawResponse,
  onSaveConnection,
  onAddCustom,
  onRemoveConnection,
  onAssignSlot,
  onToggleScreening,
  onSetCharacterLimit,
  onSaveVoiceList,
  onSavePriceTable,
  onSetColorScheme,
  onToggleRawResponse,
  onOpenHelp,
}: AiSettingsViewProps) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-6">
      <SlotsPanel
        connections={connections}
        slots={slots}
        judgeNote={
          judgeIsDefault
            ? `Not set — defaulting to ${judgeDefaultName ?? "another connection"}.`
            : null
        }
        onAssignSlot={onAssignSlot}
        onOpenHelp={onOpenHelp}
      />

      <div className="overflow-hidden rounded border border-rule bg-paper">
        <ConnectionsPanel
          connections={connections}
          onSave={onSaveConnection}
          onAddCustom={onAddCustom}
          onRemove={onRemoveConnection}
          onOpenHelp={onOpenHelp}
        />
      </div>

      <RunSettingsPanel
        screeningFrame={screeningFrame}
        characterLimit={characterLimit}
        voiceList={voiceList}
        priceTable={priceTable}
        showRawResponse={showRawResponse}
        onToggleScreening={onToggleScreening}
        onSetCharacterLimit={onSetCharacterLimit}
        onSaveVoiceList={onSaveVoiceList}
        onSavePriceTable={onSavePriceTable}
        onToggleRawResponse={onToggleRawResponse}
        onOpenHelp={onOpenHelp}
      />

      <ColorSchemePanel colorScheme={colorScheme} onSetColorScheme={onSetColorScheme} />
    </div>
  );
}

/**
 * Stories 201–202: the Writer's colour scheme. System is the default and
 * follows the operating system as it changes; Light and Dark override it.
 */
function ColorSchemePanel({
  colorScheme,
  onSetColorScheme,
}: {
  colorScheme: ColorSchemeSetting;
  onSetColorScheme: (setting: ColorSchemeSetting) => void;
}) {
  return (
    <section className="overflow-hidden rounded border border-rule bg-paper">
      <div className="border-b border-rule-soft px-4 py-2">
        <h2 className="text-sm font-semibold">Colour scheme</h2>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div role="group" aria-label="Colour scheme" className="flex gap-1.5">
          {COLOR_SCHEME_SETTINGS.map(({ setting, label }) => {
            const active = setting === colorScheme;
            return (
              <button
                key={setting}
                type="button"
                aria-pressed={active}
                onClick={() => onSetColorScheme(setting)}
                className={[
                  "rounded border px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                  active
                    ? "border-ink bg-ink text-on-ink focus-visible:ring-offset-2"
                    : "border-rule bg-paper text-quiet-ink hover:bg-sunk",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-ink">System follows your computer’s setting as it changes.</p>
      </div>
    </section>
  );
}

function SlotsPanel({
  connections,
  slots,
  judgeNote,
  onAssignSlot,
  onOpenHelp,
}: {
  connections: Connection[];
  slots: SlotAssignment;
  judgeNote: string | null;
  onAssignSlot: (slot: Slot, binding: SlotBinding | null) => void;
  onOpenHelp?: (sectionId: HelpSectionId) => void;
}) {
  return (
    <section className="overflow-hidden rounded border border-rule bg-paper">
      <div className="border-b border-rule-soft px-4 py-2">
        <h2 className="text-sm font-semibold">Slots</h2>
      </div>
      <p className="border-b border-rule-soft px-4 py-2 text-xs text-faint-ink">
        {PANEL_GLOSSES.slots.text}{" "}
        <button
          type="button"
          onClick={() => onOpenHelp?.(PANEL_GLOSSES.slots.sectionId)}
          className="underline hover:text-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          How this works
        </button>
      </p>
      <p className="border-b border-rule-soft px-4 py-2 text-xs text-faint-ink">
        The critic runs model passes; the judge compares two versions. Each slot names its own
        model, so both may share one connection and still run different models, keeping the judge
        independent without a second route. A connection's own model is used only when a slot's
        model is left empty.
      </p>
      <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
        <SlotEditor
          slot="critic"
          label="Critic"
          binding={slots.critic}
          connections={connections}
          note={null}
          onAssignSlot={onAssignSlot}
        />
        <SlotEditor
          slot="judge"
          label="Judge"
          binding={slots.judge}
          connections={connections}
          note={judgeNote}
          onAssignSlot={onAssignSlot}
        />
      </div>
    </section>
  );
}

/**
 * One Slot: which Connection runs it, and which model that Connection uses for
 * it. The model is draft-committed on blur, empty means "the Connection's own
 * model", and a change of Connection clears the override so a model from a
 * different Provider is never silently carried across.
 */
function SlotEditor({
  slot,
  label,
  binding,
  connections,
  note,
  onAssignSlot,
}: {
  slot: Slot;
  label: string;
  binding: SlotBinding | null;
  connections: Connection[];
  note: string | null;
  onAssignSlot: (slot: Slot, binding: SlotBinding | null) => void;
}) {
  const connection =
    binding === null
      ? null
      : (connections.find((candidate) => candidate.id === binding.connectionId) ?? null);
  const [model, setModel] = useState(binding?.model ?? "");
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setModel(binding?.model ?? "");
    setModels([]);
    setError(null);
    // Reset only when the Slot's Connection changes; an in-progress model draft
    // must survive a parent re-render caused by saving the other Slot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding?.connectionId]);

  const commitModel = () => {
    if (connection === null) return;
    const next = model.trim();
    if (next === (binding?.model ?? "")) return;
    onAssignSlot(slot, { connectionId: connection.id, model: next });
  };

  const selectConnection = (id: string) => {
    if (id === "") {
      onAssignSlot(slot, null);
      return;
    }
    // A new Connection starts with no override, so its own model applies until
    // the Writer names a different one for this Slot.
    onAssignSlot(slot, { connectionId: id, model: "" });
  };

  const listModels = async () => {
    if (connection === null) return;
    setBusy(true);
    setError(null);
    try {
      setModels(await transport.listModels(connection));
    } catch (listError) {
      // The Provider's failure is surfaced verbatim; nothing is swallowed.
      setError(describeError(listError));
    } finally {
      setBusy(false);
    }
  };

  const pickModel = (id: string) => {
    setModel(id);
    if (connection !== null) onAssignSlot(slot, { connectionId: connection.id, model: id });
  };

  return (
    <div className="rounded border border-rule-soft p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-quiet-ink">{label}</span>
        {connection !== null && (
          <span className="rounded bg-sunk px-1.5 py-0.5 text-xs text-faint-ink">
            {connection.protocol}
          </span>
        )}
      </div>

      <label className="mt-2 block text-xs text-faint-ink">
        Connection
        <select
          value={binding?.connectionId ?? ""}
          onChange={(event) => selectConnection(event.target.value)}
          className="mt-0.5 w-full rounded border border-rule bg-paper px-2 py-1 text-xs text-soft-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <option value="">Not set</option>
          {connections.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-2 block text-xs text-faint-ink">
        Model
        <div className="mt-0.5 flex gap-1.5">
          <input
            type="text"
            list={`slot-models-${slot}`}
            value={model}
            disabled={connection === null}
            placeholder={connection === null ? "Choose a Connection first" : connection.model || "Model id"}
            onChange={(event) => setModel(event.target.value)}
            onBlur={commitModel}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="min-w-0 flex-1 rounded border border-rule bg-paper px-2 py-1 text-xs text-soft-ink disabled:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
          <button
            type="button"
            disabled={connection === null || busy}
            onClick={() => void listModels()}
            className="shrink-0 rounded border border-rule bg-paper px-2 py-1 text-xs font-medium text-quiet-ink hover:bg-sunk disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            List
          </button>
        </div>
        <datalist id={`slot-models-${slot}`}>
          {models.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
      </label>

      {connection !== null && model.trim() === "" && connection.model !== "" && (
        <p className="mt-1 text-xs text-faint-ink">Inherits “{connection.model}”.</p>
      )}
      {note !== null && <p className="mt-1 text-xs text-faint-ink">{note}</p>}
      {error !== null && <p className="mt-1 break-words text-xs text-failure">{error}</p>}

      {models.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {models.slice(0, 40).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => pickModel(id)}
              className="rounded bg-sunk px-1.5 py-0.5 text-xs text-muted-ink hover:bg-sunk-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RunSettingsPanel({
  screeningFrame,
  characterLimit,
  voiceList,
  priceTable,
  showRawResponse,
  onToggleScreening,
  onSetCharacterLimit,
  onSaveVoiceList,
  onSavePriceTable,
  onToggleRawResponse,
  onOpenHelp,
}: {
  screeningFrame: boolean;
  characterLimit: number;
  voiceList: string[];
  priceTable: PriceTable;
  showRawResponse: boolean;
  onToggleScreening: (enabled: boolean) => void;
  onSetCharacterLimit: (limit: number) => void;
  onSaveVoiceList: (voiceList: string[]) => void;
  onSavePriceTable: (table: PriceTable) => void;
  onToggleRawResponse: (show: boolean) => void;
  onOpenHelp?: (sectionId: HelpSectionId) => void;
}) {
  return (
    <section className="overflow-hidden rounded border border-rule bg-paper">
      <div className="border-b border-rule-soft px-4 py-2">
        <h2 className="text-sm font-semibold">Runs</h2>
      </div>

      <p className="border-b border-rule-soft px-4 py-2 text-xs text-faint-ink">
        {PANEL_GLOSSES.runSettings.text}{" "}
        <button
          type="button"
          onClick={() => onOpenHelp?.(PANEL_GLOSSES.runSettings.sectionId)}
          className="underline hover:text-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          How this works
        </button>
      </p>

      <label className="flex items-center gap-2 border-b border-rule-soft px-4 py-2 text-xs text-muted-ink">
        <input
          type="checkbox"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          checked={screeningFrame}
          onChange={(event) => onToggleScreening(event.target.checked)}
        />
        Screening frame (critic finding passes only)
      </label>

      {/* Stories 73 and 238: a debugging aid, so it lives here rather than above the queue. */}
      <label className="flex items-center gap-2 border-b border-rule-soft px-4 py-2 text-xs text-muted-ink">
        <input
          type="checkbox"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          checked={showRawResponse}
          onChange={(event) => onToggleRawResponse(event.target.checked)}
        />
        Show the raw provider response on each Finding in the Rail
      </label>

      <div className="flex items-center justify-between gap-2 border-b border-rule-soft px-4 py-2 text-xs text-muted-ink">
        <label htmlFor="character-limit" className="shrink-0">
          Character limit
        </label>
        <CharacterLimitField value={characterLimit} onCommit={onSetCharacterLimit} />
      </div>

      <details className="border-b border-rule-soft px-4 py-2 text-xs text-muted-ink" open>
        <summary className="cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">Voice list</summary>
        <p className="mt-1 text-faint-ink">
          Words and phrases you have declared yours. A rule pass drops them, and a model pass is
          told not to flag them. A model finding that still does is marked, never hidden.
        </p>
        <VoiceListField value={voiceList} onCommit={onSaveVoiceList} />
      </details>

      <details className="px-4 py-2 text-xs text-muted-ink">
        <summary className="cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">Price table</summary>
        <p className="mt-1 text-faint-ink">
          USD per million tokens. An entry prices a model id, or any model id it prefixes. The
          estimate is characters ÷ 4 and never blocks a run.
        </p>
        <PriceTableField value={priceTable} onCommit={onSavePriceTable} />
      </details>
    </section>
  );
}

/**
 * The character limit is edited as a draft and committed on blur or Enter, so a
 * half-typed number never briefly becomes the limit and the field does not jump
 * while the Writer types. The committed value round-trips through the setting,
 * which normalises it; a rejected draft snaps back to the stored value.
 */
function CharacterLimitField({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (limit: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    onCommit(parsed);
  };

  return (
    <input
      id="character-limit"
      type="number"
      min={MIN_CHARACTER_LIMIT}
      step={500}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className="w-28 rounded border border-rule bg-paper px-2 py-1 text-right tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    />
  );
}

/**
 * The Voice list is edited as one entry per line and committed on blur, exactly
 * like the price table: a half-typed line never briefly silences a word. Blank
 * lines are ignored and the stored value round-trips through normalisation, so
 * the field snaps back to what was actually saved.
 */
function VoiceListField({
  value,
  onCommit,
}: {
  value: string[];
  onCommit: (voiceList: string[]) => void;
}) {
  const [draft, setDraft] = useState(() => value.join("\n"));

  useEffect(() => {
    setDraft(value.join("\n"));
  }, [value]);

  return (
    <textarea
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft.split("\n"))}
      rows={4}
      spellCheck={false}
      placeholder={"leverage\nat its core"}
      className="mt-1 w-full resize-y rounded border border-rule bg-paper px-2 py-1 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    />
  );
}

/**
 * The price table is edited as `model = dollars` lines and committed on blur,
 * exactly like the character limit: a half-typed price never becomes the table.
 */
function PriceTableField({
  value,
  onCommit,
}: {
  value: PriceTable;
  onCommit: (table: PriceTable) => void;
}) {
  const [draft, setDraft] = useState(() => serializePriceTable(value));

  useEffect(() => {
    setDraft(serializePriceTable(value));
  }, [value]);

  return (
    <textarea
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(parsePriceTable(draft))}
      rows={4}
      spellCheck={false}
      placeholder={"gpt-4o = 5\ngpt-4o-mini = 0.6"}
      className="mt-1 w-full resize-y rounded border border-rule bg-paper px-2 py-1 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    />
  );
}
