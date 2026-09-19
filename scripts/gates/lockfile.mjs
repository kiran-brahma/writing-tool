import { finding } from "./scan.mjs";

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

/**
 * Reports lockfile drift: a declared dependency whose specifier disagrees with
 * the lockfile, a lockfile entry with no declaration, or a dependency with no
 * resolved package. `npm ci` would fail on the first two; this reports them
 * before the commit does.
 */
export function checkLockfileDrift(packageJson, lock) {
  const findings = [];
  const root = lock.packages?.[""] ?? {};

  for (const field of DEPENDENCY_FIELDS) {
    const declared = packageJson[field] ?? {};
    const locked = root[field] ?? {};

    for (const [name, range] of Object.entries(declared)) {
      if (locked[name] === undefined) {
        findings.push(drift(`"${name}" is declared in package.json ${field} but missing from the lockfile.`));
      } else if (locked[name] !== range) {
        findings.push(
          drift(`"${name}" is "${range}" in package.json but "${locked[name]}" in the lockfile.`),
        );
      }
    }

    for (const name of Object.keys(locked)) {
      if (declared[name] === undefined) {
        findings.push(drift(`"${name}" is in the lockfile ${field} but not in package.json.`));
      }
    }
  }

  // Only dependencies and devDependencies are installed for the root project, so
  // only they must have a resolved package. A peer is not installed here, and an
  // optional dependency may be skipped on an unsupported platform.
  const installed = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };
  for (const name of Object.keys(installed)) {
    if (lock.packages?.[`node_modules/${name}`] === undefined) {
      findings.push(drift(`"${name}" has no resolved package in the lockfile.`));
    }
  }

  return findings;
}

function drift(message) {
  return finding("package-lock.json", 1, message);
}
