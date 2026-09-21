import { isOutputShape, type Pass, type RuleConfig } from "../core/pass";
import { STARTER_PASSES } from "../core/starterPasses";
import { enqueueMutation } from "./mutationQueue";
import type { ObelusDatabase } from "./obelusDatabase";

/**
 * Raised when a stored Pass has an output shape this build cannot run. Obelus
 * refuses the read rather than running a Pass whose output it cannot show or
 * quietly dropping it: an output shape the Writer can select and cannot run is a
 * broken promise (story 158). The message names the Pass so the Writer can
 * remove it or restore the Starter pack.
 */
export class UnrunnablePassError extends Error {
  constructor(passId: string, output: unknown) {
    super(
      `The stored Pass "${passId}" has an output shape this build cannot run ` +
        `(${JSON.stringify(output)}). Obelus will not run it or quietly drop it. ` +
        `Restore the Starter pack, or remove that Pass, and open Obelus again.`,
    );
    this.name = "UnrunnablePassError";
  }
}

/** The first stored Pass whose output shape this build cannot run, or null. */
function firstUnrunnablePass(passes: Pass[]): Pass | null {
  return passes.find((pass) => !isOutputShape(pass.output)) ?? null;
}

/**
 * The Passes repository. Passes are data: the Starter pack seeds the store on
 * first open and the Writer's edits — an enabled flag, the word lists and
 * patterns behind a rule Pass — persist. Loading seeds only the Starter passes
 * whose id is missing, so a later Obelus that adds a rule Pass introduces it
 * without overwriting anything the Writer has changed.
 *
 * Passes are global rather than per-Document: a rule Pass is the Writer's taste
 * about prose, not a property of one piece of writing.
 */
export async function loadOrCreatePasses(database: ObelusDatabase): Promise<Pass[]> {
  return database.transaction("rw", database.passes, async () => {
    const stored = await database.passes.toArray();
    // A stored Pass whose output shape this build cannot run is refused before
    // anything is seeded or returned, rather than coerced to a runnable shape
    // or silently dropped from the set (story 158).
    const unrunnable = firstUnrunnablePass(stored);
    if (unrunnable !== null) throw new UnrunnablePassError(unrunnable.id, unrunnable.output);
    const byId = new Map(stored.map((pass) => [pass.id, pass]));

    const missing = STARTER_PASSES.filter((starter) => !byId.has(starter.id));
    if (missing.length > 0) {
      await database.passes.bulkPut(missing);
      for (const pass of missing) byId.set(pass.id, pass);
    }

    return orderPasses(stored, byId);
  });
}

/** Starter order first, then any Pass the Writer added, both stable. */
function orderPasses(stored: Pass[], byId: Map<string, Pass>): Pass[] {
  const ordered: Pass[] = [];
  for (const starter of STARTER_PASSES) {
    const pass = byId.get(starter.id);
    if (pass !== undefined) ordered.push(pass);
  }
  for (const pass of stored) {
    if (!STARTER_PASSES.some((starter) => starter.id === pass.id)) ordered.push(pass);
  }
  return ordered;
}

/**
 * Applies an edit to a stored Pass and returns the result, or `null` when no
 * Pass has that id. The whole record is rewritten as one unit, so a partial
 * update cannot leave a Pass half-edited.
 */
function updatePass(
  database: ObelusDatabase,
  passId: string,
  update: (pass: Pass) => Pass,
): Promise<Pass | null> {
  return database.transaction("rw", database.passes, async () => {
    const existing = await database.passes.get(passId);
    if (existing === undefined) return null;
    const updated = update(existing);
    await database.passes.put(updated);
    return updated;
  });
}

/** Story 35: enable or disable one rule Pass, leaving every other Pass alone. */
export function setPassEnabled(
  database: ObelusDatabase,
  passId: string,
  enabled: boolean,
): Promise<Pass | null> {
  return updatePass(database, passId, (pass) => ({ ...pass, enabled }));
}

/** Story 34: replace a rule Pass's word lists and patterns. */
export function updateRuleConfig(
  database: ObelusDatabase,
  passId: string,
  ruleConfig: RuleConfig,
): Promise<Pass | null> {
  return updatePass(database, passId, (pass) => ({ ...pass, ruleConfig }));
}

/**
 * Story 98: stores a Pass the Writer wrote or edited. The whole record is
 * written as one unit, so a prompt and the scope and output shape that go with
 * it cannot be saved half-changed.
 */
export async function savePass(database: ObelusDatabase, pass: Pass): Promise<Pass> {
  await database.passes.put(pass);
  return pass;
}

/**
 * Stories 102 and 103: replaces the whole Pass set in one transaction. The two
 * actions that need it — importing a pass set and restoring the Starter pack —
 * share this write, so a failure leaves the previous set in place rather than
 * half of each.
 */
export function replacePasses(database: ObelusDatabase, passes: Pass[]): Promise<void> {
  // Queued with Runs, so a replacement cannot interleave with a Run writing its
  // Findings, and a cache read cannot see a set midway through changing.
  return enqueueMutation(database, () =>
    database.transaction("rw", database.passes, async () => {
      await database.passes.clear();
      await database.passes.bulkPut(passes);
    }),
  );
}

/** Story 103: the Starter pack, restored over whatever the Writer has now. */
export function restoreStarterPasses(database: ObelusDatabase): Promise<void> {
  // Copies, so a later edit of a restored Pass cannot mutate the shared pack
  // constant this module ships with.
  return replacePasses(
    database,
    STARTER_PASSES.map((pass) => ({ ...pass })),
  );
}
