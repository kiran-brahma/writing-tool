import {
  CONNECTION_PREFILLS,
  connectionFromPrefill,
  type Connection,
} from "../wire/connection";
import type { ObelusDatabase } from "./obelusDatabase";
import {
  clearSessionKey,
  getSessionKey,
  setSessionKey,
} from "./sessionKeys";

/**
 * The Connections repository. The five prefilled Connections seed the store on
 * first open; the Writer's keys, models, base URL for Custom, key mode and
 * concurrency persist. A session-mode key is never written to the store: the
 * record keeps an empty `apiKey` and the real value lives in `sessionKeys`.
 *
 * Connections are global rather than per-Document: a key is the Writer's, not a
 * property of one piece of writing.
 */
export async function loadOrCreateConnections(database: ObelusDatabase): Promise<Connection[]> {
  return database.transaction("rw", database.connections, async () => {
    const stored = await database.connections.toArray();
    const byId = new Map(stored.map((connection) => [connection.id, connection]));

    const missing = CONNECTION_PREFILLS.filter((prefill) => !byId.has(prefill.id)).map(
      connectionFromPrefill,
    );
    if (missing.length > 0) {
      await database.connections.bulkPut(missing);
      for (const connection of missing) byId.set(connection.id, connection);
    }

    return orderConnections(stored, byId).map(withEffectiveKey);
  });
}

/** Prefill order first, then any Custom Connection the Writer added, both stable. */
function orderConnections(
  stored: Connection[],
  byId: Map<string, Connection>,
): Connection[] {
  const ordered: Connection[] = [];
  for (const prefill of CONNECTION_PREFILLS) {
    const connection = byId.get(prefill.id);
    if (connection !== undefined) ordered.push(connection);
  }
  for (const connection of stored) {
    if (!CONNECTION_PREFILLS.some((prefill) => prefill.id === connection.id)) {
      ordered.push(connection);
    }
  }
  return ordered;
}

/** A session-only key is merged back in for use; it was never in the record. */
function withEffectiveKey(connection: Connection): Connection {
  if (connection.keyMode !== "session") return connection;
  return { ...connection, apiKey: getSessionKey(connection.id) ?? "" };
}

/** The record to store: a session-mode key is stripped before it can be written. */
function asRecord(connection: Connection): Connection {
  if (connection.keyMode !== "session") return connection;
  return { ...connection, apiKey: "" };
}

/**
 * Persists a Connection. In session mode the key is moved to memory and the
 * stored copy is blanked; in persisted mode the key is written and any stale
 * memory copy dropped, so a mode switch cannot leave the two disagreeing.
 */
export async function saveConnection(
  database: ObelusDatabase,
  connection: Connection,
): Promise<Connection> {
  return database.transaction("rw", database.connections, async () => {
    if (connection.keyMode === "session") setSessionKey(connection.id, connection.apiKey);
    else clearSessionKey(connection.id);
    await database.connections.put(asRecord(connection));
    return connection;
  });
}

/** Story 7: a Custom Connection can be removed; a prefilled one cannot. */
export async function removeConnection(
  database: ObelusDatabase,
  connectionId: string,
): Promise<boolean> {
  return database.transaction("rw", database.connections, database.settings, async () => {
    const existing = await database.connections.get(connectionId);
    if (existing === undefined || existing.builtIn) return false;
    await database.connections.delete(connectionId);
    clearSessionKey(connectionId);
    await clearSlotReferences(database, connectionId);
    return true;
  });
}

export type Slot = "critic" | "judge";

export interface SlotAssignment {
  critic: string | null;
  judge: string | null;
}

export const SLOTS_SETTING_KEY = "slots";

const EMPTY_SLOTS: SlotAssignment = { critic: null, judge: null };

/** Story 14: which Connection runs the Critic, and which the Judge. */
export async function loadSlots(database: ObelusDatabase): Promise<SlotAssignment> {
  const record = await database.settings.get(SLOTS_SETTING_KEY);
  if (record === undefined) return { ...EMPTY_SLOTS };
  return readSlots(record.value);
}

export async function assignSlot(
  database: ObelusDatabase,
  slot: Slot,
  connectionId: string | null,
): Promise<SlotAssignment> {
  return database.transaction("rw", database.settings, async () => {
    const current = await loadSlots(database);
    const next: SlotAssignment = { ...current, [slot]: connectionId };
    await database.settings.put({ key: SLOTS_SETTING_KEY, value: next });
    return next;
  });
}

/** Drops a removed Connection from either Slot so a Slot never dangles. */
async function clearSlotReferences(
  database: ObelusDatabase,
  connectionId: string,
): Promise<void> {
  const current = await loadSlots(database);
  if (current.critic !== connectionId && current.judge !== connectionId) return;
  const next: SlotAssignment = {
    critic: current.critic === connectionId ? null : current.critic,
    judge: current.judge === connectionId ? null : current.judge,
  };
  await database.settings.put({ key: SLOTS_SETTING_KEY, value: next });
}

function readSlots(value: unknown): SlotAssignment {
  if (typeof value !== "object" || value === null) return { ...EMPTY_SLOTS };
  const candidate = value as { critic?: unknown; judge?: unknown };
  return {
    critic: typeof candidate.critic === "string" ? candidate.critic : null,
    judge: typeof candidate.judge === "string" ? candidate.judge : null,
  };
}
