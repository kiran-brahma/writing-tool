import { describeError } from "../errors";
import { isCancelledError } from "../wire/transport";
import { chunkTarget } from "./chunking";
import type { Pass } from "./pass";
import type { Target } from "./target";

/**
 * The all-or-nothing chunk policy every document-scope model Run shares.
 *
 * A Document past the character limit is split Section by Section with overlap
 * before it reaches the seam (story 50). Each chunk is run in order and the
 * first failure aborts the whole Run — naming the chunk and storing nothing — so
 * a half-examined Document cannot masquerade as a finished Run. A cancellation
 * is the Writer's decision and passes through untouched rather than being
 * wrapped in a misleading chunk message.
 *
 * `critique` and `auditDocument` both call it, so the two cannot drift in their
 * chunk boundaries, cancellation semantics or error shape. Both callers return
 * a single-element list for a Document that fit one call, so the un-chunked path
 * is the same code as the chunked one.
 */
export async function chunkedResults<T>(
  target: Target,
  limit: number,
  pass: Pass,
  label: string,
  runOnce: (chunk: Target) => Promise<T>,
): Promise<T[]> {
  const targets = chunkTarget(target, limit);
  const results: T[] = [];
  for (const [index, chunk] of targets.entries()) {
    try {
      results.push(await runOnce(chunk));
    } catch (error) {
      if (isCancelledError(error)) throw error;
      throw new Error(
        `Chunk ${index + 1} of ${targets.length} of the "${pass.name}" ${label} failed; ` +
          `nothing was stored. ${describeError(error)}`,
        { cause: error },
      );
    }
  }
  return results;
}
