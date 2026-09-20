import { readFileSync } from "node:fs";
import ts from "typescript";
import { finding, parseSource, toRepoPath, walk } from "./scan.mjs";

/**
 * Build gate: the affordance half of Rule 1.
 *
 * The single seam proves a model reply cannot carry rewritten prose into a
 * Finding. It cannot prove the UI offers no Apply/Accept/Insert control, and no
 * behaviour test may assert on such a control without becoming a second seam.
 * So this reads source instead: the UI module is the app's rendered controls,
 * which are exactly its `.tsx` files, and the forbidden names are a build
 * failure rather than a review note. It observes source, not behaviour.
 *
 * It is deliberately a backstop, not a proof: it catches the affordance names
 * as a rendered label, a string literal, or a bare identifier. A new control
 * that names itself something else is still a review question.
 */

const FORBIDDEN = ["apply", "accept", "insert"];

const FORBIDDEN_PATTERNS = FORBIDDEN.map((word) => ({
  word,
  pattern: new RegExp(`\\b${word}\\b`, "i"),
}));

/** The rendered UI: every `.tsx` file, which is where a control can live. */
export function isUiSourceFile(repoPath) {
  return repoPath.startsWith("src/") && repoPath.endsWith(".tsx") && !repoPath.includes(".test.");
}

/** Forbidden affordance names in one file's source, with their line. */
export function findForbiddenAffordances(sourceText, fileName) {
  const sourceFile = parseSource(sourceText, fileName);
  const findings = [];

  const report = (node, word) => {
    findings.push(
      finding(
        fileName,
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        `forbidden affordance "${word}": no control may insert model-derived text.`,
      ),
    );
  };

  walk(sourceFile, (node, parent) => {
    if (ts.isJsxText(node)) {
      matchInText(node, node.text, report);
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      matchInText(node, node.text, report);
    } else if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text.toLowerCase();
      if (FORBIDDEN.includes(name) && !isFileInputAccept(node, parent)) report(node.name, name);
    } else if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      FORBIDDEN.includes(node.tagName.text.toLowerCase())
    ) {
      report(node.tagName, node.tagName.text.toLowerCase());
    } else if (
      ts.isIdentifier(node) &&
      !isJsxName(node, parent) &&
      FORBIDDEN.includes(node.text.toLowerCase())
    ) {
      report(node, node.text.toLowerCase());
    }
  });

  return findings;
}

/** Whole-word matches of every forbidden affordance in a rendered string. */
function matchInText(node, text, report) {
  for (const { word, pattern } of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) report(node, word);
  }
}

/**
 * `accept` is the standard file-input attribute, not an affordance. The
 * exemption is scoped to an `input` element, so an `accept` prop on any other
 * control is still flagged.
 */
function isFileInputAccept(node, parent) {
  if (node.name.text.toLowerCase() !== "accept") return false;
  const element = parent?.parent;
  return (
    element !== undefined &&
    (ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element)) &&
    ts.isIdentifier(element.tagName) &&
    element.tagName.text.toLowerCase() === "input"
  );
}

/**
 * Every JSX name is structural, handled on its own above, so the generic
 * identifier check must skip it to avoid reporting the same name twice. A
 * closing tag is skipped too: the opening tag already reported the component.
 */
function isJsxName(node, parent) {
  if (parent === undefined) return false;
  if (ts.isJsxAttribute(parent) && parent.name === node) return true;
  if (ts.isJsxOpeningElement(parent) && parent.tagName === node) return true;
  if (ts.isJsxSelfClosingElement(parent) && parent.tagName === node) return true;
  if (ts.isJsxClosingElement(parent) && parent.tagName === node) return true;
  return false;
}

/** The forbidden-affordance gate over every UI source file. */
export function checkForbiddenAffordances({ files, repoRoot }) {
  return files.flatMap((file) => {
    const repoPath = toRepoPath(repoRoot, file);
    if (!isUiSourceFile(repoPath)) return [];
    return findForbiddenAffordances(readFileSync(file, "utf8"), repoPath);
  });
}
