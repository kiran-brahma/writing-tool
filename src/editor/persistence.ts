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
  /**
   * Take a Revision now and cancel the pending idle one. The shell calls this
   * when the Writer leaves a Document, so its edits become a Revision of *that*
   * Document rather than firing against whichever Document is loaded when the
   * idle timer would have elapsed.
   */
  takeRevision(): Promise<void>;
  dispose(): void;
}

export const SAVE_DEBOUNCE_MS = 800;
export const REVISION_IDLE_MS = 60_000;
export const REVISION_CHANGE_LIMIT = 200;

export function createPersistence(options: PersistenceOptions): PersistenceController {
  const { save, takeRevision: takeRevisionAction, onError } = options;

  let saveHandle: ReturnType<typeof setTimeout> | null = null;
  let revisionHandle: ReturnType<typeof setTimeout> | null = null;
  let changesSinceRevision = 0;
  let disposed = false;
  /**
   * The save currently running, so `flush` can await it. Without this, a
   * flush that starts a second save resolves when the second finishes while
   * the first is still writing — and its continuations (rule runs, anchor
   * re-resolution, Reader-account clearing) can land after the caller believed
   * the Document was quiescent.
   */
  let inFlightSave: Promise<void> | null = null;

  async function run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      onError(error);
    }
  }

  /** One save at a time; a second caller joins the running one. */
  function startSave(): Promise<void> {
    if (inFlightSave !== null) return inFlightSave;
    const running = run(save).finally(() => {
      if (inFlightSave === running) inFlightSave = null;
    });
    inFlightSave = running;
    return running;
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
      void startSave();
    }, SAVE_DEBOUNCE_MS);

    clearIdleRevision();
    revisionHandle = setTimeout(() => {
      revisionHandle = null;
      changesSinceRevision = 0;
      void run(takeRevisionAction);
    }, REVISION_IDLE_MS);

    if (changesSinceRevision >= REVISION_CHANGE_LIMIT) {
      changesSinceRevision = 0;
      clearIdleRevision();
      void run(takeRevisionAction);
    }
  }

  async function flush(): Promise<void> {
    if (saveHandle !== null) {
      clearTimeout(saveHandle);
      saveHandle = null;
    }
    // Await a save already running before starting another: this resolves only
    // once the Writer's latest text has been persisted, not when an overlapping
    // second save finishes while the first is still writing.
    const previous = inFlightSave;
    if (previous !== null) await previous;
    await startSave();
  }

  async function takeRevision(): Promise<void> {
    clearIdleRevision();
    changesSinceRevision = 0;
    await run(takeRevisionAction);
  }

  function dispose(): void {
    disposed = true;
    if (saveHandle !== null) clearTimeout(saveHandle);
    clearIdleRevision();
    saveHandle = null;
  }

  return { markDirty, flush, takeRevision, dispose };
}
