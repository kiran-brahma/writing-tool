import { describe, expect, it } from "vitest";
import { railOfferLabel, wordCountLabel } from "./statusLineLabels";

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

describe("railOfferLabel", () => {
  it("offers the Rail with the count of open Findings", () => {
    expect(railOfferLabel(3)).toBe("Rail · 3 open");
  });

  it("still offers the Rail when nothing is open", () => {
    expect(railOfferLabel(0)).toBe("Rail · 0 open");
  });

  it("groups thousands as the word count does", () => {
    expect(railOfferLabel(1_204)).toBe("Rail · 1,204 open");
  });
});
