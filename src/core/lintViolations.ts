import type { Violation } from "./finding";

/**
 * The client-side linter half of Rule 2. Prompt instructions ban praise and
 * rewrite-shaped content, but prompts drift, so every returned string is
 * scanned and violations are surfaced rather than silently stripped.
 *
 * Detection is deliberately conservative: it catches explicit encouragement and
 * explicit rewrite offers, which is what prompt drift looks like, and it does
 * not try to guess at tone. The display half — struck-through rendering, the
 * per-Finding decline with `declineReason: "violation"` and the quarantined
 * rewrite pane — is #24's.
 */
interface LintRule {
  kind: Violation["kind"];
  pattern: RegExp;
}

const RULES: LintRule[] = [
  {
    kind: "praise",
    pattern:
      /\b(great|excellent|fantastic|wonderful|superb|brilliant|impressive|beautiful|lovely|engaging|compelling|vivid|strong)\s+(writing|prose|work|job|piece|paragraph|passage|draft|opening|sentence|voice|phrase|description)\b/gi,
  },
  {
    kind: "praise",
    pattern: /\b(well|nicely|beautifully|clearly)\s+(written|done|crafted|put|handled)\b/gi,
  },
  {
    kind: "praise",
    pattern:
      /\b(i (really )?(like|love|enjoy)|good job|nice work|great work|keep (it|this) up|well done)\b/gi,
  },
  {
    kind: "praise",
    pattern: /\bthis (is|reads|feels) (a )?(great|excellent|strong|beautiful|compelling|engaging)\b/gi,
  },
  {
    kind: "rewrite",
    pattern:
      /\b(consider|try|you (could|might|should)|i (would|'d))\s+(rewriting|rephrasing|saying|writing|changing|revising|replacing|tightening)\b/gi,
  },
  {
    kind: "rewrite",
    pattern: /\bwould (read|be) (better|clearer|stronger|tighter|more)\b/gi,
  },
  {
    kind: "rewrite",
    pattern: /\b(instead,? (write|say|use|try|consider))\b/gi,
  },
  {
    kind: "rewrite",
    pattern: /\breplace (it|this|the (sentence|phrase|clause|word)) with\b/gi,
  },
];

/** Praise or rewrite-shaped content in one returned string, first seen first. */
export function lintViolations(text: string): Violation[] {
  const violations: Violation[] = [];

  for (const rule of RULES) {
    // `matchAll` clones the regex, so a `g` pattern's `lastIndex` cannot leak
    // between calls; the same rule can lint many strings.
    for (const match of text.matchAll(rule.pattern)) {
      violations.push({ kind: rule.kind, text: match[0].trim() });
    }
  }

  return dedupeViolations(violations);
}

/** First seen first, one entry per kind and text. */
export function dedupeViolations(violations: Violation[]): Violation[] {
  const seen = new Set<string>();
  const result: Violation[] = [];
  for (const violation of violations) {
    const key = `${violation.kind}:${violation.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(violation);
  }
  return result;
}
