import { useEffect, useState } from "react";
import { MIN_CHARACTER_LIMIT } from "../core/chunking";
import { parsePriceTable, serializePriceTable, type PriceTable } from "../core/cost";
import { describeError } from "../errors";
import type { Slot, SlotAssignment, SlotBinding } from "../storage/connections";
import type { Connection } from "../wire/connection";
import { ConnectionsPanel } from "../wire/ConnectionsPanel";
import { transport } from "../wire/productionTransport";

/**
 * The AI Settings view: every global choice about how Obelus talks to a model,
 * in one place. Slots name the Connection *and* the model for the Critic and
 * the Judge; the two may share one Connection while running different models,
 * so an independent Judge needs no second route to the Provider. Connections
 * hold the keys, base URLs and concurrency. The run settings shape what a model
 * Run sends.
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
  priceTable: PriceTable;
  onSaveConnection: (connection: Connection) => void;
  onAddCustom: () => void;
  onRemoveConnection: (connectionId: string) => void;
  onAssignSlot: (slot: Slot, binding: SlotBinding | null) => void;
  onToggleScreening: (enabled: boolean) => void;
  onSetCharacterLimit: (limit: number) => void;
  onSavePriceTable: (table: PriceTable) => void;
}

export function AiSettingsView({
  connections,
  slots,
  judgeIsDefault,
  judgeDefaultName,
  screeningFrame,
  characterLimit,
  priceTable,
  onSaveConnection,
  onAddCustom,
  onRemoveConnection,
  onAssignSlot,
  onToggleScreening,
  onSetCharacterLimit,
  onSavePriceTable,
}: AiSettingsViewProps) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-6">
      <SlotsPanel
        connections={connections}
        slots={slots}
        judgeNote={
          judgeIsDefault
            ? `Not set — defaulting to ${judgeDefaultName ?? "another Connection"}.`
            : null
        }
        onAssignSlot={onAssignSlot}
      />

      <div className="overflow-hidden rounded border border-stone-300 bg-white">
        <ConnectionsPanel
          connections={connections}
          onSave={onSaveConnection}
          onAddCustom={onAddCustom}
          onRemove={onRemoveConnection}
        />
      </div>

      <RunSettingsPanel
        screeningFrame={screeningFrame}
        characterLimit={characterLimit}
        priceTable={priceTable}
        onToggleScreening={onToggleScreening}
        onSetCharacterLimit={onSetCharacterLimit}
        onSavePriceTable={onSavePriceTable}
      />
    </div>
  );
}

function SlotsPanel({
  connections,
  slots,
  judgeNote,
  onAssignSlot,
}: {
  connections: Connection[];
  slots: SlotAssignment;
  judgeNote: string | null;
  onAssignSlot: (slot: Slot, binding: SlotBinding | null) => void;
}) {
  return (
    <section className="overflow-hidden rounded border border-stone-300 bg-white">
      <div className="border-b border-stone-200 px-4 py-2">
        <h2 className="text-sm font-semibold">Slots</h2>
      </div>
      <p className="border-b border-stone-200 px-4 py-2 text-xs text-stone-500">
        The Critic runs model Passes; the Judge compares two versions. Each Slot names its own
        model, so both may share one Connection and still run different models — the Judge stays
        independent without a second route. A Connection's own model is used only when a Slot's
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
    <div className="rounded border border-stone-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-stone-700">{label}</span>
        {connection !== null && (
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500">
            {connection.protocol}
          </span>
        )}
      </div>

      <label className="mt-2 block text-xs text-stone-500">
        Connection
        <select
          value={binding?.connectionId ?? ""}
          onChange={(event) => selectConnection(event.target.value)}
          className="mt-0.5 w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800"
        >
          <option value="">Not set</option>
          {connections.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-2 block text-xs text-stone-500">
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
            className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800 disabled:bg-stone-100"
          />
          <button
            type="button"
            disabled={connection === null || busy}
            onClick={() => void listModels()}
            className="shrink-0 rounded border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-40"
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
        <p className="mt-1 text-[11px] text-stone-500">Inherits “{connection.model}”.</p>
      )}
      {note !== null && <p className="mt-1 text-[11px] text-stone-500">{note}</p>}
      {error !== null && <p className="mt-1 break-words text-[11px] text-red-700">{error}</p>}

      {models.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {models.slice(0, 40).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => pickModel(id)}
              className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600 hover:bg-stone-200"
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
  priceTable,
  onToggleScreening,
  onSetCharacterLimit,
  onSavePriceTable,
}: {
  screeningFrame: boolean;
  characterLimit: number;
  priceTable: PriceTable;
  onToggleScreening: (enabled: boolean) => void;
  onSetCharacterLimit: (limit: number) => void;
  onSavePriceTable: (table: PriceTable) => void;
}) {
  return (
    <section className="overflow-hidden rounded border border-stone-300 bg-white">
      <div className="border-b border-stone-200 px-4 py-2">
        <h2 className="text-sm font-semibold">Runs</h2>
      </div>

      <label className="flex items-center gap-2 border-b border-stone-200 px-4 py-2 text-xs text-stone-600">
        <input
          type="checkbox"
          checked={screeningFrame}
          onChange={(event) => onToggleScreening(event.target.checked)}
        />
        Screening frame (critic passes only)
      </label>

      <div className="flex items-center justify-between gap-2 border-b border-stone-200 px-4 py-2 text-xs text-stone-600">
        <label htmlFor="character-limit" className="shrink-0">
          Character limit
        </label>
        <CharacterLimitField value={characterLimit} onCommit={onSetCharacterLimit} />
      </div>

      <details className="px-4 py-2 text-xs text-stone-600">
        <summary className="cursor-pointer select-none">Price table</summary>
        <p className="mt-1 text-stone-500">
          USD per million tokens. An entry prices a model id, or any model id it prefixes. The
          estimate is characters ÷ 4 and never blocks a Run.
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
      className="w-28 rounded border border-stone-300 bg-white px-2 py-1 text-right tabular-nums"
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
      className="mt-1 w-full resize-y rounded border border-stone-300 bg-white px-2 py-1 font-mono text-xs"
    />
  );
}
