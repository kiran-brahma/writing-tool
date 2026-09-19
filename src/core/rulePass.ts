import { resolveAnchor } from "./anchor";
import type { AnchorDraft, Finding } from "./finding";
import { hashPass, type Pass } from "./pass";

/**
 * The rule engine's contract: a pure function from the canonical string plus a
 * Pass to Findings. The analysis is deterministic — the same string and config
 * yield the same matches — and it never touches the Transport, a Connection or a
 * key, so it is useful before the Writer has configured anything, and it can
 * neither praise nor rewrite. Finding ids are minted per run; identity across
 * runs is reconciled in Core, not claimed here.
 */

/** One deterministic problem a rule found, before it is shaped into a Finding. */
export interface RuleMatch extends AnchorDraft {
  issue: string;
  diagnosis: string;
  pattern?: string;
}

export interface RuleRunContext {
  at: number;
  /** The Revision the Run is recorded against. */
  revisionId: string;
}

/**
 * A rule Pass over the canonical string. The hedge sweep runs automatically on
 * save; #6 adds the remaining rule Passes behind the same entry point.
 */
export function runRulePass(canonical: string, pass: Pass, context: RuleRunContext): Finding[] {
  return findingsFromMatches(ruleMatches(canonical, pass), canonical, pass, context);
}

/** The deterministic matches a rule Pass finds, with no provenance attached. */
export function ruleMatches(canonical: string, pass: Pass): RuleMatch[] {
  return matchHedges(canonical, pass.ruleConfig?.hedges ?? []);
}

/** Shapes matches into Findings, computing each Anchor's state by resolution. */
function findingsFromMatches(
  matches: RuleMatch[],
  canonical: string,
  pass: Pass,
  context: RuleRunContext,
): Finding[] {
  const promptHash = hashPass(pass);
  return matches.map((match) => {
    // State is computed from resolution, never authored: the match carries a
    // quote and an offset, and only `resolveAnchor` decides attached/orphaned.
    const interval = resolveAnchor({ quote: match.quote, offset: match.offset }, canonical);
    return {
      id: crypto.randomUUID(),
      passId: pass.id,
      promptHash,
      anchor: {
        quote: match.quote,
        offset: match.offset,
        state: interval === null ? "orphaned" : "attached",
      },
      issue: match.issue,
      diagnosis: match.diagnosis,
      ...(match.pattern === undefined ? {} : { pattern: match.pattern }),
      status: "open",
      provenance: {
        // A rule Pass is not a Provider and has no model; `local`/`rule` says so
        // plainly rather than borrowing a Provider's identity.
        providerId: "local",
        model: "rule",
        at: context.at,
        revisionId: context.revisionId,
      },
    } satisfies Finding;
  });
}

/**
 * Every hedge or intensifier in the canonical string, in document order. Longer
 * terms are tried first so a phrase such as "of course" wins over any word in
 * it, and matching is case-insensitive with word boundaries so "just" does not
 * fire inside "justice".
 */
export function matchHedges(canonical: string, hedges: string[]): RuleMatch[] {
  const terms = hedges
    .map((hedge) => hedge.trim())
    .filter((hedge) => hedge.length > 0)
    .sort((a, b) => b.length - a.length);
  if (terms.length === 0) return [];

  const pattern = new RegExp(terms.map(toTermPattern).join("|"), "gi");
  const matches: RuleMatch[] = [];

  for (const match of canonical.matchAll(pattern)) {
    const start = match.index;
    if (start === undefined) continue;
    const quote = canonical.slice(start, start + match[0].length);
    const normalized = quote.replace(/\s+/g, " ");
    const term = terms.find((candidate) => candidate.toLowerCase() === normalized.toLowerCase());
    matches.push({
      quote,
      offset: start,
      issue: `Hedge or intensifier: "${normalized}"`,
      diagnosis:
        "Hedges and intensifiers drain the force from the sentence they sit in. " +
        "Cut it, or say what you actually mean.",
      ...(term === undefined ? {} : { pattern: term.toLowerCase() }),
    });
  }

  return matches;
}

function toTermPattern(term: string): string {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return `\\b${escaped}\\b`;
}
