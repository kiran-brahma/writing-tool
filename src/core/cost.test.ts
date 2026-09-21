import { describe, expect, it } from "vitest";
import {
  addRunCost,
  costForRun,
  estimateRunCost,
  estimateTokens,
  parsePriceTable,
  priceFor,
  serializePriceTable,
  type PriceTable,
} from "./cost";

const PRICES: PriceTable = {
  "gpt-4o": 5,
  "gpt-4o-mini": 0.6,
  "claude-3-5-sonnet": 3,
};

describe("estimateTokens", () => {
  it("is characters over four, rounded up (DESIGN §5)", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(1)).toBe(1);
    expect(estimateTokens(4)).toBe(1);
    expect(estimateTokens(5)).toBe(2);
    expect(estimateTokens(4000)).toBe(1000);
  });
});

describe("priceFor", () => {
  it("prefers an exact model id", () => {
    expect(priceFor("gpt-4o-mini", PRICES)).toBe(0.6);
  });

  it("falls back to the longest matching prefix for a versioned model id", () => {
    expect(priceFor("gpt-4o-2024-08-06", PRICES)).toBe(5);
    expect(priceFor("claude-3-5-sonnet-20241022", PRICES)).toBe(3);
  });

  it("does not let a prefix row price a different model that merely starts with it", () => {
    // `gpt-4` must not price `gpt-4o`; the prefix has to end at a separator.
    expect(priceFor("gpt-4o", { "gpt-4": 7 })).toBe(0);
    expect(priceFor("gpt-4o-2024-08-06", { "gpt-4": 7 })).toBe(0);
  });

  it("prices an unknown model at zero rather than refusing the Run", () => {
    expect(priceFor("mystery-model", PRICES)).toBe(0);
  });
});

describe("estimateRunCost", () => {
  it("is characters ÷ 4 tokens at the model's price", () => {
    // 4000 chars -> 1000 tokens -> 0.001M * 5 = 0.005
    const estimate = estimateRunCost(4000, "gpt-4o", PRICES);
    expect(estimate).toEqual({ characters: 4000, tokens: 1000, costUsd: 0.005 });
  });

  it("is zero for an unknown model, never a block", () => {
    expect(estimateRunCost(4000, "mystery", PRICES).costUsd).toBe(0);
  });

  it("treats a negative or non-finite length as zero", () => {
    expect(estimateRunCost(-10, "gpt-4o", PRICES).tokens).toBe(0);
    expect(estimateRunCost(Number.NaN, "gpt-4o", PRICES).costUsd).toBe(0);
  });
});

describe("costForRun", () => {
  it("prices Provider-reported usage when present", () => {
    // 1000 in + 1000 out = 2000 tokens -> 0.002M * 5 = 0.01
    const cost = costForRun(
      { fromCache: false, usage: { inputTokens: 1000, outputTokens: 1000 } },
      4000,
      "gpt-4o",
      PRICES,
    );
    expect(cost).toBeCloseTo(0.01);
  });

  it("falls back to the estimate when the Provider reported no usage", () => {
    expect(costForRun({ fromCache: false }, 4000, "gpt-4o", PRICES)).toBeCloseTo(0.005);
  });

  it("costs nothing on a cache hit, even with stored usage", () => {
    const cost = costForRun(
      { fromCache: true, usage: { inputTokens: 1000, outputTokens: 1000 } },
      4000,
      "gpt-4o",
      PRICES,
    );
    expect(cost).toBe(0);
  });
});

describe("the session total", () => {
  it("accumulates across Runs", () => {
    let total = 0;
    total = addRunCost(total, { fromCache: false }, 4000, "gpt-4o", PRICES);
    total = addRunCost(total, { fromCache: false }, 8000, "gpt-4o", PRICES);

    expect(total).toBeCloseTo(0.005 + 0.01);

    // A cache hit adds nothing.
    total = addRunCost(total, { fromCache: true }, 4000, "gpt-4o", PRICES);
    expect(total).toBeCloseTo(0.015);
  });
});

describe("the editable price table", () => {
  it("round-trips through its text form", () => {
    const text = "gpt-4o = 5\nclaude = 3\n";
    expect(parsePriceTable(text)).toEqual({ "gpt-4o": 5, claude: 3 });
    expect(parsePriceTable(serializePriceTable(parsePriceTable(text)))).toEqual({
      "gpt-4o": 5,
      claude: 3,
    });
  });

  it("drops a malformed line rather than guessing at it", () => {
    expect(parsePriceTable("gpt-4o = 5\nnonsense\ngemini = free\n")).toEqual({ "gpt-4o": 5 });
  });
});
