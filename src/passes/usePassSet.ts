import { useCallback, useState, type RefObject } from "react";
import type { Pass, RuleConfig } from "../core/pass";
import { STARTER_PASSES } from "../core/starterPasses";
import { describeError } from "../errors";
import type { ObelusDatabase } from "../storage/obelusDatabase";
import {
  loadOrCreatePasses,
  restoreStarterPasses,
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
 * The Pass set: the Starter pack plus the Writer's rule-word edits. The model
 * prompts are fixed in the repository, so there is no pass editor, import,
 * export or per-pass toggle here.
 */
export interface PassSetHandle {
  passes: Pass[];
  passSetError: string | null;
  clearPassSetError: () => void;
  saveRuleConfig: (passId: string, ruleConfig: RuleConfig) => Promise<void>;
  restoreStarterPack: () => Promise<void>;
  load: (database: ObelusDatabase) => Promise<void>;
}

export function usePassSet(options: PassSetOptions): PassSetHandle {
  const { databaseRef, passesRef, onError, rerunRules } = options;
  const [passes, setPasses] = useState<Pass[]>(STARTER_PASSES);
  const [passSetError, setPassSetError] = useState<string | null>(null);

  const applyPass = useCallback(
    (updated: Pass) => {
      const next = passesRef.current.map((pass) => (pass.id === updated.id ? updated : pass));
      passesRef.current = next;
      setPasses(next);
    },
    [passesRef],
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
    saveRuleConfig,
    restoreStarterPack,
    load,
  };
}
