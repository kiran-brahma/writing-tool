import { useEffect, useState } from "react";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  REASONING_EFFORTS,
  type Connection,
  type KeyMode,
  type ReasoningEffort,
} from "./connection";
import { concurrencyGate, transport } from "./productionTransport";
import { testConnection } from "./transport";
import { PANEL_GLOSSES, type HelpSectionId } from "../help/helpContent";

interface ConnectionsPanelProps {
  connections: Connection[];
  onSave: (connection: Connection) => void;
  onAddCustom: () => void;
  onRemove: (connectionId: string) => void;
  onOpenHelp?: (sectionId: HelpSectionId) => void;
}

interface Feedback {
  kind: "ok" | "error";
  message: string;
}

/**
 * Story 2–14: the Writer's Connections. A Connection is a route: a Protocol, a
 * base URL, a key, a concurrency cap and the two output limits. The model is
 * chosen per Slot in the AI Settings view's Slots section, so it is not edited
 * here. "Test connection"
 * runs through the one Transport, so the visible queue below the header tells
 * the truth about what is in flight.
 */
export function ConnectionsPanel({
  connections,
  onSave,
  onAddCustom,
  onRemove,
  onOpenHelp,
}: ConnectionsPanelProps) {
  const [queue, setQueue] = useState(() => concurrencyGate.total());

  useEffect(() => {
    return concurrencyGate.subscribe(() => setQueue(concurrencyGate.total()));
  }, []);

  return (
    <section className="border-b border-rule">
      <div className="flex items-center justify-between border-b border-rule-soft px-4 py-2">
        <h2 className="text-sm font-semibold">Connections</h2>
        <span className="text-xs text-faint-ink">
          {queue.active > 0 || queue.queued > 0
            ? `${queue.active} in flight · ${queue.queued} queued`
            : "idle"}
        </span>
      </div>

      <p className="border-b border-rule-soft px-4 py-2 text-xs text-faint-ink">
        {PANEL_GLOSSES.connections.text}{" "}
        <button
          type="button"
          onClick={() => onOpenHelp?.(PANEL_GLOSSES.connections.sectionId)}
          className="underline hover:text-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          How this works
        </button>
      </p>

      <p className="px-4 py-2 text-xs text-faint-ink">
        A key is stored in this browser only, and sent only to the base URL of the connection you
        configured. In session mode it stays in memory and is gone after a reload. The model is
        chosen per slot above.
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
          className="w-full rounded border border-dashed border-rule-strong px-3 py-1.5 text-xs font-medium text-muted-ink hover:bg-sunk-strong/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Add custom connection
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
    <li className="rounded border border-rule bg-paper p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-soft-ink">{connection.name}</span>
        <span className="rounded bg-sunk px-1.5 py-0.5 text-xs text-faint-ink">
          {connection.protocol}
        </span>
      </div>

      <label className="mt-2 block text-xs text-faint-ink">
        Base URL
        <input
          type="text"
          value={baseUrl}
          readOnly={connection.builtIn}
          onChange={(event) => setBaseUrl(event.target.value)}
          onBlur={() => commit({ baseUrl })}
          className={`mt-0.5 w-full rounded border px-2 py-1 text-xs ${
            connection.builtIn
              ? "border-rule-soft bg-sunk text-faint-ink"
              : "border-rule bg-paper text-soft-ink"
          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus`}
        />
      </label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block text-xs text-faint-ink">
          API key
          <input
            type="password"
            value={apiKey}
            placeholder={connection.id === "ollama" ? "not needed locally" : ""}
            autoComplete="off"
            onChange={(event) => setApiKey(event.target.value)}
            onBlur={() => commit({ apiKey })}
            className="mt-0.5 w-full rounded border border-rule bg-paper px-2 py-1 text-xs text-soft-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
        </label>
        <label className="block text-xs text-faint-ink">
          Key storage
          <select
            value={connection.keyMode}
            onChange={(event) => commit({ keyMode: event.target.value as KeyMode })}
            className="mt-0.5 w-full rounded border border-rule bg-paper px-2 py-1 text-xs text-soft-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <option value="persisted">This browser</option>
            <option value="session">This session only</option>
          </select>
        </label>
      </div>

      {connection.keyMode === "session" && apiKey === "" && (
        <p className="mt-1 text-xs text-warning-muted">
          Session key not set — re-enter it to run model passes this session.
        </p>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block text-xs text-faint-ink">
          Max output tokens
          <input
            type="number"
            min={256}
            step={256}
            value={connection.maxOutputTokens}
            onChange={(event) =>
              commit({
                maxOutputTokens:
                  Number.parseInt(event.target.value, 10) || DEFAULT_MAX_OUTPUT_TOKENS,
              })
            }
            className="mt-0.5 w-full rounded border border-rule bg-paper px-2 py-1 text-xs text-soft-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
        </label>
        <label className="block text-xs text-faint-ink">
          Reasoning effort
          <select
            value={connection.reasoningEffort}
            onChange={(event) =>
              commit({ reasoningEffort: event.target.value as ReasoningEffort })
            }
            className="mt-0.5 w-full rounded border border-rule bg-paper px-2 py-1 text-xs text-soft-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {REASONING_EFFORTS.map((effort) => (
              <option key={effort} value={effort}>
                {effort === "" ? "Don't send" : effort}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-1 text-xs text-faint-ink">
        A thinking model spends the output budget on its reasoning before it answers. If a Run
        stops at the ceiling, raise the tokens or lower the effort. Ollama caps a response at
        16384 whatever the model's context window. Leave the effort unsent on Providers whose
        models do not reason: OpenAI rejects the field on those.
      </p>

      <div className="mt-2 flex items-end gap-2">
        <label className="w-24 block text-xs text-faint-ink">
          In flight
          <input
            type="number"
            min={1}
            max={16}
            value={connection.concurrency}
            onChange={(event) =>
              commit({ concurrency: Number.parseInt(event.target.value, 10) || 1 })
            }
            className="mt-0.5 w-full rounded border border-rule bg-paper px-2 py-1 text-xs text-soft-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onTest()}
          className="rounded border border-rule bg-paper px-2 py-1 text-xs font-medium text-quiet-ink hover:bg-sunk disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Test connection
        </button>
        {!connection.builtIn && (
          <button
            type="button"
            onClick={() => onRemove(connection.id)}
            className="ml-auto rounded border border-rule bg-paper px-2 py-1 text-xs font-medium text-faint-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Remove
          </button>
        )}
      </div>

      {feedback !== null && (
        <p
          className={`mt-2 break-words text-xs ${
            feedback.kind === "ok" ? "text-success" : "text-failure"
          }`}
        >
          {feedback.message}
        </p>
      )}
    </li>
  );
}

