import { readFileSync } from "node:fs";
import ts from "typescript";
import { finding, parseSource, toRepoPath, walk } from "./scan.mjs";

/**
 * Build-discipline gate: no silent catch.
 *
 * A catch is silent when it neither handles the failure, nor re-raises it, nor
 * carries a comment inside the block. "Handling" means at least one statement
 * that does something with the outcome; a block of bare `return` / `continue` /
 * `break`, or of no-op expressions such as `void error`, swallows the failure
 * just as an empty block does. The gate can see that a comment is present, not
 * whether it explains anything — a comment is the Writer's stated reason, and
 * trusting its content is not this gate's job.
 */
export function findSilentCatches(sourceText, fileName) {
  const sourceFile = parseSource(sourceText, fileName);
  const comments = commentRanges(sourceText);
  const findings = [];

  walk(sourceFile, (node) => {
    if (ts.isTryStatement(node) && node.catchClause !== undefined) {
      const block = node.catchClause.block;
      const binding = node.catchClause.variableDeclaration?.name;
      const caughtName = binding !== undefined && ts.isIdentifier(binding) ? binding.text : undefined;
      const handled = block.statements.some((statement) => !isNoOpStatement(statement, caughtName));
      const blockStart = block.getStart(sourceFile);
      const blockEnd = block.getEnd();
      const commented = comments.some((range) => range.pos >= blockStart && range.end <= blockEnd);

      if (!handled && !commented) {
        findings.push(
          finding(
            fileName,
            sourceFile.getLineAndCharacterOfPosition(blockStart).line + 1,
            "catch block swallows the error with no handling, no re-raise and no comment saying why.",
          ),
        );
      }
    }
  });

  return findings;
}

export function checkSilentCatches({ files, repoRoot }) {
  return files.flatMap((file) => findSilentCatches(readFileSync(file, "utf8"), toRepoPath(repoRoot, file)));
}

/**
 * Comment spans from the lexer, so a `//` inside a string literal is not
 * mistaken for a comment.
 */
function commentRanges(sourceText) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, sourceText);
  const ranges = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      ranges.push({ pos: scanner.getTokenPos(), end: scanner.getTextPos() });
    }
  }
  return ranges;
}

function isNoOpStatement(statement, caughtName) {
  if (ts.isEmptyStatement(statement)) return true;
  if (ts.isReturnStatement(statement)) return statement.expression === undefined;
  if (ts.isContinueStatement(statement) || ts.isBreakStatement(statement)) {
    return statement.label === undefined;
  }
  if (ts.isExpressionStatement(statement)) {
    const expression = statement.expression;
    if (ts.isVoidExpression(expression)) return true;
    if (ts.isIdentifier(expression)) {
      return expression.text === caughtName || expression.text === "undefined";
    }
    return (
      ts.isStringLiteral(expression) ||
      ts.isNumericLiteral(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression)
    );
  }
  return false;
}
