/**
 * The Document is persisted on a short debounce, and a Revision is taken on a
 * slower one. A Revision is also taken after enough saved changes, so a writer
 * who never pauses for the idle window still accrues history.
 *
 * This is separate from the editor so the timing rules can be tested without a
 * DOM, and so `flush()` can be called from `visibilitychange` and `pagehide` to
 * make a closed tab lose no Paragraph.
 */

export interface PersistenceOptions {
  /** Persist the Document of record now. */
  save: () => Promise<void>;
  /** Take an auto-Revision now. */
  takeRevision: () => Promise<void>;
  /** Called when a save or revision fails; failures are never swallowed. */
  onError: (error: unknown) => void;
}

export interface PersistenceController {
  /** A keystroke happened: schedule a save and reset the idle revision clock. */
  markDirty(): void;
  /** Persist immediately. Safe to call from `pagehide`. */
  flush(): Promise<void>;
  dispose(): void;
}

export const SAVE_DEBOUNCE_MS = 800;
export const REVISION_IDLE_MS = 60_000;
export const REVISION_CHANGE_LIMIT = 200;

export function createPersistence(options: PersistenceOptions): PersistenceController {
  const { save, takeRevision, onError } = options;

  let saveHandle: ReturnType<typeof setTimeout> | null = null;
  let revisionHandle: ReturnType<typeof setTimeout> | null = null;
  let changesSinceRevision = 0;
  let disposed = false;

  async function run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      onError(error);
    }
  }

  function clearIdleRevision(): void {
    if (revisionHandle !== null) clearTimeout(revisionHandle);
    revisionHandle = null;
  }

  function markDirty(): void {
    if (disposed) return;

    changesSinceRevision += 1;

    if (saveHandle !== null) clearTimeout(saveHandle);
    saveHandle = setTimeout(() => {
      saveHandle = null;
      void run(save);
    }, SAVE_DEBOUNCE_MS);

    clearIdleRevision();
    revisionHandle = setTimeout(() => {
      revisionHandle = null;
      changesSinceRevision = 0;
      void run(takeRevision);
    }, REVISION_IDLE_MS);

    if (changesSinceRevision >= REVISION_CHANGE_LIMIT) {
      changesSinceRevision = 0;
      clearIdleRevision();
      void run(takeRevision);
    }
  }

  async function flush(): Promise<void> {
    if (saveHandle !== null) {
      clearTimeout(saveHandle);
      saveHandle = null;
    }
    await run(save);
  }

  function dispose(): void {
    disposed = true;
    if (saveHandle !== null) clearTimeout(saveHandle);
    clearIdleRevision();
    saveHandle = null;
  }

  return { markDirty, flush, dispose };
}
