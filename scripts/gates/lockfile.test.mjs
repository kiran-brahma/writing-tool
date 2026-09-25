import { describe, expect, it } from "vitest";
import { checkLockfileDrift } from "./lockfile.mjs";

/** The reduction `pnpm-lock.mjs` produces: declared specifiers + resolved versions. */
function lockWith(specifiers, resolved = { react: "19.3.0" }) {
  return { specifiers, resolved };
}

describe("checkLockfileDrift", () => {
  it("reports clean when package.json and the lockfile agree", () => {
    const packageJson = { dependencies: { react: "^19.3.0" } };
    const lock = lockWith({ dependencies: { react: "^19.3.0" } });
    expect(checkLockfileDrift(packageJson, lock)).toEqual([]);
  });

  it("reports a specifier that disagrees with the lockfile", () => {
    const packageJson = { dependencies: { react: "^19.3.0" } };
    const lock = lockWith({ dependencies: { react: "^18.0.0" } });
    const findings = checkLockfileDrift(packageJson, lock);
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe("pnpm-lock.yaml");
    expect(findings[0].message).toContain("^19.3.0");
  });

  it("reports a declaration missing from the lockfile", () => {
    const packageJson = { devDependencies: { vitest: "^5.0.1" } };
    const lock = lockWith({});
    expect(checkLockfileDrift(packageJson, lock)[0].message).toContain("missing from the lockfile");
  });

  it("reports a lockfile entry missing from package.json", () => {
    const packageJson = {};
    const lock = lockWith({ dependencies: { react: "^19.3.0" } });
    expect(checkLockfileDrift(packageJson, lock)[0].message).toContain("not in package.json");
  });

  it("reports a dependency with no resolved package", () => {
    const packageJson = { dependencies: { react: "^19.3.0" } };
    const lock = lockWith({ dependencies: { react: "^19.3.0" } }, {});
    expect(checkLockfileDrift(packageJson, lock)[0].message).toContain("no resolved package");
  });
});
