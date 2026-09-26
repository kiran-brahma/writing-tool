import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkPaletteClasses, findPaletteClasses, isUiSource, paletteClass } from "./palette.mjs";

describe("isUiSource", () => {
  it("scans the app's components and modules", () => {
    expect(isUiSource("src/App.tsx")).toBe(true);
    expect(isUiSource("src/editor/railClasses.ts")).toBe(true);
  });

  it("skips tests and everything outside the app", () => {
    expect(isUiSource("src/editor/FindingsSidebar.test.tsx")).toBe(false);
    expect(isUiSource("src/core/pass.test.ts")).toBe(false);
    expect(isUiSource("scripts/gates/palette.mjs")).toBe(false);
    expect(isUiSource("worker/index.ts")).toBe(false);
  });
});

describe("paletteClass", () => {
  it.each([
    "bg-stone-100",
    "text-amber-900",
    "border-t-stone-700",
    "divide-stone-200",
    "ring-stone-600",
    "ring-offset-white",
    "decoration-rose-500",
    "bg-white",
    "text-black",
    "hover:bg-stone-100",
    "dark:focus-visible:ring-red-600",
    "bg-stone-100/60",
    "!text-red-700",
    "bg-(--color-stone-100)",
    "fill-[var(--color-amber-200)]",
  ])("flags %s", (token) => {
    expect(paletteClass(token)).toBe(token);
  });

  it.each([
    "bg-paper",
    "text-muted-ink",
    "border-warning-rule",
    "hover:bg-sunk/60",
    "ring-offset-2",
    "ring-2",
    "text-sm",
    "border-t",
    "rounded-full",
    "bg-stone",
    "text-stone-1000",
    "whitespace",
    "--color-paper",
  ])("passes %s", (token) => {
    expect(paletteClass(token)).toBeNull();
  });
});

describe("findPaletteClasses", () => {
  it("catches a palette class in a className string", () => {
    const source = 'export const X = () => (\n  <p className="px-2 text-stone-500">x</p>\n);\n';
    expect(findPaletteClasses(source, "X.tsx")).toEqual([
      expect.objectContaining({ file: "X.tsx", line: 2 }),
    ]);
  });

  it("catches one in a class list built in a template or an array", () => {
    const source = [
      "const a = `rounded ${on ? 'bg-ink' : 'bg-amber-50'}`;",
      "const b = [active ? 'text-on-ink' : 'text-stone-600', `px-2 ${side} border-t-stone-300`];",
      "const c = `${x} hover:bg-white`;",
    ].join("\n");
    expect(findPaletteClasses(source, "X.tsx").map((entry) => entry.line)).toEqual([1, 2, 2, 3]);
  });

  it("passes classes written with colour names", () => {
    const source =
      '<button className="rounded bg-ink text-on-ink hover:bg-quiet-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2" />';
    expect(findPaletteClasses(source, "X.tsx")).toEqual([]);
  });

  it("does not flag a comment that names a palette class", () => {
    const source = "// was bg-stone-100 before the colour names\nconst x = 'bg-sunk';\n";
    expect(findPaletteClasses(source, "X.tsx")).toEqual([]);
  });
});

describe("checkPaletteClasses", () => {
  let repoRoot;

  afterEach(() => {
    if (repoRoot !== undefined) {
      rmSync(repoRoot, { recursive: true, force: true });
      repoRoot = undefined;
    }
  });

  it("scans UI source and skips a test", () => {
    repoRoot = mkdtempSync(join(tmpdir(), "palette-"));
    mkdirSync(join(repoRoot, "src"), { recursive: true });
    const component = join(repoRoot, "src", "Notice.tsx");
    const test = join(repoRoot, "src", "Notice.test.tsx");
    writeFileSync(component, 'export const N = () => <p className="bg-amber-50">x</p>;');
    writeFileSync(test, "expect(className).toContain('bg-amber-50');\n");

    const findings = checkPaletteClasses({ files: [component, test], repoRoot });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: "src/Notice.tsx", line: 1 });
  });
});
