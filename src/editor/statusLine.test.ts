import { describe, expect, it } from "vitest";
import { wordCountLabel } from "./statusLine";

describe("wordCountLabel", () => {
  it("counts an empty Document as no words", () => {
    expect(wordCountLabel(0)).toBe("0 words");
  });

  it("uses the singular for one word", () => {
    expect(wordCountLabel(1)).toBe("1 word");
  });

  it("uses the plural otherwise", () => {
    expect(wordCountLabel(2)).toBe("2 words");
    expect(wordCountLabel(999)).toBe("999 words");
  });

  it("groups thousands so a long Document reads at a glance", () => {
    expect(wordCountLabel(1_000)).toBe("1,000 words");
    expect(wordCountLabel(123_456)).toBe("123,456 words");
  });
});
