import type { Provenance, Violation } from "./finding";

/**
 * The Audit account: the reasoning analysis a document-scope Audit pass returns.
 * It is its own output shape, stored apart from Findings and Reader accounts
 * because it judges the whole piece rather than quoting a span. Like the Reader
 * account, what the model authors is a closed shape with no field for rewritten
 * prose, so an audit cannot hand the Writer a sentence.
 *
 * The wire schema the model answers to lives beside this type (`AUDIT_SCHEMA`),
 * so the shape and the schema cannot drift apart.
 */

/**
 * One fallacy the audit named — or a fault it described in plain terms, when no
 * label fit. `name` is null in that case rather than forcing a taxonomy.
 */
interface AuditFallacy {
  name: string | null;
  /** The quoted span the fault lives in. */
  passage: string;
  why: string;
  /** The premise or step the argument leaves out. */
  missing: string;
}

/** The premises, sub-conclusions and conclusion the audit reconstructed. */
interface AuditArgumentMap {
  premises: string[];
  subConclusions: string[];
  conclusion: string;
}

/** The reasoning kind, its form, the soundness judgment and any enthymemes. */
interface AuditReasoning {
  kind: "deductive" | "inductive";
  form?: string;
  soundness: string;
  enthymemes: string[];
}

/** The intensional and extensional definitions the audit found, when it found any. */
interface AuditDefinitions {
  intensional: string | null;
  extensional: string | null;
}

/**
 * The fields the model authors for an Audit account. `type` is the audit's own
 * argument/observation call; every other field follows from it. The shape is
 * closed and carries no field for a rewritten sentence.
 */
interface AuditAccountContent {
  type: "argument" | "observation";
  corePayload: string;
  argumentMap?: AuditArgumentMap;
  reasoning?: AuditReasoning;
  fallacies: AuditFallacy[];
  definitions?: AuditDefinitions;
  priority: string[];
}

/**
 * An Audit account with what produced it. Stored as its own record kind, so an
 * account never masquerades as a Finding and a Finding never masquerades as an
 * account.
 */
export interface AuditAccount extends AuditAccountContent {
  provenance: Provenance;
  /** Praise or rewrite-shaped content the linter caught, struck through on display. */
  violations?: Violation[];
}
