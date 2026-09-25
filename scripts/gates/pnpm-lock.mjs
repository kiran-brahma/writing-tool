import { readFileSync } from "node:fs";
import { parseAllDocuments } from "yaml";

/**
 * `pnpm-lock.yaml`, reduced to the two things the gates need: the root
 * importer's declared specifiers per dependency field, and each direct
 * dependency's resolved version.
 *
 * Only the root importer is read. Every import in this repository is a direct
 * dependency, and both gates check only those, so the transitive graph is not
 * needed. Reducing the lockfile here keeps `checkLockfileDrift` and
 * `checkImports` pure and testable against a plain object rather than against a
 * YAML fixture.
 */
export const PNPM_LOCK_FILE = "pnpm-lock.yaml";

/** The dependency fields an importer can declare. */
const IMPORTER_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

/** The lockfile at `path`, in the shape the gates read. */
export function readPnpmLock(path) {
  return pnpmLockFromText(readFileSync(path, "utf8"));
}

/** The same reduction from the lockfile's text, so a test can pass a fixture. */
export function pnpmLockFromText(text) {
  const specifiers = {};
  const resolved = {};

  // A lockfile can hold more than one YAML document: a `packageManager` pin in
  // package.json makes pnpm prepend a `packageManagerDependencies` document
  // above the project's own. Every document's root importer is read, so the
  // project's is found wherever pnpm chose to put it.
  for (const document of parseAllDocuments(text)) {
    const root = document.toJS()?.importers?.["."];
    if (root === undefined || root === null) continue;

    for (const field of IMPORTER_FIELDS) {
      const entries = root[field];
      if (entries === undefined || entries === null) continue;

      specifiers[field] = { ...(specifiers[field] ?? {}) };
      for (const [name, entry] of Object.entries(entries)) {
        // Lockfile v9 records `{ specifier, version }`. Earlier formats recorded
        // the specifier as a bare string, which is still read so an older
        // lockfile parses rather than silently reporting every dependency as
        // missing.
        const specifier = typeof entry === "string" ? entry : entry?.specifier;
        if (typeof specifier === "string") specifiers[field][name] = specifier;

        const version = resolvedVersion(entry);
        if (version !== null) resolved[name] = version;
      }
    }
  }

  return { specifiers, resolved };
}

/**
 * A resolved version with pnpm's peer-dependency suffix removed: the lockfile
 * writes `19.3.0(react@19.3.0)` where the installed package says `19.3.0`, so
 * the two cannot be compared until the suffix is dropped.
 */
function resolvedVersion(entry) {
  const raw = typeof entry === "object" && entry !== null ? entry.version : undefined;
  if (typeof raw !== "string") return null;
  const suffix = raw.indexOf("(");
  return suffix === -1 ? raw : raw.slice(0, suffix);
}
