import { describe, expect, it } from "vitest";
import {
  allTags,
  filterLibrary,
  isDocumentStatus,
  matchesQuery,
  normalizeTags,
  type LibraryEntry,
} from "./library";

function entry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: "doc-1",
    title: "Untitled",
    canonical: "\n",
    wordCount: 0,
    createdAt: 1,
    updatedAt: 1,
    openFindings: 0,
    tags: [],
    status: "draft",
    scratchpad: false,
    ...overrides,
  };
}

describe("matchesQuery", () => {
  it("matches the title case-insensitively", () => {
    expect(matchesQuery(entry({ title: "The Long Essay" }), "long")).toBe(true);
    expect(matchesQuery(entry({ title: "The Long Essay" }), "LONG")).toBe(true);
  });

  it("matches the body text, not just the title", () => {
    expect(matchesQuery(entry({ canonical: "a half-remembered phrase\n" }), "remembered")).toBe(
      true,
    );
  });

  it("does not match tags: body and title are the search surface", () => {
    expect(matchesQuery(entry({ tags: ["fiction"] }), "fiction")).toBe(false);
  });

  it("treats a blank query as matching everything", () => {
    expect(matchesQuery(entry(), "   ")).toBe(true);
  });
});

describe("filterLibrary", () => {
  const entries = [
    entry({ id: "a", title: "Hedgehogs", canonical: "spines\n", tags: ["nature"] }),
    entry({ id: "b", title: "Rockets", canonical: "thrust and a hedge trimmer\n", tags: ["space"] }),
    entry({ id: "c", title: "Gardens", canonical: "soil\n", tags: ["nature", "space"] }),
  ];

  it("keeps only Documents carrying the selected tag", () => {
    expect(filterLibrary(entries, "", "nature").map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("combines the tag filter with the search", () => {
    expect(filterLibrary(entries, "hedge", "space").map((item) => item.id)).toEqual(["b"]);
  });

  it("returns every Document when no tag is selected", () => {
    expect(filterLibrary(entries, "", null).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("matches tags case-insensitively", () => {
    const mixed = [
      entry({ id: "x", tags: ["Essay"] }),
      entry({ id: "y", tags: ["essay"] }),
      entry({ id: "z", tags: ["fiction"] }),
    ];

    expect(filterLibrary(mixed, "", "ESSAY").map((item) => item.id)).toEqual(["x", "y"]);
  });
});

describe("normalizeTags", () => {
  it("trims, drops empties and de-duplicates case-insensitively", () => {
    expect(normalizeTags(["  Essay ", "essay", "", "Fiction", "fiction", "Poetry"])).toEqual([
      "Essay",
      "Fiction",
      "Poetry",
    ]);
  });
});

describe("allTags", () => {
  it("collects the distinct tags across the Library, alphabetically", () => {
    const tags = allTags([
      entry({ tags: ["zeta", "Alpha"] }),
      entry({ tags: ["alpha", "beta"] }),
    ]);

    expect(tags).toEqual(["Alpha", "beta", "zeta"]);
  });
});

describe("isDocumentStatus", () => {
  it("accepts exactly the three statuses", () => {
    expect(isDocumentStatus("draft")).toBe(true);
    expect(isDocumentStatus("revising")).toBe(true);
    expect(isDocumentStatus("done")).toBe(true);
    expect(isDocumentStatus("finished")).toBe(false);
    expect(isDocumentStatus(undefined)).toBe(false);
  });
});
