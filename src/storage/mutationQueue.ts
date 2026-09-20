import type { ObelusDatabase } from "./obelusDatabase";

/**
 * Finding writes are read-modify-write, so they are serialised per database. A
 * save's rule Run reads a Pass's Findings, reconciles them and replaces the
 * set; a status write changes one Finding. Without one queue the Run's
 * replacement can commit after the status write and reset an addressed or
 * declined Finding to open, so the objection the Writer dismissed returns on
 * the next Run. Serialising both through here is what keeps stories 63 and 65
 * true under a save that overlaps a keypress.
 */
const queues = new WeakMap<ObelusDatabase, Promise<void>>();

export function enqueueMutation<T>(
  database: ObelusDatabase,
  task: () => Promise<T>,
): Promise<T> {
  const previous = queues.get(database) ?? Promise.resolve();
  const queued = previous.then(task);
  // Keep later mutations ordered even if this one fails; the failure still
  // reaches this call's caller.
  queues.set(
    database,
    queued.then(
      () => undefined,
      () => undefined,
    ),
  );
  return queued;
}
