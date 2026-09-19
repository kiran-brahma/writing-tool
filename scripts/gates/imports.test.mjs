import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkImports, importSpecifiers, packageNameFor } from "./imports.mjs";

describe("importSpecifiers", () => {
  it("finds static imports, re-exports, dynamic imports and require", () => {
    const source = [
      'import react from "react";',
      'import "./side-effect";',
      'export { thing } from "vitest";',
      'const later = await import("wrangler");',
      'const old = require("typescript");',
    ].join("\n");

    expect(importSpecifiers(source, "example.mjs").map((entry) => entry.specifier)).toEqual([
      "react",
      "./side-effect",
      "vitest",
      "wrangler",
      "typescript",
    ]);
  });

  it("records the line each specifier appears on", () => {
    const source = '\n\nimport react from "react";\n';
    expect(importSpecifiers(source, "example.ts")).toEqual([{ specifier: "react", line: 3 }]);
  });

  it("ignores non-literal dynamic imports", () => {
    expect(importSpecifiers("import(someVariable);", "example.ts")).toEqual([]);
  });
});

describe("packageNameFor", () => {
  it("returns the package for bare and scoped specifiers, including subpaths", () => {
    expect(packageNameFor("react")).toBe("react");
    expect(packageNameFor("react/jsx-runtime")).toBe("react");
    expect(packageNameFor("@scope/pkg")).toBe("@scope/pkg");
    expect(packageNameFor("@scope/pkg/subpath")).toBe("@scope/pkg");
  });

  it("returns null for relative paths, builtins and internal imports", () => {
    expect(packageNameFor("./App")).toBeNull();
    expect(packageNameFor("../gates/scan.mjs")).toBeNull();
    expect(packageNameFor("/absolute/path")).toBeNull();
    expect(packageNameFor("node:fs")).toBeNull();
    expect(packageNameFor("fs")).toBeNull();
    expect(packageNameFor("#internal")).toBeNull();
  });
});

describe("checkImports", () => {
  let repoRoot;

  afterEach(() => {
    if (repoRoot !== undefined) {
      rmSync(repoRoot, { recursive: true, force: true });
      repoRoot = undefined;
    }
  });

  function makeRepo(source, packageJson, lock) {
    repoRoot = mkdtempSync(join(tmpdir(), "agent-gates-"));
    mkdirSync(join(repoRoot, "src"), { recursive: true });
    writeFileSync(join(repoRoot, "src/a.ts"), source);
    return { files: [join(repoRoot, "src/a.ts")], repoRoot, packageJson, lock };
  }

  function installPackage(name, version) {
    const directory = join(repoRoot, "node_modules", name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name, version }));
  }

  it("reports clean when an import resolves to a declared package at the pinned version", () => {
    const workspace = makeRepo(
      'import react from "react";',
      { dependencies: { react: "^19.3.0" } },
      { packages: { "node_modules/react": { version: "19.3.0" } } },
    );
    installPackage("react", "19.3.0");
    expect(checkImports(workspace)).toEqual([]);
  });

  it("flags a package that is not declared in package.json", () => {
    const workspace = makeRepo(
      'import postcss from "postcss";',
      {},
      { packages: {} },
    );
    const findings = checkImports(workspace);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: "src/a.ts", line: 1 });
    expect(findings[0].message).toContain("not declared in package.json");
  });

  it("flags a declared package that is not installed", () => {
    const workspace = makeRepo(
      'import ghost from "ghost";',
      { dependencies: { ghost: "^1.0.0" } },
      { packages: {} },
    );
    expect(checkImports(workspace)[0].message).toContain("not installed");
  });

  it("flags an installed version that disagrees with the lockfile pin", () => {
    const workspace = makeRepo(
      'import react from "react";',
      { dependencies: { react: "^19.3.0" } },
      { packages: { "node_modules/react": { version: "19.3.0" } } },
    );
    installPackage("react", "18.0.0");
    expect(checkImports(workspace)[0].message).toContain("lockfile pins 19.3.0");
  });

  it("flags a package with no lockfile entry", () => {
    const workspace = makeRepo(
      'import phantom from "phantom";',
      { devDependencies: { phantom: "^1.0.0" } },
      { packages: {} },
    );
    installPackage("phantom", "1.0.0");
    expect(checkImports(workspace)[0].message).toContain("no lockfile entry");
  });
});
