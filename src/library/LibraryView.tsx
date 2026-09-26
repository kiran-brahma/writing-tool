import { useMemo, useState, type FormEvent } from "react";
import {
  allTags,
  DOCUMENT_STATUSES,
  filterLibrary,
  isDocumentStatus,
  normalizeTags,
  type DocumentStatus,
  type LibraryEntry,
} from "../core/library";
import { BackupPanel } from "./BackupPanel";
import { PANEL_GLOSSES, type HelpSectionId } from "../help/helpContent";

/**
 * The Library: a flat list of every Document in this browser, with search over
 * title and body text, a tag filter, per-row tags and status, and the counts
 * that say what needs attention. It never inserts prose; opening a row hands the
 * Document to the editor.
 */
export interface LibraryViewProps {
  entries: LibraryEntry[];
  /** Which Document the editor currently holds, so the list can mark it. */
  activeDocumentId: string | null;
  onOpen: (documentId: string) => void;
  onCreate: () => void;
  onStatus: (documentId: string, status: DocumentStatus) => void;
  onTags: (documentId: string, tags: string[]) => void;
  /** Story 113: when the Writer last backed up, or null when never. */
  lastBackedUp: number | null;
  /** A backup or restore failure, surfaced verbatim. */
  backupError: string | null;
  /** Story 111: downloads a whole-Library backup. */
  onBackup: (includeKeys: boolean) => void;
  /** Story 111: replaces the Library from a backup file's text. */
  onRestore: (json: string) => Promise<boolean>;
  /** Story 114: downloads one Document's bundle. */
  onExportBundle: (documentId: string) => void;
  /** Story 114: imports a Document bundle as a new Document. */
  onImportBundle: (json: string) => void;
  onDismissBackupError: () => void;
  onOpenHelp?: (sectionId: HelpSectionId) => void;
}

export function LibraryView({
  entries,
  activeDocumentId,
  onOpen,
  onCreate,
  onStatus,
  onTags,
  lastBackedUp,
  backupError,
  onBackup,
  onRestore,
  onExportBundle,
  onImportBundle,
  onDismissBackupError,
  onOpenHelp,
}: LibraryViewProps) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  const tags = useMemo(() => allTags(entries), [entries]);
  // A tag can vanish when the Writer removes it from the last Document that
  // carried it. Fall back to "all" rather than filtering by a chip that no
  // longer exists, which would leave an empty list and no active chip.
  const activeTag = useMemo(
    () =>
      tag !== null && tags.some((entry) => entry.toLowerCase() === tag.toLowerCase())
        ? tag
        : null,
    [tag, tags],
  );
  const visible = useMemo(
    () => filterLibrary(entries, query, activeTag),
    [entries, query, activeTag],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Library</h2>
            <p className="text-sm text-faint-ink">
              {entries.length} {entries.length === 1 ? "document" : "documents"} in this browser.{" "}
              {PANEL_GLOSSES.library.text}{" "}
              {onOpenHelp !== undefined && (
                <button
                  type="button"
                  onClick={() => onOpenHelp(PANEL_GLOSSES.library.sectionId)}
                  className="text-faint-ink underline hover:text-soft-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  How this works
                </button>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="rounded bg-ink px-3 py-1.5 text-sm font-medium text-on-ink hover:bg-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
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
          onOpenHelp={onOpenHelp}
        />

        <div className="mt-6 space-y-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles and body text"
            aria-label="Search documents"
            className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm focus:border-rule-focus focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />

          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs uppercase tracking-wide text-faint-ink">Filter</span>
              <TagFilterChip label="All" active={activeTag === null} onClick={() => setTag(null)} />
              {tags.map((tagName) => (
                <TagFilterChip
                  key={tagName}
                  label={tagName}
                  active={activeTag === tagName}
                  onClick={() => setTag(activeTag === tagName ? null : tagName)}
                />
              ))}
            </div>
          )}
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
              onStatus={onStatus}
              onTags={onTags}
              onExportBundle={onExportBundle}
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
  onStatus,
  onTags,
  onExportBundle,
}: {
  entry: LibraryEntry;
  active: boolean;
  onOpen: (documentId: string) => void;
  onStatus: (documentId: string, status: DocumentStatus) => void;
  onTags: (documentId: string, tags: string[]) => void;
  onExportBundle: (documentId: string) => void;
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
        <div className="flex shrink-0 items-center gap-2">
          {entry.scratchpad && (
            <span className="rounded bg-sunk-strong px-1.5 py-0.5 text-xs font-medium text-quiet-ink">
              Scratchpad
            </span>
          )}
          <label className="sr-only" htmlFor={`status-${entry.id}`}>
            Document status
          </label>
          <select
            id={`status-${entry.id}`}
            value={entry.status}
            onChange={(event) => {
              if (isDocumentStatus(event.target.value)) onStatus(entry.id, event.target.value);
            }}
            className="rounded border border-rule bg-paper px-1.5 py-1 text-xs text-quiet-ink focus:border-rule-focus focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {DOCUMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onExportBundle(entry.id)}
            className="rounded border border-rule bg-paper px-2 py-1 text-xs font-medium text-quiet-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Export bundle
          </button>
        </div>
      </div>

      <p className="mt-1 text-xs text-faint-ink">
        {entry.wordCount} word{entry.wordCount === 1 ? "" : "s"} · edited{" "}
        {new Date(entry.updatedAt).toLocaleString()} ·{" "}
        {entry.openFindings === 0
          ? "no open findings"
          : `${entry.openFindings} open finding${entry.openFindings === 1 ? "" : "s"}`}
      </p>

      <TagEditor tags={entry.tags} onChange={(tags) => onTags(entry.id, tags)} />
    </li>
  );
}

/** Edits one Document's tags in place: remove a chip, or type one and commit. */
function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");

  const add = (event: FormEvent) => {
    event.preventDefault();
    const next = normalizeTags([...tags, draft]);
    if (next.length !== tags.length) onChange(next);
    setDraft("");
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded bg-sunk px-2 py-0.5 text-xs text-quiet-ink"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            onClick={() => onChange(tags.filter((existing) => existing !== tag))}
            className="text-ghost-ink hover:text-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            ×
          </button>
        </span>
      ))}
      <form onSubmit={add} className="inline-flex items-center gap-1">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add tag"
          aria-label="Add a tag"
          className="w-24 rounded border border-rule-soft px-1.5 py-0.5 text-xs focus:border-rule-strong focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
        <button
          type="submit"
          className="rounded border border-rule-soft px-1.5 py-0.5 text-xs text-muted-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Tag
        </button>
      </form>
    </div>
  );
}

function TagFilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-on-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          : "rounded-full border border-rule bg-paper px-2.5 py-1 text-xs text-muted-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      }
    >
      {label}
    </button>
  );
}

