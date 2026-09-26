#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkForbiddenAffordances } from "./gates/affordances.mjs";
import { checkSecurityHeaderParity } from "./gates/headers.mjs";
import { checkImports } from "./gates/imports.mjs";
import { checkLockfileDrift } from "./gates/lockfile.mjs";
import { checkPaletteClasses } from "./gates/palette.mjs";
import { PNPM_LOCK_FILE, readPnpmLock } from "./gates/pnpm-lock.mjs";
import { collectSourceFiles } from "./gates/scan.mjs";
import { checkSilentCatches } from "./gates/silent-catch.mjs";
import { checkNoProviderRoute } from "./gates/worker.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const USAGE = "Usage: agent-gates check";

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function runChecks() {
  const files = collectSourceFiles(REPO_ROOT);
  const packageJson = loadJson(join(REPO_ROOT, "package.json"));
  const lock = readPnpmLock(join(REPO_ROOT, PNPM_LOCK_FILE));

  return [
    [
      "imports resolve to a declared package at the pinned version",
      checkImports({ files, repoRoot: REPO_ROOT, packageJson, lock }),
    ],
    ["no silent catch", checkSilentCatches({ files, repoRoot: REPO_ROOT })],
    ["no forbidden affordance in the UI source", checkForbiddenAffordances({ files, repoRoot: REPO_ROOT })],
    ["no palette colour class in the UI source", checkPaletteClasses({ files, repoRoot: REPO_ROOT })],
    ["no Worker route to a provider", checkNoProviderRoute({ files, repoRoot: REPO_ROOT })],
    ["the reference Vercel config carries the Worker's Content-Security-Policy", checkSecurityHeaderParity({ repoRoot: REPO_ROOT })],
    ["lockfile in sync", checkLockfileDrift(packageJson, lock)],
  ];
}

function report(sections) {
  let total = 0;
  for (const [label, findings] of sections) {
    total += findings.length;
    process.stdout.write(
      `${findings.length === 0 ? "ok  " : "FAIL"}  ${label} (${findings.length})\n`,
    );
    for (const finding of findings) {
      process.stdout.write(`      ${finding.file}:${finding.line}  ${finding.message}\n`);
    }
  }
  return total;
}

function main(argv) {
  if (argv[2] !== "check") {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  let sections;
  try {
    sections = runChecks();
  } catch (error) {
    process.stderr.write(
      `agent-gates could not run: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }

  const total = report(sections);
  process.stdout.write(total === 0 ? "\nagent-gates: clean\n" : `\nagent-gates: ${total} finding(s)\n`);
  return total === 0 ? 0 : 1;
}

process.exitCode = main(process.argv);
