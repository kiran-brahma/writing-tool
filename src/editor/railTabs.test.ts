import { describe, expect, it } from "vitest";
import { nextTabSelection } from "./railTabs";

describe("railTabs keyboard navigation", () => {
  it("advances with ArrowRight and wraps around", () => {
    expect(nextTabSelection("structure", "ArrowRight")).toBe("paragraph");
    expect(nextTabSelection("paragraph", "ArrowRight")).toBe("word");
    expect(nextTabSelection("word", "ArrowRight")).toBe("all");
    expect(nextTabSelection("all", "ArrowRight")).toBe("structure");
  });

  it("advances with ArrowDown and wraps around", () => {
    expect(nextTabSelection("structure", "ArrowDown")).toBe("paragraph");
    expect(nextTabSelection("all", "ArrowDown")).toBe("structure");
  });

  it("steps backwards with ArrowLeft and wraps around", () => {
    expect(nextTabSelection("structure", "ArrowLeft")).toBe("all");
    expect(nextTabSelection("all", "ArrowLeft")).toBe("word");
    expect(nextTabSelection("word", "ArrowLeft")).toBe("paragraph");
    expect(nextTabSelection("paragraph", "ArrowLeft")).toBe("structure");
  });

  it("steps backwards with ArrowUp and wraps around", () => {
    expect(nextTabSelection("structure", "ArrowUp")).toBe("all");
    expect(nextTabSelection("word", "ArrowUp")).toBe("paragraph");
  });

  it("jumps to the first tab on Home", () => {
    expect(nextTabSelection("all", "Home")).toBe("structure");
    expect(nextTabSelection("word", "Home")).toBe("structure");
    expect(nextTabSelection("structure", "Home")).toBe("structure");
  });

  it("jumps to the last tab on End", () => {
    expect(nextTabSelection("structure", "End")).toBe("all");
    expect(nextTabSelection("paragraph", "End")).toBe("all");
    expect(nextTabSelection("all", "End")).toBe("all");
  });

  it("ignores unrelated keys", () => {
    expect(nextTabSelection("structure", "Enter")).toBeNull();
    expect(nextTabSelection("structure", "Tab")).toBeNull();
    expect(nextTabSelection("structure", "j")).toBeNull();
  });
});
