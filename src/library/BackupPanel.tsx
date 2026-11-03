import { useState, type ChangeEvent } from "react";
import { backupReminder } from "../core/durability";

/**
 * The backup controls: whole-library backup with keys excluded, restore behind
 * an explicit confirmation, and a bundle import for files already exported.
 * Nothing here can insert a word into a document.
 */
export function BackupPanel({
  lastBackedUp,
  error,
  onBackup,
  onRestore,
  onImportBundle,
  onDismissError,
}: {
  lastBackedUp: number | null;
  error: string | null;
  onBackup: () => void;
  onRestore: (json: string) => Promise<boolean>;
  onImportBundle: (json: string) => void;
  onDismissError: () => void;
}) {
  const [pending, setPending] = useState<{ name: string; json: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const reminder = backupReminder(lastBackedUp);

  const chooseRestore = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (file === undefined) return;
    setPending({ name: file.name, json: await file.text() });
  };

  const confirmRestore = async () => {
    if (pending === null) return;
    setBusy(true);
    const restored = await onRestore(pending.json);
    setBusy(false);
    if (restored) setPending(null);
  };

  const importBundle = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (file === undefined) return;
    onImportBundle(await file.text());
  };

  return (
    <section className="mt-6 rounded border border-rule-soft bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Backup</h3>
          <p className={reminder.stale ? "mt-1 text-sm text-warning-soft" : "mt-1 text-sm text-faint-ink"}>
            {reminder.label}
            {reminder.stale && " Back up the library before clearing this browser."}
          </p>
        </div>
        <button
          type="button"
          onClick={onBackup}
          className="rounded bg-ink px-3 py-1.5 text-sm font-medium text-on-ink hover:bg-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          Back up library
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-rule-faint pt-3">
        <label className="cursor-pointer rounded border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-quiet-ink hover:bg-sunk has-focus-visible:ring-2 has-focus-visible:ring-focus">
          Restore from backup
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(event) => void chooseRestore(event)}
          />
        </label>
        <label className="cursor-pointer rounded border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-quiet-ink hover:bg-sunk has-focus-visible:ring-2 has-focus-visible:ring-focus">
          Import document bundle
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(event) => void importBundle(event)}
          />
        </label>
        <span className="text-xs text-faint-ink">
          A restore replaces the library. API keys are never included in a backup.
        </span>
      </div>

      {pending !== null && (
        <div className="mt-3 rounded border border-warning-rule-strong bg-warning-surface p-3">
          <p className="text-sm text-warning">
            Restore <span className="font-semibold">{pending.name}</span>? This replaces every
            document, revision, finding and setting in this browser. The current library cannot be
            recovered afterwards unless it is itself backed up.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void confirmRestore()}
              disabled={busy}
              className="rounded bg-warning px-3 py-1.5 text-sm font-medium text-warning-surface hover:bg-warning-soft disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-focus focus-visible:ring-offset-2"
            >
              Replace library
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              disabled={busy}
              className="rounded border border-rule bg-paper px-3 py-1.5 text-sm font-medium text-quiet-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error !== null && (
        <div className="mt-3 flex items-start justify-between gap-3 rounded border border-warning-rule bg-warning-surface p-3 text-sm text-warning">
          <span>{error}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="text-warning-muted hover:text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-focus"
          >
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
