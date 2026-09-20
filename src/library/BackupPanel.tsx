import { useState, type ChangeEvent } from "react";
import { backupReminder } from "../core/durability";

/**
 * Stories 111–113: the backup and restore controls, with the last-backed-up
 * reminder and the key opt-in. A restore is a two-step action: choosing a file
 * only stages it, and the replace happens behind an explicit confirmation,
 * because a restore discards the Library that is here.
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
  onBackup: (includeKeys: boolean) => void;
  onRestore: (json: string) => Promise<boolean>;
  onImportBundle: (json: string) => void;
  onDismissError: () => void;
}) {
  const [includeKeys, setIncludeKeys] = useState(false);
  const [pending, setPending] = useState<{ name: string; json: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const reminder = backupReminder(lastBackedUp);

  const backUp = () => {
    onBackup(includeKeys);
    // Story 112: keys are excluded again for the next backup unless re-checked.
    setIncludeKeys(false);
  };

  const chooseRestore = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    // Reset so choosing the same file twice still stages a restore.
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
    <section className="mt-6 rounded border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Backup</h3>
          <p className={reminder.stale ? "text-sm text-amber-800" : "text-sm text-stone-500"}>
            {reminder.label}
            {reminder.stale && " Back up the Library before clearing this browser."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-stone-600">
            <input
              type="checkbox"
              checked={includeKeys}
              onChange={(event) => setIncludeKeys(event.target.checked)}
            />
            Include API keys
          </label>
          <button
            type="button"
            onClick={backUp}
            className="rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-stone-50 hover:bg-stone-700"
          >
            Back up Library
          </button>
        </div>
      </div>

      {includeKeys && (
        <p className="mt-2 text-xs text-amber-800">
          The backup will carry your API keys in plain text. Do not share the file.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-stone-100 pt-3">
        <label className="cursor-pointer rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100">
          Restore from backup
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(event) => void chooseRestore(event)}
          />
        </label>
        <label className="cursor-pointer rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100">
          Import Document bundle
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(event) => void importBundle(event)}
          />
        </label>
        <span className="text-xs text-stone-500">
          A restore replaces the Library. Keys already stored in this browser are kept; keys omitted
          from a backup cannot be restored.
        </span>
      </div>

      {pending !== null && (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">
            Restore <span className="font-semibold">{pending.name}</span>? This replaces every
            Document, Revision, Finding and setting in this browser. The current Library cannot be
            recovered afterwards unless it is itself backed up.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void confirmRestore()}
              disabled={busy}
              className="rounded bg-amber-900 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-amber-800 disabled:opacity-50"
            >
              Replace Library
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              disabled={busy}
              className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error !== null && (
        <div className="mt-3 flex items-start justify-between gap-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span>{error}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="text-amber-700 hover:text-amber-900"
          >
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
