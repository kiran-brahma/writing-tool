import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkForbiddenAffordances, findForbiddenAffordances, isUiSourceFile } from "./affordances.mjs";

describe("isUiSourceFile", () => {
  it("scans rendered React components", () => {
    expect(isUiSourceFile("src/App.tsx")).toBe(true);
    expect(isUiSourceFile("src/editor/FindingsSidebar.tsx")).toBe(true);
  });

  it("skips everything that is not a rendered component", () => {
    expect(isUiSourceFile("src/core/critique.ts")).toBe(false);
    expect(isUiSourceFile("scripts/agent-gates.mjs")).toBe(false);
    expect(isUiSourceFile("src/editor/FindingsSidebar.test.tsx")).toBe(false);
  });
});

describe("findForbiddenAffordances", () => {
  it("catches a button labelled Apply", () => {
    const source = "export function X() {\n  return <button>Apply</button>;\n}\n";
    expect(findForbiddenAffordances(source, "X.tsx")).toHaveLength(1);
    expect(findForbiddenAffordances(source, "X.tsx")[0]).toMatchObject({
      file: "X.tsx",
      line: 2,
    });
  });

  it("catches a label passed as a string", () => {
    const source = 'export const X = () => <button aria-label="Accept">{label}</button>;';
    expect(findForbiddenAffordances(source, "X.tsx")).toHaveLength(1);
  });

  it("catches a bare identifier named for the affordance", () => {
    const source = "const apply = () => insertText();\n";
    expect(findForbiddenAffordances(source, "X.tsx")).toHaveLength(1);
  });

  it("does not flag a longer identifier that merely contains the word", () => {
    const source = "applyFindings();\neditor.commands.insertContent('x');\n";
    expect(findForbiddenAffordances(source, "X.tsx")).toEqual([]);
  });

  it("does not flag a comment that discusses the affordance", () => {
    const source = "// nothing here can insert a word into the Document.\nconst x = 1;\n";
    expect(findForbiddenAffordances(source, "X.tsx")).toEqual([]);
  });

  it("does not flag the file input's standard accept attribute", () => {
    const source = 'return <input type="file" accept=".md,text/markdown" />;';
    expect(findForbiddenAffordances(source, "X.tsx")).toEqual([]);
  });

  it("flags accept on a control that is not the file input", () => {
    expect(findForbiddenAffordances("return <button accept={fn}>x</button>;", "X.tsx")).toHaveLength(
      1,
    );
  });

  it("catches a component named for the affordance", () => {
    expect(findForbiddenAffordances("return <Apply onClick={x} />;", "X.tsx")).toHaveLength(1);
  });

  it("catches an affordance-named prop", () => {
    expect(findForbiddenAffordances("return <Widget apply={fn} />;", "X.tsx")).toHaveLength(1);
  });

  it("does not flag the words inside longer prose", () => {
    const source = "export const help = 'Accepted files are imported.';\n";
    expect(findForbiddenAffordances(source, "X.tsx")).toEqual([]);
  });
});

describe("checkForbiddenAffordances", () => {
  let repoRoot;

  afterEach(() => {
    if (repoRoot !== undefined) {
      rmSync(repoRoot, { recursive: true, force: true });
      repoRoot = undefined;
    }
  });

  it("scans a UI component and skips a non-UI module", () => {
    repoRoot = mkdtempSync(join(tmpdir(), "affordances-"));
    mkdirSync(join(repoRoot, "src"), { recursive: true });
    const component = join(repoRoot, "src", "Button.tsx");
    const logic = join(repoRoot, "src", "apply.ts");
    writeFileSync(component, "export const B = () => <button>Apply</button>;");
    writeFileSync(logic, "export function apply() {}\n");

    const findings = checkForbiddenAffordances({ files: [component, logic], repoRoot });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: "src/Button.tsx", line: 1 });
  });
});
