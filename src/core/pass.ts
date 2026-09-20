/**
 * Passes are data, not code: records the Writer can edit, export and import,
 * shipped with a read-only Starter pack. This module holds the shape and the
 * `promptHash` derivation; the rule matching lives in `rulePass.ts`.
 */

export type PassKind = "rule" | "model";
export type PassScope = "document" | "section" | "paragraph";
export type OutputShape = "findings" | "section-summary" | "note";
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
  "note",
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
export const READER_OUTPUT: OutputShape = "section-summary";

export interface RuleConfig {
  hedges?: string[];
  wordiness?: [string, string][];
  repetitionWindow?: number;
  openers?: string[];
  nominalizationSuffixes?: string[];
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

/** FNV-1a, 32-bit, hex. Deterministic and dependency-free, which is what a
 * pure Core hash has to be — `crypto.subtle` is async and DOM-adjacent. */
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Story 37: the structural set — the enabled model Passes whose scope is the
 * whole document. The rule lives here rather than in the shell so the
 * "Run structural set" button and the action it triggers cannot disagree about
 * what the set contains, and so the rule is testable without a DOM.
 */
export function structuralPasses(passes: Pass[]): Pass[] {
  return passes.filter(
    (pass) => pass.kind === "model" && pass.scope === "document" && pass.enabled,
  );
}

/** True for a Pass whose output is a Reader account rather than Findings. */
export function isReaderPass(pass: Pass): boolean {
  return pass.output === READER_OUTPUT;
}

/** True for a Pass whose output is Findings, the queue's own shape. */
export function isFindingsPass(pass: Pass): boolean {
  return pass.output === "findings";
}
