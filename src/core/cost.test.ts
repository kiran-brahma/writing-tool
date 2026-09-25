import { describe, expect, it } from "vitest";
import {
  addRunCost,
  costForRun,
  estimateRunCost,
  estimateStructuralCost,
  estimateTokens,
  formatCostEstimate,
  hasPriceFor,
  isPriceKnown,
  parsePriceTable,
  priceFor,
  serializePriceTable,
  type PriceTable,
} from "./cost";
import type { Pass } from "./pass";

const PRICES: PriceTable = {
  "gpt-4o": 5,
  "gpt-4o-mini": 0.6,
  "claude-3-5-sonnet": 3,
};

function modelPass(
  id: string,
  scope: Pass["scope"] = "document",
  enabled = true,
  extra: Partial<Pass> = {},
): Pass {
  return {
    id,
    name: id,
    description: id,
    kind: "model",
    scope,
    output: "findings",
    slot: "critic",
    enabled,
    ...extra,
  };
}

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

describe("hasPriceFor", () => {
  it("returns true when model matches an exact entry", () => {
    expect(hasPriceFor("gpt-4o", PRICES)).toBe(true);
    expect(isPriceKnown("gpt-4o", PRICES)).toBe(true);
  });

  it("returns true when versioned model matches prefix at separator", () => {
    expect(hasPriceFor("gpt-4o-2024-08-06", PRICES)).toBe(true);
  });

  it("returns false when prefix does not end at separator", () => {
    expect(hasPriceFor("gpt-4o", { "gpt-4": 7 })).toBe(false);
  });

  it("returns false for unknown model or empty table", () => {
    expect(hasPriceFor("mystery", PRICES)).toBe(false);
    expect(hasPriceFor("gpt-4o", {})).toBe(false);
    expect(hasPriceFor("", PRICES)).toBe(false);
  });

  it("returns true when model is explicitly priced at zero", () => {
    expect(hasPriceFor("ollama-local", { "ollama-local": 0 })).toBe(true);
  });
});

describe("estimateRunCost", () => {
  it("is characters ÷ 4 tokens at the model's price", () => {
    // 4000 chars -> 1000 tokens -> 0.001M * 5 = 0.005
    const estimate = estimateRunCost(4000, "gpt-4o", PRICES);
    expect(estimate).toEqual({
      characters: 4000,
      tokens: 1000,
      costUsd: 0.005,
      costKnown: true,
    });
  });

  it("is zero and marks costKnown as false for an unknown model, never a block", () => {
    const estimate = estimateRunCost(4000, "mystery", PRICES);
    expect(estimate.costUsd).toBe(0);
    expect(estimate.costKnown).toBe(false);
  });

  it("treats a negative or non-finite length as zero", () => {
    expect(estimateRunCost(-10, "gpt-4o", PRICES).tokens).toBe(0);
    expect(estimateRunCost(Number.NaN, "gpt-4o", PRICES).costUsd).toBe(0);
  });
});

describe("formatCostEstimate", () => {
  it("formats a known cost in US dollars", () => {
    expect(formatCostEstimate({ costUsd: 0.005, costKnown: true })).toBe("$0.0050");
    expect(formatCostEstimate({ costUsd: 0.02, costKnown: true })).toBe("$0.02");
    expect(formatCostEstimate({ costUsd: 0, costKnown: true })).toBe("$0.00");
  });

  it("says cost unknown rather than $0.00 when cost is unknown (story 188, 189)", () => {
    expect(formatCostEstimate({ costUsd: 0, costKnown: false })).toBe("cost unknown");
  });

  it("returns an empty string when estimate is undefined", () => {
    expect(formatCostEstimate(undefined)).toBe("");
  });
});

describe("estimateStructuralCost", () => {
  it("sums enabled Passes only", () => {
    const passes = [
      modelPass("doc-on", "document", true),
      modelPass("doc-off", "document", false),
    ];
    // 1 enabled pass * 4000 chars -> 1000 tokens -> $0.005
    const estimate = estimateStructuralCost(passes, 4000, "gpt-4o", PRICES);
    expect(estimate.passCount).toBe(1);
    expect(estimate.tokens).toBe(1000);
    expect(estimate.costUsd).toBeCloseTo(0.005);
    expect(estimate.costKnown).toBe(true);
  });

  it("sums document-scope Passes only", () => {
    const passes = [
      modelPass("doc", "document", true),
      modelPass("para", "paragraph", true),
      modelPass("sec", "section", true),
    ];
    const estimate = estimateStructuralCost(passes, 4000, "gpt-4o", PRICES);
    expect(estimate.passCount).toBe(1);
    expect(estimate.tokens).toBe(1000);
    expect(estimate.costUsd).toBeCloseTo(0.005);
  });

  it("excludes non-model and non-findings passes", () => {
    const passes = [
      modelPass("doc-findings", "document", true),
      modelPass("doc-audit", "document", true, { output: "audit" }),
      modelPass("doc-rule", "document", true, { kind: "rule" }),
    ];
    const estimate = estimateStructuralCost(passes, 4000, "gpt-4o", PRICES);
    expect(estimate.passCount).toBe(1);
    expect(estimate.tokens).toBe(1000);
  });

  it("multiplies by chunk count when chunk count is greater than one", () => {
    const passes = [
      modelPass("doc1", "document", true),
      modelPass("doc2", "document", true),
    ];
    // 2 passes, 4000 chars each (1000 tokens), 3 chunks
    // total tokens: 2 * 1000 * 3 = 6000 tokens
    // total cost: (6000 / 1_000_000) * 5 = 0.03
    const estimate = estimateStructuralCost(passes, 4000, "gpt-4o", PRICES, 3);
    expect(estimate.passCount).toBe(2);
    expect(estimate.chunks).toBe(3);
    expect(estimate.tokens).toBe(6000);
    expect(estimate.costUsd).toBeCloseTo(0.03);
    expect(estimate.costKnown).toBe(true);
  });

  it("treats chunk count of 1 or less as 1", () => {
    const passes = [modelPass("doc", "document", true)];
    const estimate1 = estimateStructuralCost(passes, 4000, "gpt-4o", PRICES, 1);
    const estimate0 = estimateStructuralCost(passes, 4000, "gpt-4o", PRICES, 0);
    expect(estimate1.chunks).toBe(1);
    expect(estimate0.chunks).toBe(1);
    expect(estimate1.tokens).toBe(1000);
    expect(estimate0.tokens).toBe(1000);
  });

  it("reports cost as unknown with an empty price table (story 189)", () => {
    const passes = [modelPass("doc", "document", true)];
    const estimate = estimateStructuralCost(passes, 4000, "gpt-4o", {});
    expect(estimate.passCount).toBe(1);
    expect(estimate.tokens).toBe(1000);
    expect(estimate.costUsd).toBe(0);
    expect(estimate.costKnown).toBe(false);
  });

  it("is deterministic: same input, same output", () => {
    const passes = [
      modelPass("doc1", "document", true),
      modelPass("doc2", "document", true),
    ];
    const a = estimateStructuralCost(passes, 4000, "gpt-4o", PRICES, 2);
    const b = estimateStructuralCost(passes, 4000, "gpt-4o", PRICES, 2);
    expect(a).toEqual(b);
  });

  it("supports per-pass character counts", () => {
    const passes = [
      modelPass("doc1", "document", true),
      modelPass("doc2", "document", true),
    ];
    const characters = {
      doc1: 4000, // 1000 tokens
      doc2: 8000, // 2000 tokens
    };
    // (1000 + 2000) * 2 chunks = 6000 tokens -> $0.03
    const estimate = estimateStructuralCost(passes, characters, "gpt-4o", PRICES, 2);
    expect(estimate.passCount).toBe(2);
    expect(estimate.tokens).toBe(6000);
    expect(estimate.costUsd).toBeCloseTo(0.03);
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
