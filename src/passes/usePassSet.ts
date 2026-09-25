import { useCallback, useState, type RefObject } from "react";
import type { Pass, RuleConfig } from "../core/pass";
import { passProblem, parsePassSet, serializePassSet } from "../core/passSet";
import { blankModelPass, STARTER_PASSES } from "../core/starterPasses";
import { describeError } from "../errors";
import type { ObelusDatabase } from "../storage/obelusDatabase";
import {
  loadOrCreatePasses,
  replacePasses as replacePassesRecord,
  restoreStarterPasses,
  savePass as savePassRecord,
  setPassEnabled as setStoredPassEnabled,
  updateRuleConfig,
} from "../storage/passes";

export interface PassSetOptions {
  databaseRef: RefObject<ObelusDatabase | null>;
  /** The loaded set, read synchronously by the rule engine and the Runs. */
  passesRef: RefObject<Pass[]>;
  /** Surfaces a write failure; never a silent failure. */
  onError: (message: string) => void;
  /** A rule Pass change re-derives its Findings on the current Document. */
  rerunRules: () => Promise<void>;
}

/**
 * Stories 34, 35, 98 and 102–103: the Pass set — the Starter pack as edited by
 * the Writer. Toggling or editing a rule Pass re-runs the rules; a model Pass
 * runs on demand, so its edit only changes what the next Run sends.
 */
export interface PassSetHandle {
  /** The Pass set: the Starter pack as edited by the Writer. */
  passes: Pass[];
  /** A Pass set save, import or restore failure, surfaced verbatim. */
  passSetError: string | null;
  clearPassSetError: () => void;
  togglePass: (passId: string, enabled: boolean) => Promise<void>;
  saveRuleConfig: (passId: string, ruleConfig: RuleConfig) => Promise<void>;
  /** Story 98: store a model Pass the Writer wrote or edited. */
  savePass: (pass: Pass) => Promise<boolean>;
  /** A blank model Pass, not yet stored. */
  newPassDraft: () => Pass;
  /** Story 102: the whole Pass set as JSON text, ready to download. */
  exportPassSet: () => string;
  /** Story 102: replace the Pass set from JSON text. */
  importPassSet: (json: string) => Promise<boolean>;
  /** Story 103: restore the Starter pack over the Writer's current set. */
  restoreStarterPack: () => Promise<void>;
  /** Reads the Pass set from storage, seeding any missing Starter Pass. */
  load: (database: ObelusDatabase) => Promise<void>;
}

export function usePassSet(options: PassSetOptions): PassSetHandle {
  const { databaseRef, passesRef, onError, rerunRules } = options;
  const [passes, setPasses] = useState<Pass[]>(STARTER_PASSES);
  const [passSetError, setPassSetError] = useState<string | null>(null);

  /** Replaces one Pass in the loaded set, or appends it when it is new. */
  const applyPass = useCallback(
    (updated: Pass) => {
      const exists = passesRef.current.some((pass) => pass.id === updated.id);
      const next = exists
        ? passesRef.current.map((pass) => (pass.id === updated.id ? updated : pass))
        : [...passesRef.current, updated];
      passesRef.current = next;
      setPasses(next);
    },
    [passesRef],
  );

  const togglePass = useCallback(
    async (passId: string, enabled: boolean) => {
      const database = databaseRef.current;
      if (database === null) return;
      try {
        const updated = await setStoredPassEnabled(database, passId, enabled);
        if (updated === null) return;
        applyPass(updated);
        // A rule Pass's Findings are re-derived on every save, so its toggle
        // re-runs the rule engine. A model Pass runs on demand, so its toggle
        // only changes whether Run is live; the queue is left alone.
        if (updated.kind === "rule") await rerunRules();
      } catch (error) {
        onError(describeError(error));
      }
    },
    [databaseRef, applyPass, onError, rerunRules],
  );

  const saveRuleConfig = useCallback(
    async (passId: string, ruleConfig: RuleConfig) => {
      const database = databaseRef.current;
      if (database === null) return;
      try {
        const updated = await updateRuleConfig(database, passId, ruleConfig);
        if (updated === null) return;
        applyPass(updated);
        await rerunRules();
      } catch (error) {
        onError(describeError(error));
      }
    },
    [databaseRef, applyPass, onError, rerunRules],
  );

  /**
   * Story 98: stores a model Pass the Writer wrote or edited. The same
   * `passProblem` the importer uses validates it, so a prompt with an unknown
   * placeholder (story 100) or an out-of-set scope or output shape (story 101)
   * is refused and the error is shown rather than saved.
   */
  const savePass = useCallback(
    async (pass: Pass): Promise<boolean> => {
      const database = databaseRef.current;
      if (database === null) return false;
      const problem = passProblem(pass);
      if (problem !== null) {
        setPassSetError(problem);
        return false;
      }
      try {
        await savePassRecord(database, pass);
        applyPass(pass);
        setPassSetError(null);
        // A rule Pass is re-derived on every save; a model Pass runs on demand,
        // so its edit only changes what the next Run sends.
        if (pass.kind === "rule") await rerunRules();
        return true;
      } catch (error) {
        setPassSetError(describeError(error));
        return false;
      }
    },
    [databaseRef, applyPass, rerunRules],
  );

  /** Story 98: a blank model Pass for the Workbench to edit, not yet stored. */
  const newPassDraft = useCallback((): Pass => blankModelPass(crypto.randomUUID()), []);

  /** Story 102: the Pass set as a file's text. */
  const exportPassSet = useCallback((): string => serializePassSet(passesRef.current), [passesRef]);

  /**
   * Story 102: replaces the Pass set from a file. The import is the set the
   * Writer chose, so it lands whole; `loadOrCreatePasses` then seeds any
   * Starter Pass the file omitted, which is the same reconciliation a reload
   * performs, so the session and the next open agree.
   */
  const importPassSet = useCallback(
    async (json: string): Promise<boolean> => {
      const database = databaseRef.current;
      if (database === null) return false;
      let imported: Pass[];
      try {
        imported = parsePassSet(json);
      } catch (error) {
        setPassSetError(describeError(error));
        return false;
      }
      try {
        await replacePassesRecord(database, imported);
        const reconciled = await loadOrCreatePasses(database);
        passesRef.current = reconciled;
        setPasses(reconciled);
        setPassSetError(null);
        await rerunRules();
        return true;
      } catch (error) {
        setPassSetError(describeError(error));
        return false;
      }
    },
    [databaseRef, passesRef, rerunRules],
  );

  /** Story 103: restores the Starter pack, custom Passes and all. */
  const restoreStarterPack = useCallback(async (): Promise<void> => {
    const database = databaseRef.current;
    if (database === null) return;
    try {
      await restoreStarterPasses(database);
      const restored = await loadOrCreatePasses(database);
      passesRef.current = restored;
      setPasses(restored);
      setPassSetError(null);
      await rerunRules();
    } catch (error) {
      setPassSetError(describeError(error));
    }
  }, [databaseRef, passesRef, rerunRules]);

  const clearPassSetError = useCallback(() => setPassSetError(null), []);

  const load = useCallback(
    async (database: ObelusDatabase) => {
      const loadedPasses = await loadOrCreatePasses(database);
      passesRef.current = loadedPasses;
      setPasses(loadedPasses);
    },
    [passesRef],
  );

  return {
    passes,
    passSetError,
    clearPassSetError,
    togglePass,
    saveRuleConfig,
    savePass,
    newPassDraft,
    exportPassSet,
    importPassSet,
    restoreStarterPack,
    load,
  };
}
