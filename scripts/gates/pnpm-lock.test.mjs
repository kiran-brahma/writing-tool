import { describe, expect, it } from "vitest";
import { pnpmLockFromText } from "./pnpm-lock.mjs";

/** A lockfile in the v9 shape, which is what pnpm writes today. */
function lockV9(importers) {
  return [
    "lockfileVersion: '9.0'",
    "",
    "importers:",
    "",
    "  .:",
    "    dependencies:",
    "      react:",
    "        specifier: ^19.3.0",
    "        version: 19.3.0",
    "    devDependencies:",
    "      vitest:",
    "        specifier: ^5.0.1",
    "        version: 5.0.1(@types/node@26.6.2)",
    "",
    "packages:",
    "",
    "  react@19.3.0:",
    "    resolution: {integrity: sha512-abc}",
    "",
    importers ?? "",
  ].join("\n");
}

describe("pnpmLockFromText", () => {
  it("reads a v9 importer's specifiers and resolved versions", () => {
    const lock = pnpmLockFromText(lockV9());

    expect(lock.specifiers.dependencies).toEqual({ react: "^19.3.0" });
    expect(lock.specifiers.devDependencies).toEqual({ vitest: "^5.0.1" });
    expect(lock.resolved).toEqual({ react: "19.3.0", vitest: "5.0.1" });
  });

  it("strips pnpm's peer-dependency suffix, so the version matches node_modules", () => {
    // The lockfile writes `19.3.0(react@19.3.0)` where the installed package
    // says `19.3.0`; without stripping, every such package reads as drift.
    const lock = pnpmLockFromText(
      lockV9().replace("version: 19.3.0\n", "version: 19.3.0(react@19.3.0)\n"),
    );

    expect(lock.resolved.react).toBe("19.3.0");
  });

  it("still reads the older bare-string form rather than reporting it missing", () => {
    const text = ["lockfileVersion: '6.0'", "", "importers:", "", "  .:", "    dependencies:", "      react: ^19.3.0", ""].join("\n");
    const lock = pnpmLockFromText(text);

    expect(lock.specifiers.dependencies).toEqual({ react: "^19.3.0" });
    // A bare string carries no resolved version, so nothing is claimed.
    expect(lock.resolved).toEqual({});
  });

  it("reads the project importer when pnpm prepends a packageManager document", () => {
    // A `packageManager` pin in package.json makes pnpm write the pinned tool's
    // own dependencies as a separate document above the project's lockfile.
    const pinnedTool = [
      "---",
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      "  .:",
      "    configDependencies: {}",
      "    packageManagerDependencies:",
      "      pnpm:",
      "        specifier: 12.5.1",
      "        version: 12.5.1",
      "",
    ].join("\n");
    const lock = pnpmLockFromText(`${pinnedTool}\n---\n${lockV9()}`);

    expect(lock.specifiers.dependencies).toEqual({ react: "^19.3.0" });
    expect(lock.resolved).toEqual({ react: "19.3.0", vitest: "5.0.1" });
  });

  it("treats a lockfile with no root importer as declaring nothing", () => {
    const lock = pnpmLockFromText("lockfileVersion: '9.0'\n");

    expect(lock.specifiers).toEqual({});
    expect(lock.resolved).toEqual({});
  });

  it("ignores a package with no resolved version instead of inventing one", () => {
    const text = [
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      "  .:",
      "    dependencies:",
      "      local:",
      "        specifier: link:../local",
      "",
    ].join("\n");
    const lock = pnpmLockFromText(text);

    expect(lock.specifiers.dependencies).toEqual({ local: "link:../local" });
    expect(lock.resolved.local).toBeUndefined();
  });
});
