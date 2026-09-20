import { describe, expect, it } from "vitest";
import type { Finding } from "./finding";
import { reconcileFindings } from "./reconcile";

function finding(
  anchor: { quote: string; offset: number },
  overrides: Partial<Finding> = {},
): Finding {
  const { anchor: _anchor, ...rest } = overrides;
  return {
    id: crypto.randomUUID(),
    passId: "hedges",
    promptHash: "hash",
    issue: "issue",
    diagnosis: "diagnosis",
    status: "open",
    provenance: { providerId: "local", model: "rule", at: 1, revisionId: "r1" },
    ...rest,
    anchor: { ...anchor, state: "attached" },
  };
}

describe("reconcileFindings", () => {
  it("keeps a stored Finding's identity and status when the Run re-finds its span", () => {
    const stored = finding({ quote: "very", offset: 0 }, { id: "stored", status: "declined" });
    const produced = finding({ quote: "very", offset: 0 }, { id: "fresh" });

    const merged = reconcileFindings([produced], [stored], "very good\n");

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("stored");
    expect(merged[0].status).toBe("declined");
    expect(merged[0].anchor.state).toBe("attached");
  });

  it("keeps the stored Anchor and provenance, so both name the same canonical", () => {
    const stored = finding(
      { quote: "very", offset: 0 },
      { id: "stored", issue: "old issue", provenance: { providerId: "local", model: "rule", at: 1, revisionId: "old-revision" } },
    );
    const produced = finding({ quote: "very", offset: 8 }, { id: "fresh", issue: "new issue" });

    const merged = reconcileFindings([produced], [stored], "so very good\n");

    expect(merged[0].id).toBe("stored");
    expect(merged[0].anchor).toEqual({ quote: "very", offset: 0, state: "attached" });
    expect(merged[0].provenance.revisionId).toBe("old-revision");
    // Run-derived prose refreshes, so an edited Pass is reflected.
    expect(merged[0].issue).toBe("new issue");
  });

  it("refreshes a matched Finding's violations and clears a stale one", () => {
    const stored = finding(
      { quote: "very", offset: 0 },
      { id: "stored", violations: [{ kind: "praise", text: "great writing" }] },
    );
    const produced = finding({ quote: "very", offset: 0 }, { id: "fresh" });

    const merged = reconcileFindings([produced], [stored], "very good\n");

    expect(merged[0].violations).toBeUndefined();
  });

  it("keeps a Finding the Run did not re-produce, orphaned when its quote is gone", () => {
    const stored = finding({ quote: "gone", offset: 0 }, { id: "stored" });
    const produced = finding({ quote: "very", offset: 0 }, { id: "fresh" });

    const merged = reconcileFindings([produced], [stored], "very good\n");

    expect(merged.map((entry) => entry.id)).toEqual(["fresh", "stored"]);
    expect(merged[1].anchor.state).toBe("orphaned");
  });

  it("drops an attached Finding the current Pass no longer produces", () => {
    const stored = finding({ quote: "very", offset: 0 }, { id: "stored" });

    const merged = reconcileFindings([], [stored], "very good\n");

    expect(merged).toEqual([]);
  });

  it("drops a duplicate that resolves onto a span the Run re-found", () => {
    const first = finding({ quote: "very", offset: 0 }, { id: "first" });
    const second = finding({ quote: "very", offset: 99 }, { id: "second" });
    const produced = finding({ quote: "very", offset: 0 }, { id: "fresh" });

    const merged = reconcileFindings([produced], [first, second], "very good\n");

    expect(merged.map((entry) => entry.id)).toEqual(["first"]);
  });

  it("orders attached Findings in document order with Orphaned last", () => {
    const later = finding({ quote: "quite", offset: 8 }, { id: "later" });
    const gone = finding({ quote: "gone", offset: 0 }, { id: "gone" });
    const earlier = finding({ quote: "very", offset: 0 }, { id: "earlier" });
    const produced = [
      finding({ quote: "quite", offset: 8 }, { id: "fresh-later" }),
      finding({ quote: "very", offset: 0 }, { id: "fresh-earlier" }),
    ];

    const merged = reconcileFindings(produced, [later, gone, earlier], "very good quite\n");

    expect(merged.map((entry) => entry.id)).toEqual(["earlier", "later", "gone"]);
  });
});
