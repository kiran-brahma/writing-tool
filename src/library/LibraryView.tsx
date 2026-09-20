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
}

export function LibraryView({
  entries,
  activeDocumentId,
  onOpen,
  onCreate,
  onStatus,
  onTags,
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
            <p className="text-sm text-stone-500">
              {entries.length} Document{entries.length === 1 ? "" : "s"} in this browser
            </p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-stone-50 hover:bg-stone-700"
          >
            New Document
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles and body text"
            aria-label="Search Documents"
            className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />

          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs uppercase tracking-wide text-stone-500">Filter</span>
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
            <li className="rounded border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">
              {entries.length === 0
                ? "No Documents yet. Create one, or start typing in the Scratchpad."
                : "No Documents match this search."}
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
}: {
  entry: LibraryEntry;
  active: boolean;
  onOpen: (documentId: string) => void;
  onStatus: (documentId: string, status: DocumentStatus) => void;
  onTags: (documentId: string, tags: string[]) => void;
}) {
  return (
    <li
      className={
        active
          ? "rounded border border-stone-400 bg-white p-4 shadow-sm"
          : "rounded border border-stone-200 bg-white p-4"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onOpen(entry.id)}
          className="text-left text-base font-semibold text-stone-900 hover:underline"
        >
          {entry.title}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {entry.scratchpad && (
            <span className="rounded bg-stone-200 px-1.5 py-0.5 text-xs font-medium text-stone-700">
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
            className="rounded border border-stone-300 bg-white px-1.5 py-1 text-xs text-stone-700 focus:border-stone-500 focus:outline-none"
          >
            {DOCUMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="mt-1 text-xs text-stone-500">
        {entry.wordCount} word{entry.wordCount === 1 ? "" : "s"} · edited{" "}
        {new Date(entry.updatedAt).toLocaleString()} ·{" "}
        {entry.openFindings === 0
          ? "no open Findings"
          : `${entry.openFindings} open Finding${entry.openFindings === 1 ? "" : "s"}`}
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
          className="inline-flex items-center gap-1 rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-700"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            onClick={() => onChange(tags.filter((existing) => existing !== tag))}
            className="text-stone-400 hover:text-stone-700"
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
          className="w-24 rounded border border-stone-200 px-1.5 py-0.5 text-xs focus:border-stone-400 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded border border-stone-200 px-1.5 py-0.5 text-xs text-stone-600 hover:bg-stone-100"
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
          ? "rounded-full bg-stone-900 px-2.5 py-1 text-xs font-medium text-stone-50"
          : "rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-100"
      }
    >
      {label}
    </button>
  );
}
