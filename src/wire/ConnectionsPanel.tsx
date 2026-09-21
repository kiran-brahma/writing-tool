import { useEffect, useState } from "react";
import type { Connection, KeyMode } from "./connection";
import { concurrencyGate, transport } from "./productionTransport";
import { testConnection } from "./transport";

interface ConnectionsPanelProps {
  connections: Connection[];
  onSave: (connection: Connection) => void;
  onAddCustom: () => void;
  onRemove: (connectionId: string) => void;
}

interface Feedback {
  kind: "ok" | "error";
  message: string;
}

/**
 * Story 2–14: the Writer's Connections. A Connection is a route: a Protocol, a
 * base URL, a key and a concurrency cap. The model is chosen per Slot in the
 * AI Settings view's Slots section, so it is not edited here. "Test connection"
 * runs through the one Transport, so the visible queue below the header tells
 * the truth about what is in flight.
 */
export function ConnectionsPanel({
  connections,
  onSave,
  onAddCustom,
  onRemove,
}: ConnectionsPanelProps) {
  const [queue, setQueue] = useState(() => concurrencyGate.total());

  useEffect(() => {
    return concurrencyGate.subscribe(() => setQueue(concurrencyGate.total()));
  }, []);

  return (
    <section className="border-b border-stone-300">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2">
        <h2 className="text-sm font-semibold">Connections</h2>
        <span className="text-xs text-stone-500">
          {queue.active > 0 || queue.queued > 0
            ? `${queue.active} in flight · ${queue.queued} queued`
            : "idle"}
        </span>
      </div>

      <p className="px-4 py-2 text-xs text-stone-500">
        A key is stored in this browser only, and sent only to the base URL of the Connection you
        configured. In session mode it stays in memory and is gone after a reload. The model is
        chosen per Slot above.
      </p>

      <ul className="space-y-3 px-4 py-3">
        {connections.map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            onSave={onSave}
            onRemove={onRemove}
          />
        ))}
      </ul>

      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={onAddCustom}
          className="w-full rounded border border-dashed border-stone-400 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-200/60"
        >
          Add Custom Connection
        </button>
      </div>
    </section>
  );
}

interface ConnectionCardProps {
  connection: Connection;
  onSave: (connection: Connection) => void;
  onRemove: (connectionId: string) => void;
}

function ConnectionCard({ connection, onSave, onRemove }: ConnectionCardProps) {
  // Text fields are drafts committed on blur, so storage latency never eats a
  // keystroke. Selects and the number field commit immediately.
  const [baseUrl, setBaseUrl] = useState(connection.baseUrl);
  const [apiKey, setApiKey] = useState(connection.apiKey);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBaseUrl(connection.baseUrl);
    setApiKey(connection.apiKey);
    setFeedback(null);
    // Reset only when the card changes identity; edits in progress must survive
    // a parent re-render caused by a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id]);

  const commit = (patch: Partial<Connection>) => {
    // Send every draft together so committing one field cannot drop another the
    // Writer edited before the parent re-rendered.
    onSave({ ...connection, baseUrl, apiKey, ...patch });
  };

  // The test uses what is on screen, not the last saved record, so a key typed
  // and not yet blurred is still tested.
  const current = (): Connection => ({ ...connection, baseUrl, apiKey });

  const onTest = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await testConnection(transport, current());
      setFeedback(
        result.ok
          ? {
              kind: "ok",
              message:
                result.models.length > 0
                  ? `Connected — ${result.models.length} model${result.models.length === 1 ? "" : "s"}.`
                  : "Connected.",
            }
          : { kind: "error", message: result.error ?? "The test failed." },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded border border-stone-300 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-stone-800">{connection.name}</span>
        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500">
          {connection.protocol}
        </span>
      </div>

      <label className="mt-2 block text-xs text-stone-500">
        Base URL
        <input
          type="text"
          value={baseUrl}
          readOnly={connection.builtIn}
          onChange={(event) => setBaseUrl(event.target.value)}
          onBlur={() => commit({ baseUrl })}
          className={`mt-0.5 w-full rounded border px-2 py-1 text-xs ${
            connection.builtIn
              ? "border-stone-200 bg-stone-100 text-stone-500"
              : "border-stone-300 bg-white text-stone-800"
          }`}
        />
      </label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block text-xs text-stone-500">
          API key
          <input
            type="password"
            value={apiKey}
            placeholder={connection.id === "ollama" ? "not needed locally" : ""}
            autoComplete="off"
            onChange={(event) => setApiKey(event.target.value)}
            onBlur={() => commit({ apiKey })}
            className="mt-0.5 w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800"
          />
        </label>
        <label className="block text-xs text-stone-500">
          Key storage
          <select
            value={connection.keyMode}
            onChange={(event) => commit({ keyMode: event.target.value as KeyMode })}
            className="mt-0.5 w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800"
          >
            <option value="persisted">This browser</option>
            <option value="session">This session only</option>
          </select>
        </label>
      </div>

      {connection.keyMode === "session" && apiKey === "" && (
        <p className="mt-1 text-[11px] text-amber-700">
          Session key not set — re-enter it to run model passes this session.
        </p>
      )}

      <div className="mt-2 flex items-end gap-2">
        <label className="w-24 block text-xs text-stone-500">
          In flight
          <input
            type="number"
            min={1}
            max={16}
            value={connection.concurrency}
            onChange={(event) =>
              commit({ concurrency: Number.parseInt(event.target.value, 10) || 1 })
            }
            className="mt-0.5 w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onTest()}
          className="rounded border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
        >
          Test connection
        </button>
        {!connection.builtIn && (
          <button
            type="button"
            onClick={() => onRemove(connection.id)}
            className="ml-auto rounded border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100"
          >
            Remove
          </button>
        )}
      </div>

      {feedback !== null && (
        <p
          className={`mt-2 break-words text-[11px] ${
            feedback.kind === "ok" ? "text-emerald-700" : "text-red-700"
          }`}
        >
          {feedback.message}
        </p>
      )}
    </li>
  );
}

