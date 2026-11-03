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
}: {
  entry: LibraryEntry;
  active: boolean;
  onOpen: (documentId: string) => void;
}) {
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
        {entry.scratchpad && (
          <span className="rounded bg-sunk-strong px-1.5 py-0.5 text-xs font-medium text-quiet-ink">
            Scratchpad
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-faint-ink">
        {entry.wordCount} word{entry.wordCount === 1 ? "" : "s"} · edited{" "}
        {new Date(entry.updatedAt).toLocaleString()} ·{" "}
        {entry.openFindings === 0
          ? "no open findings"
          : `${entry.openFindings} open finding${entry.openFindings === 1 ? "" : "s"}`}
      </p>
    </li>
  );
}
