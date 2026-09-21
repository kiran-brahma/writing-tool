import { fnv1a } from "./hash";

/**
 * Passes are data, not code: records the Writer can edit, export and import,
 * shipped with a read-only Starter pack. This module holds the shape and the
 * `promptHash` derivation; the rule matching lives in `rulePass.ts`.
 */

export type PassKind = "rule" | "model";
export type PassScope = "document" | "section" | "paragraph";
/**
 * The shapes a Pass may return. The dead `note` shape was removed in v1.1: a
 * shape the Writer can select in the Workbench and nothing can run is a broken
 * promise (story 158). `audit` is the Audit pass's own shape, beside Findings
 * and the Reader's section summary.
 */
export type OutputShape = "findings" | "section-summary" | "audit";
export type Slot = "critic";

/**
 * Story 101: the fixed set a Pass's scope is chosen from. It is exported as
 * data so the Workbench's picker, the importer's validator and the type cannot
 * disagree about what a legal scope is.
 */
export const PASS_SCOPES: readonly PassScope[] = ["document", "section", "paragraph"];

/**
 * Story 101: the fixed set a Pass's output shape is chosen from. A
 * user-editable JSON Schema is explicitly not supported.
 */
export const OUTPUT_SHAPES: readonly OutputShape[] = [
  "findings",
  "section-summary",
  "audit",
];

export function isPassScope(value: unknown): value is PassScope {
  return typeof value === "string" && (PASS_SCOPES as readonly string[]).includes(value);
}

export function isOutputShape(value: unknown): value is OutputShape {
  return typeof value === "string" && (OUTPUT_SHAPES as readonly string[]).includes(value);
}

/**
 * The output shape of the Reader pass. One name for it, so the UI, the storage
 * runner, the Core entry point and the harness cannot disagree about which
 * shape is a Reader account.
 */
const READER_OUTPUT: OutputShape = "section-summary";

export interface RuleConfig {
  hedges?: string[];
  wordiness?: [string, string][];
  repetitionWindow?: number;
  openers?: string[];
  nominalizationSuffixes?: string[];
  /**
   * Words and short phrases a house style bans outright; the Prose Linter's
   * "always empty" list and the Economist guide's jargon. Reported, never
   * replaced: a rule may mark but not write (ADR-0003).
   */
  bannedWords?: string[];
  /** Clichés, jargon metaphors and worn figures of speech. Reported, not rewritten. */
  wornPhrases?: string[];
  /** Orwell rule 1: figures of speech you are used to seeing in print. */
  printedFigures?: string[];
  /** Orwell rule 2: long words to flag where a short one will do. */
  longWords?: string[];
  /** Orwell rule 3: words or phrases that can be cut without loss. */
  cuttableWords?: string[];
  /** Orwell rule 4: the auxiliaries a passive construction is built on. */
  passiveAuxiliaries?: string[];
  /** Orwell rule 5: foreign, scientific or jargon words with an everyday equivalent. */
  jargonWords?: string[];
}

export interface Pass {
  id: string;
  name: string;
  description: string;
  kind: PassKind;
  scope: PassScope;
  output: OutputShape;
  /** Model Passes only. */
  prompt?: string;
  slot: Slot;
  enabled: boolean;
  ruleConfig?: RuleConfig;
  /**
   * Rule Passes only. An exclusive Pass runs on its own: while it is enabled,
   * the enabled rule Passes beside it are held rather than run, so its report is
   * not buried among the findings of the Passes it overlaps. The held Passes
   * keep their own enabled flags and return the moment it is turned off.
   */
  exclusive?: boolean;
}

/**
 * `promptHash` replaces a hand-bumped version integer. It is derived from what
 * actually shapes a Run's output — the prompt, the scope, the output shape and
 * the Rule config — and recorded on every Finding, so a cache hit can never
 * return findings the current Pass would not have produced.
 */
export function hashPass(pass: Pass): string {
  return fnv1a(
    JSON.stringify({
      scope: pass.scope,
      output: pass.output,
      prompt: pass.prompt ?? null,
      ruleConfig: pass.ruleConfig ?? null,
    }),
  );
}

/**
 * Story 37: the structural set — the enabled model Passes whose scope is the
 * whole document **and whose output is Findings**. The rule lives here rather
 * than in the shell so the "Run structural set" button and the action it
 * triggers cannot disagree about what the set contains, and so the rule is
 * testable without a DOM. A document-scope Pass of another output shape — an
 * Audit pass (#27) — belongs to its own surface, not this set: running it here
 * would offer a Run whose output this path cannot show.
 */
export function structuralPasses(passes: Pass[]): Pass[] {
  return passes.filter(
    (pass) =>
      pass.kind === "model" &&
      pass.scope === "document" &&
      pass.enabled &&
      isFindingsPass(pass),
  );
}

/**
 * The rule Passes a Run should execute. Ordinarily every enabled rule Pass runs.
 * An enabled exclusive Pass runs alone, so a whole-lens Pass — George Orwell's
 * rules — reports its own five rules instead of being buried under the Passes it
 * overlaps. The Passes left out keep their enabled flags and run again as soon
 * as the exclusive Pass is turned off.
 */
export function rulePassesToRun(passes: Pass[]): Pass[] {
  const enabled = passes.filter((pass) => pass.kind === "rule" && pass.enabled);
  const exclusive = enabled.filter((pass) => pass.exclusive === true);
  return exclusive.length > 0 ? exclusive : enabled;
}

/** True for a Pass whose output is a Reader account rather than Findings. */
export function isReaderPass(pass: Pass): boolean {
  return pass.output === READER_OUTPUT;
}

/** True for a Pass whose output is Findings, the queue's own shape. */
export function isFindingsPass(pass: Pass): boolean {
  return pass.output === "findings";
}
