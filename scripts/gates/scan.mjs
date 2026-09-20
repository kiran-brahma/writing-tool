import { readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";

const SCAN_DIRECTORIES = ["src", "worker", "scripts"];
const SCAN_FILES = ["vite.config.ts"];
const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  ".git",
  ".wrangler",
  "coverage",
]);

/** Every source file the gates read, sorted for stable output. */
export function collectSourceFiles(repoRoot) {
  const files = [];
  for (const directory of SCAN_DIRECTORIES) {
    walkDirectory(join(repoRoot, directory), files);
  }
  for (const file of SCAN_FILES) {
    const absolute = join(repoRoot, file);
    if (isFile(absolute) && SCAN_EXTENSIONS.has(extname(absolute))) {
      files.push(absolute);
    }
  }
  return files.sort();
}

export function toRepoPath(repoRoot, absolutePath) {
  return relative(repoRoot, absolutePath).split("\\").join("/");
}

/** One gate finding. The section it is printed under names the rule. */
export function finding(file, line, message) {
  return { file, line, message };
}

export function parseSource(sourceText, fileName) {
  return ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(fileName),
  );
}

/** Depth-first over every node, with the parent so a gate can inspect context. */
export function walk(sourceFile, visit) {
  const recurse = (node, parent) => {
    visit(node, parent);
    ts.forEachChild(node, (child) => recurse(child, node));
  };
  recurse(sourceFile, undefined);
}

function scriptKindFor(fileName) {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (fileName.endsWith(".ts") || fileName.endsWith(".mts") || fileName.endsWith(".cts")) {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.JS;
}

function walkDirectory(directory, files) {
  if (!isDirectory(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      walkDirectory(absolute, files);
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(extname(entry.name))) {
      files.push(absolute);
    }
  }
}

function isDirectory(path) {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function isFile(path) {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}
