import { readFileSync } from "node:fs";
import ts from "typescript";
import { finding, parseSource, toRepoPath, walk } from "./scan.mjs";

/**
 * Build gate: the Worker must never call a Provider.
 *
 * `DESIGN.md` §1 states it as an invariant: the only Worker code is security
 * headers and the static assets, and "a Worker route that calls a provider is
 * therefore the one thing that must never be added." No other gate can see it —
 * the affordance gate reads `.tsx`, and the import gate cannot tell a fetch of
 * the assets binding from a fetch of a Provider — so the invariant gets a gate
 * of its own over `worker/`.
 *
 * Like the affordance gate, it is a backstop rather than a proof: it reads
 * source, and a route that reached a Provider by a mechanism this does not name
 * is still a review question.
 */

/** The one binding the Worker may fetch: its own static assets. */
const ALLOWED_FETCH_OWNER = /\.ASSETS$/;

/** Globals that open a connection the Worker has no business opening. */
const FORBIDDEN_NETWORK_GLOBALS = ["XMLHttpRequest", "WebSocket", "EventSource"];

/** The Worker's own source. Its tests may fetch whatever they like. */
export function isWorkerSourceFile(repoPath) {
  return (
    repoPath.startsWith("worker/") &&
    (repoPath.endsWith(".ts") || repoPath.endsWith(".js")) &&
    !repoPath.includes(".test.")
  );
}

/** Every outbound call in one Worker file that is not the assets binding. */
export function findOutboundCalls(sourceText, fileName) {
  const sourceFile = parseSource(sourceText, fileName);
  const findings = [];

  const report = (node, message) => {
    findings.push(
      finding(
        fileName,
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        message,
      ),
    );
  };

  walk(sourceFile, (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === "fetch") {
        report(
          callee,
          'the Worker must not call fetch: only the "ASSETS" binding may serve a request.',
        );
      } else if (ts.isPropertyAccessExpression(callee) && callee.name.text === "fetch") {
        const owner = callee.expression.getText(sourceFile);
        if (!ALLOWED_FETCH_OWNER.test(owner)) {
          report(callee, `the Worker must only fetch the "ASSETS" binding, not "${owner}".`);
        }
      }
    }

    if (ts.isIdentifier(node) && FORBIDDEN_NETWORK_GLOBALS.includes(node.text)) {
      report(node, `the Worker must not open a connection with ${node.text}.`);
    }
  });

  return findings;
}

/** The no-Provider-route gate over every Worker source file. */
export function checkNoProviderRoute({ files, repoRoot }) {
  return files.flatMap((file) => {
    const repoPath = toRepoPath(repoRoot, file);
    if (!isWorkerSourceFile(repoPath)) return [];
    return findOutboundCalls(readFileSync(file, "utf8"), repoPath);
  });
}
