import { existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join } from "node:path";
import ts from "typescript";
import { PNPM_LOCK_FILE } from "./pnpm-lock.mjs";
import { finding, parseSource, toRepoPath, walk } from "./scan.mjs";

const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

// Fields whose packages are installed for the root project. `peerDependencies`
// is excluded deliberately: a peer is not installed here, so an import only a
// peer could satisfy is still an unresolved import.
const DECLARATION_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"];

/**
 * Build-discipline gate: every import resolves to a package declared in
 * package.json, at the version the lockfile pins.
 *
 * It checks the package a specifier names, not the subpath inside it — a deep
 * path such as `pkg/missing` is left to `tsc` and Vite, which resolve with the
 * package's own `exports` map.
 *
 * `lock` is the reduction `pnpm-lock.mjs` produces from `pnpm-lock.yaml`.
 */
export function checkImports({ files, repoRoot, packageJson, lock }) {
  const declared = new Set(
    DECLARATION_FIELDS.flatMap((field) => Object.keys(packageJson[field] ?? {})),
  );
  const findings = [];

  for (const file of files) {
    const repoPath = toRepoPath(repoRoot, file);
    const sourceText = readFileSync(file, "utf8");
    for (const { specifier, line } of importSpecifiers(sourceText, file)) {
      const packageName = packageNameFor(specifier);
      if (packageName === null) continue;

      if (!declared.has(packageName)) {
        findings.push(
          finding(
            repoPath,
            line,
            `"${specifier}" imports package "${packageName}", which is not declared in package.json.`,
          ),
        );
        continue;
      }

      const packageDirectory = resolveInstalledPackage(file, packageName, repoRoot);
      if (packageDirectory === null) {
        findings.push(
          finding(
            repoPath,
            line,
            `"${specifier}" resolves to package "${packageName}", which is not installed.`,
          ),
        );
        continue;
      }

      const lockVersion = lock.resolved[packageName];
      const installedVersion = readInstalledVersion(packageDirectory);
      if (lockVersion === undefined) {
        findings.push(
          finding(
            repoPath,
            line,
            `"${specifier}" resolves to "${packageName}", which has no entry in ${PNPM_LOCK_FILE}.`,
          ),
        );
      } else if (installedVersion !== lockVersion) {
        findings.push(
          finding(
            repoPath,
            line,
            `"${specifier}" resolves to "${packageName}@${installedVersion}", but the lockfile pins ${lockVersion}.`,
          ),
        );
      }
    }
  }

  return findings;
}

/**
 * Every module specifier in a source file, with the line it appears on. Static
 * imports, re-exports, `import x = require(...)`, dynamic `import(...)` and
 * `require(...)` are all included.
 */
export function importSpecifiers(sourceText, fileName) {
  const sourceFile = parseSource(sourceText, fileName);
  const specifiers = [];
  walk(sourceFile, (node) => {
    const specifier = specifierOf(node);
    if (specifier !== null) {
      specifiers.push({
        specifier,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      });
    }
  });
  return specifiers;
}

function specifierOf(node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    ts.isStringLiteral(node.moduleReference.expression)
  ) {
    return node.moduleReference.expression.text;
  }
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length === 1 &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "require" &&
    node.arguments.length === 1 &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  return null;
}

/**
 * The installed package a specifier names, or `null` for relative paths, Node
 * builtins and package-internal `#` imports. Scoped packages keep both segments.
 */
export function packageNameFor(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("#")) {
    return null;
  }
  if (specifier.startsWith("node:") || NODE_BUILTINS.has(specifier)) {
    return null;
  }
  const segments = specifier.split("/");
  if (specifier.startsWith("@")) {
    return segments.length >= 2 && segments[1] !== "" ? `${segments[0]}/${segments[1]}` : null;
  }
  return segments[0] === "" ? null : segments[0];
}

function resolveInstalledPackage(fromFile, packageName, repoRoot) {
  let directory = dirname(fromFile);
  for (;;) {
    const candidate = join(directory, "node_modules", packageName);
    if (existsSync(join(candidate, "package.json"))) {
      return candidate;
    }
    if (directory === repoRoot) return null;
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

function readInstalledVersion(packageDirectory) {
  return JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8")).version;
}
