import { useCallback, useMemo, useState, type RefObject } from "react";
import { sameModelWarning as sameModelWarningFor } from "../core/judge";
import { describeError } from "../errors";
import {
  assignSlot as assignSlotRecord,
  defaultJudgeConnection,
  loadOrCreateConnections,
  loadSlots,
  removeConnection as removeConnectionRecord,
  saveConnection as saveConnectionRecord,
  slotConnection,
  type Slot,
  type SlotAssignment,
  type SlotBinding,
} from "../storage/connections";
import type { ObelusDatabase } from "../storage/obelusDatabase";
import { createCustomConnection, type Connection } from "../wire/connection";

export interface ConnectionsOptions {
  databaseRef: RefObject<ObelusDatabase | null>;
  /** Surfaces a write failure; never a silent failure. */
  onError: (message: string) => void;
}

/**
 * Stories 2–15 and 90: the Writer's Connections, the Critic and Judge Slots,
 * and the derived default Judge pairing. The Critic and Judge Connections are
 * derived from the list and the assignments, so every consumer sees the same
 * resolution the Runs do.
 */
export interface ConnectionsHandle {
  connections: Connection[];
  slots: SlotAssignment;
  /** The Connection in the critic Slot, with its model, or null. */
  criticConnection: Connection | null;
  /** The judge Slot's Connection, or the story-90 default, or null. */
  judgeConnection: Connection | null;
  /** True when no judge Connection is assigned and the default is in use. */
  judgeIsDefault: boolean;
  /** Stories 15, 90: a soft warning when the Critic and Judge share a model. */
  sameModelWarning: string | null;
  saveConnection: (connection: Connection) => Promise<void>;
  addCustomConnection: () => Promise<void>;
  removeConnection: (connectionId: string) => Promise<void>;
  assignSlot: (slot: Slot, binding: SlotBinding | null) => Promise<void>;
  /** Reads the Connections and Slots from storage. */
  load: (database: ObelusDatabase) => Promise<void>;
}

export function useConnections(options: ConnectionsOptions): ConnectionsHandle {
  const { databaseRef, onError } = options;
  const [connections, setConnections] = useState<Connection[]>([]);
  const [slots, setSlots] = useState<SlotAssignment>({ critic: null, judge: null });

  /** The Connection the critic Slot resolves to, with its model, or null. */
  const criticConnection = useMemo(
    () => slotConnection(connections, slots.critic),
    [connections, slots],
  );

  /**
   * The judge Slot's Connection, with its model override, or the story-90
   * default: a different Connection from the Critic, so the Judge is
   * independent by default. A Slot may share the Critic's Connection while
   * naming a different model.
   */
  const judgeConnection = useMemo(() => {
    if (slots.judge !== null) return slotConnection(connections, slots.judge);
    return defaultJudgeConnection(connections, criticConnection);
  }, [connections, slots, criticConnection]);

  /** True when the Judge Connection above is the default rather than an assignment. */
  const judgeIsDefault = slots.judge === null && judgeConnection !== null;

  const sameModelWarning = useMemo(
    () => sameModelWarningFor(criticConnection, judgeConnection),
    [criticConnection, judgeConnection],
  );

  const saveConnection = useCallback(
    async (connection: Connection) => {
      const database = databaseRef.current;
      if (database === null) return;
      try {
        await saveConnectionRecord(database, connection);
        setConnections((current) => replaceConnection(current, connection));
      } catch (error) {
        onError(describeError(error));
      }
    },
    [databaseRef, onError],
  );

  const addCustomConnection = useCallback(async () => {
    const database = databaseRef.current;
    if (database === null) return;
    const connection = createCustomConnection(crypto.randomUUID());
    try {
      await saveConnectionRecord(database, connection);
      setConnections((current) => [...current, connection]);
    } catch (error) {
      onError(describeError(error));
    }
  }, [databaseRef, onError]);

  const removeConnection = useCallback(
    async (connectionId: string) => {
      const database = databaseRef.current;
      if (database === null) return;
      try {
        const removed = await removeConnectionRecord(database, connectionId);
        if (!removed) return;
        setConnections((current) => current.filter((connection) => connection.id !== connectionId));
        setSlots(await loadSlots(database));
      } catch (error) {
        onError(describeError(error));
      }
    },
    [databaseRef, onError],
  );

  const assignSlot = useCallback(
    async (slot: Slot, binding: SlotBinding | null) => {
      const database = databaseRef.current;
      if (database === null) return;
      try {
        setSlots(await assignSlotRecord(database, slot, binding));
      } catch (error) {
        onError(describeError(error));
      }
    },
    [databaseRef, onError],
  );

  const load = useCallback(async (database: ObelusDatabase) => {
    setConnections(await loadOrCreateConnections(database));
    setSlots(await loadSlots(database));
  }, []);

  return {
    connections,
    slots,
    criticConnection,
    judgeConnection,
    judgeIsDefault,
    sameModelWarning,
    saveConnection,
    addCustomConnection,
    removeConnection,
    assignSlot,
    load,
  };
}

/** Replace one Connection in the list, or append it if it is new. */
function replaceConnection(current: Connection[], connection: Connection): Connection[] {
  const exists = current.some((entry) => entry.id === connection.id);
  return exists
    ? current.map((entry) => (entry.id === connection.id ? connection : entry))
    : [...current, connection];
}
