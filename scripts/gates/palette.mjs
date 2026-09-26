import { readFileSync } from "node:fs";
import ts from "typescript";
import { finding, parseSource, toRepoPath, walk } from "./scan.mjs";

/**
 * Build gate: colour by name, never by palette step (spec v1.3, stories
 * 201–210).
 *
 * Every colour the UI draws is a name defined in `src/index.css` — paper, ink,
 * muted ink, mark, warning, failure — with a light and a dark value. A palette
 * class such as `bg-stone-100` or `text-white` has only one value, so a single
 * one left in a component is a patch that stays light in the dark scheme. This
 * reads the UI source's string literals, where class names live, and fails the
 * build on any palette class or palette variable, whatever its variant or
 * opacity. The fix is the name the table in `src/index.css` gives.
 */

const PALETTE_HUES = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "mauve",
  "olive",
  "mist",
  "taupe",
];

const PALETTE_STEPS = "(?:50|[1-9]00|950)";

/** Every utility that takes a colour. */
const COLOR_UTILITIES = [
  "bg",
  "text",
  "border",
  "border-[xytrblse]",
  "border-b[se]",
  "divide",
  "outline",
  "ring",
  "ring-offset",
  "inset-ring",
  "shadow",
  "inset-shadow",
  "drop-shadow",
  "text-shadow",
  "decoration",
  "accent",
  "caret",
  "fill",
  "stroke",
  "from",
  "via",
  "to",
  "placeholder",
];

const PALETTE_COLOR = `(?:(?:${PALETTE_HUES.join("|")})-${PALETTE_STEPS}|white|black)`;

/** One class token, once its variants, `!` and opacity are stripped. */
const PALETTE_CLASS = new RegExp(`^-?(?:${COLOR_UTILITIES.join("|")})-${PALETTE_COLOR}$`);

/** A palette variable, as in `bg-(--color-stone-100)` or `var(--color-white)`. */
const PALETTE_VARIABLE = new RegExp(`--color-${PALETTE_COLOR}(?![\\w-])`);

/** UI source: the app's `.ts` and `.tsx` modules, where a class name can be built. */
export function isUiSource(repoPath) {
  return (
    repoPath.startsWith("src/") &&
    (repoPath.endsWith(".tsx") || repoPath.endsWith(".ts")) &&
    !repoPath.includes(".test.")
  );
}

/** The palette colour a class token names, or null. */
export function paletteClass(token) {
  if (PALETTE_VARIABLE.test(token)) return token;
  // Variants (`hover:`, `dark:`, `focus-visible:`) end at the last colon.
  const utility = token.slice(token.lastIndexOf(":") + 1).replace(/^!|!$/g, "");
  const withoutOpacity = utility.replace(/\/[\w.[\]%-]+$/, "");
  return PALETTE_CLASS.test(withoutOpacity) ? token : null;
}

/** Palette classes in one file's string literals, with their line. */
export function findPaletteClasses(sourceText, fileName) {
  const sourceFile = parseSource(sourceText, fileName);
  const findings = [];

  walk(sourceFile, (node) => {
    if (
      !ts.isStringLiteral(node) &&
      !ts.isNoSubstitutionTemplateLiteral(node) &&
      !ts.isTemplateHead(node) &&
      !ts.isTemplateMiddle(node) &&
      !ts.isTemplateTail(node)
    ) {
      return;
    }
    for (const token of node.text.split(/\s+/)) {
      const match = paletteClass(token);
      if (match === null) continue;
      findings.push(
        finding(
          fileName,
          sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
          `palette colour "${match}": use a colour name from src/index.css, which has a dark value.`,
        ),
      );
    }
  });

  return findings;
}

/** The palette gate over every UI source file. */
export function checkPaletteClasses({ files, repoRoot }) {
  return files.flatMap((file) => {
    const repoPath = toRepoPath(repoRoot, file);
    if (!isUiSource(repoPath)) return [];
    return findPaletteClasses(readFileSync(file, "utf8"), repoPath);
  });
}
