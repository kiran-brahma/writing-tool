import { useMemo, useState } from "react";
import { filterLibrary, type LibraryEntry } from "../core/library";
import { BackupPanel } from "./BackupPanel";

export interface LibraryViewProps {
  entries: LibraryEntry[];
  activeDocumentId: string | null;
  onOpen: (documentId: string) => void;
  onCreate: () => void;
  lastBackedUp: number | null;
  backupError: string | null;
  /** A Library action failure, such as a delete that could not complete. */
  error: string | null;
  onDelete: (documentId: string) => Promise<boolean>;
  onDismissError: () => void;
  onBackup: () => void;
  onRestore: (json: string) => Promise<boolean>;
  onImportBundle: (json: string) => void;
  onDismissBackupError: () => void;
}

/**
 * The Library: a flat list of every Document in this browser, with search over
 * title and body text and the whole-library backup controls. Tags, status and
 * per-document bundles are gone; Markdown is the interchange format and the
 * document menu carries it.
 */
export function LibraryView({
  entries,
  activeDocumentId,
  onOpen,
  onCreate,
  lastBackedUp,
  backupError,
  error,
  onDelete,
  onDismissError,
  onBackup,
  onRestore,
  onImportBundle,
  onDismissBackupError,
}: LibraryViewProps) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => filterLibrary(entries, query, null), [entries, query]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Library</h2>
            <p className="text-sm text-faint-ink">
              {entries.length} {entries.length === 1 ? "document" : "documents"} in this browser.
            </p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="rounded bg-ink px-3 py-1.5 text-sm font-medium text-on-ink hover:bg-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            New document
          </button>
        </div>

        <BackupPanel
          lastBackedUp={lastBackedUp}
          error={backupError}
          onBackup={onBackup}
          onRestore={onRestore}
          onImportBundle={onImportBundle}
          onDismissError={onDismissBackupError}
        />

        {error !== null && (
          <div className="mt-4 flex items-start justify-between gap-3 rounded border border-warning-rule bg-warning-surface p-3 text-sm text-warning">
            <span>{error}</span>
            <button
              type="button"
              onClick={onDismissError}
              className="shrink-0 text-warning-muted hover:text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-focus"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="mt-6">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles and body text"
            aria-label="Search documents"
            className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm focus:border-rule-focus focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
        </div>

        <ol className="mt-6 space-y-3">
          {visible.length === 0 && (
            <li className="rounded border border-dashed border-rule px-4 py-8 text-center text-sm text-faint-ink">
              {entries.length === 0
                ? "No documents yet. Create one, or start typing in the scratchpad."
                : "No documents match this search."}
            </li>
          )}
          {visible.map((entry) => (
            <LibraryRow
              key={entry.id}
              entry={entry}
              active={entry.id === activeDocumentId}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}

function LibraryRow({
  entry,
  active,
  onOpen,
  onDelete,
}: {
  entry: LibraryEntry;
  active: boolean;
  onOpen: (documentId: string) => void;
  onDelete: (documentId: string) => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirmDelete = async () => {
    setBusy(true);
    const deleted = await onDelete(entry.id);
    setBusy(false);
    if (deleted) setConfirming(false);
  };

  return (
    <li
      className={
        active
          ? "rounded border border-rule-strong bg-paper p-4 shadow-sm"
          : "rounded border border-rule-soft bg-paper p-4"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onOpen(entry.id)}
          className="text-left text-lg font-semibold text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {entry.title}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {entry.scratchpad && (
            <span className="rounded bg-sunk-strong px-1.5 py-0.5 text-xs font-medium text-quiet-ink">
              Scratchpad
            </span>
          )}
          {!confirming && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded px-1.5 py-0.5 text-xs font-medium text-faint-ink hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <p className="mt-1 text-xs text-faint-ink">
        {entry.wordCount} word{entry.wordCount === 1 ? "" : "s"} · edited{" "}
        {new Date(entry.updatedAt).toLocaleString()} ·{" "}
        {entry.openFindings === 0
          ? "no open findings"
          : `${entry.openFindings} open finding${entry.openFindings === 1 ? "" : "s"}`}
      </p>

      {confirming && (
        <div className="mt-3 rounded border border-warning-rule-strong bg-warning-surface p-3">
          <p className="text-sm text-warning">
            Delete “{entry.title}”? Its revisions, findings and cached runs go with it. This
            cannot be undone unless it is in a backup.
            {active && " Obelus will open your most recently edited other document."}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void confirmDelete()}
              disabled={busy}
              className="rounded bg-warning px-3 py-1.5 text-sm font-medium text-warning-surface hover:bg-warning-soft disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-focus focus-visible:ring-offset-2"
            >
              Delete document
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded border border-rule bg-paper px-3 py-1.5 text-sm font-medium text-quiet-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
