import { useEffect, useState } from "react";
import { COLOR_SCHEME_SETTINGS, type ColorSchemeSetting } from "../core/colorScheme";
import { describeError } from "../errors";
import type { Slot, SlotAssignment, SlotBinding } from "../storage/connections";
import type { Connection } from "../wire/connection";
import { transport } from "../wire/productionTransport";

/** Light, Dark or System. System follows the operating system as it changes. */
export function ColorSchemePanel({
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

/** The Critic and Judge Slots: which Connection runs each, and which model. */
export function SlotsPanel({
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
    <section className="overflow-hidden rounded border border-rule bg-paper">
      <div className="border-b border-rule-soft px-4 py-2">
        <h2 className="text-sm font-semibold">Slots</h2>
      </div>
      <p className="border-b border-rule-soft px-4 py-2 text-xs text-faint-ink">
        The critic runs Review; the judge compares two versions. Each slot names its own model, so
        both may share one connection and still run different models. A connection's own model is
        used only when a slot's model is left empty.
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
    onAssignSlot(slot, { connectionId: id, model: "" });
  };

  const listModels = async () => {
    if (connection === null) return;
    setBusy(true);
    setError(null);
    try {
      setModels(await transport.listModels(connection));
    } catch (listError) {
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
