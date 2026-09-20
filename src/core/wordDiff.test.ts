import { describe, expect, it } from "vitest";
import { wordDiff } from "./wordDiff";

/** The changed words only, in order, as `+added` / `-removed`. */
function changes(before: string, after: string): string[] {
  return wordDiff(before, after)
    .filter((segment) => segment.kind !== "same")
    .map((segment) => `${segment.kind === "added" ? "+" : "-"}${segment.value.trim()}`);
}

describe("wordDiff", () => {
  it("marks an added word and a removed word at word level", () => {
    expect(changes("The very good cat.", "The very great cat.")).toEqual(["-good", "+great"]);
  });

  it("reports unchanged text as same, so the diff shows the whole passage", () => {
    const segments = wordDiff("one two", "one two");
    expect(segments.every((segment) => segment.kind === "same")).toBe(true);
    expect(segments.map((segment) => segment.value).join("")).toBe("one two");
  });

  it("emits the exact same/removed/added sequence for a replacement", () => {
    expect(wordDiff("one two three", "one four three")).toEqual([
      { kind: "same", value: "one " },
      { kind: "removed", value: "two" },
      { kind: "added", value: "four" },
      { kind: "same", value: " three" },
    ]);
  });

  it("reconstructs both sides from the segments", () => {
    const before = "First line.\nSecond line.";
    const after = "First line.\nA different second line.";
    const segments = wordDiff(before, after);

    const reconstructedBefore = segments
      .filter((segment) => segment.kind !== "added")
      .map((segment) => segment.value)
      .join("");
    const reconstructedAfter = segments
      .filter((segment) => segment.kind !== "removed")
      .map((segment) => segment.value)
      .join("");

    expect(reconstructedBefore).toBe(before);
    expect(reconstructedAfter).toBe(after);
  });

  it("returns nothing changed for two empty strings", () => {
    expect(changes("", "")).toEqual([]);
  });
});
