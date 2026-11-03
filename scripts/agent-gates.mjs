#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkForbiddenAffordances } from "./gates/affordances.mjs";
import { checkPaletteClasses } from "./gates/palette.mjs";
import { collectSourceFiles } from "./gates/scan.mjs";
import { checkNoProviderRoute } from "./gates/worker.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const USAGE = "Usage: agent-gates check";

function runChecks() {
  const files = collectSourceFiles(REPO_ROOT);

  return [
    [
      "no forbidden affordance in the UI source",
      checkForbiddenAffordances({ files, repoRoot: REPO_ROOT }),
    ],
    ["no palette colour class in the UI source", checkPaletteClasses({ files, repoRoot: REPO_ROOT })],
    ["no Worker route to a provider", checkNoProviderRoute({ files, repoRoot: REPO_ROOT })],
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
