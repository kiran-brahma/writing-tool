/**
 * The Library's pure model: the Document-status vocabulary, the projection the
 * Library lists, and the search and tag filters over it. Nothing here touches
 * storage — `src/storage/library.ts` joins these onto IndexedDB.
 *
 * The Library is flat: no folders, one optional list of tags per Document, and
 * search over title and body text (DESIGN §7). Keeping the filters pure means
 * story 21 and story 22 are testable with no browser and no database.
 */

/** CONTEXT.md: Document status is one of exactly three. */
export type DocumentStatus = "draft" | "revising" | "done";

export const DOCUMENT_STATUSES: readonly DocumentStatus[] = ["draft", "revising", "done"];

export function isDocumentStatus(value: unknown): value is DocumentStatus {
  return value === "draft" || value === "revising" || value === "done";
}

/** One row of the Library: a Document plus the counts the list shows. */
export interface LibraryEntry {
  id: string;
  title: string;
  /** The canonical body text, searched by story 21 but never rendered here. */
  canonical: string;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
  openFindings: number;
  tags: string[];
  status: DocumentStatus;
  /** True for the one auto-created Scratchpad (story 24). */
  scratchpad: boolean;
}

/** Story 21: case-insensitive search over the title and the body text. */
export function matchesQuery(entry: LibraryEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return (
    entry.title.toLowerCase().includes(needle) || entry.canonical.toLowerCase().includes(needle)
  );
}

/**
 * Story 22: keep only Documents carrying the selected tag, then apply story
 * 21's search. `tag === null` means every tag; matching is case-insensitive,
 * because two Documents may spell the same tag differently and `allTags`
 * collapses them into one filter chip.
 */
export function filterLibrary(
  entries: LibraryEntry[],
  query: string,
  tag: string | null,
): LibraryEntry[] {
  const wanted = tag === null ? null : tag.toLowerCase();
  return entries.filter(
    (entry) =>
      (wanted === null || entry.tags.some((entryTag) => entryTag.toLowerCase() === wanted)) &&
      matchesQuery(entry, query),
  );
}

/** Tags trimmed, emptied and de-duplicated case-insensitively, order kept. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (tag === "") continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
  }
  return normalized;
}

/** Every tag used across the Library, alphabetically, for the filter row. */
export function allTags(entries: LibraryEntry[]): string[] {
  const byLower = new Map<string, string>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      const key = tag.toLowerCase();
      if (!byLower.has(key)) byLower.set(key, tag);
    }
  }
  return [...byLower.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
