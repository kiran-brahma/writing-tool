import { describe, expect, it } from "vitest";
import {
  filterVoiceMatches,
  isInsideVoiceList,
  normalizeVoiceList,
  voiceListClause,
  voiceListIntervals,
} from "./voiceList";

describe("normalizeVoiceList", () => {
  it("keeps strings, trims them and collapses internal whitespace", () => {
    expect(normalizeVoiceList(["  leverage ", "at   its core"])).toEqual([
      "leverage",
      "at its core",
    ]);
  });

  it("drops blanks, non-strings and duplicates, case-insensitively", () => {
    expect(normalizeVoiceList(["Leverage", "", "  ", 7, null, "leverage", "ecosystem"])).toEqual([
      "Leverage",
      "ecosystem",
    ]);
  });

  it("reads a value that is not an array as the empty list", () => {
    expect(normalizeVoiceList("leverage")).toEqual([]);
    expect(normalizeVoiceList(undefined)).toEqual([]);
  });
});

describe("voiceListClause", () => {
  it("names the list as the Writer's own and asks the model not to report it", () => {
    const clause = voiceListClause(["leverage", "at its core"]);

    expect(clause).toContain("declared");
    expect(clause).toContain("Do not report");
    expect(clause).toContain("- leverage");
    expect(clause).toContain("- at its core");
  });
});

describe("voiceListIntervals", () => {
  it("finds every entry case-insensitively and on a word boundary", () => {
    const intervals = voiceListIntervals("Leverage and leverage. Not leveraged.\n", ["leverage"]);

    expect(intervals).toHaveLength(2);
    expect(intervals.map((interval) => interval.start)).toEqual([0, 13]);
  });

  it("prefers a phrase over a word inside it", () => {
    const intervals = voiceListIntervals("At its core it works.\n", ["core", "at its core"]);

    expect(intervals).toEqual([{ start: 0, end: 11 }]);
  });

  it("returns nothing for an empty list", () => {
    expect(voiceListIntervals("anything at all\n", [])).toEqual([]);
  });
});

describe("isInsideVoiceList", () => {
  it("is true only when the interval is contained in an entry", () => {
    const entries = [{ start: 4, end: 13 }];

    expect(isInsideVoiceList({ start: 4, end: 13 }, entries)).toBe(true);
    expect(isInsideVoiceList({ start: 6, end: 9 }, entries)).toBe(true);
    expect(isInsideVoiceList({ start: 0, end: 9 }, entries)).toBe(false);
  });
});

describe("filterVoiceMatches", () => {
  it("drops a match inside a Voice-list entry, outright", () => {
    const matches = [{ quote: "very", offset: 0 }];
    const kept = filterVoiceMatches(matches, "very good\n", ["very good"]);

    expect(kept).toEqual([]);
  });

  it("keeps a match a non-empty list does not cover", () => {
    const matches = [{ quote: "very", offset: 0 }];
    const kept = filterVoiceMatches(matches, "very good\n", ["good", "quite"]);

    expect(kept).toEqual(matches);
  });

  it("does not silence a match that only contains an entry", () => {
    // The Writer declared "good", not "very good"; the phrase is still a
    // problem the rule may report.
    const matches = [{ quote: "very good", offset: 0 }];
    const kept = filterVoiceMatches(matches, "very good\n", ["good"]);

    expect(kept).toEqual(matches);
  });
});
