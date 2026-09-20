import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPersistence, REVISION_CHANGE_LIMIT } from "./persistence";

describe("createPersistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists the Document after the short debounce and resets it on each keystroke", async () => {
    const save = vi.fn(async () => {});
    const controller = createPersistence({ save, takeRevision: async () => {}, onError: () => {} });

    controller.markDirty();
    await vi.advanceTimersByTimeAsync(400);
    controller.markDirty();
    await vi.advanceTimersByTimeAsync(400);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("takes an auto-Revision only after the slower idle debounce", async () => {
    const takeRevision = vi.fn(async () => {});
    const controller = createPersistence({ save: async () => {}, takeRevision, onError: () => {} });

    controller.markDirty();
    await vi.advanceTimersByTimeAsync(5_000);
    controller.markDirty();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(takeRevision).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(40_000);
    expect(takeRevision).toHaveBeenCalledTimes(1);
  });

  it("takes a Revision after enough saved changes, without waiting for idle", () => {
    const takeRevision = vi.fn(async () => {});
    const controller = createPersistence({ save: async () => {}, takeRevision, onError: () => {} });

    for (let change = 0; change < REVISION_CHANGE_LIMIT - 1; change++) controller.markDirty();
    expect(takeRevision).not.toHaveBeenCalled();

    controller.markDirty();
    expect(takeRevision).toHaveBeenCalledTimes(1);
  });

  it("flushes immediately, so a closed tab loses no Paragraph", async () => {
    const save = vi.fn(async () => {});
    const controller = createPersistence({ save, takeRevision: async () => {}, onError: () => {} });

    controller.markDirty();
    await controller.flush();

    expect(save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("reports a failed save instead of swallowing it", async () => {
    const failure = new Error("quota exceeded");
    const onError = vi.fn();
    const controller = createPersistence({
      save: async () => {
        throw failure;
      },
      takeRevision: async () => {},
      onError,
    });

    controller.markDirty();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("stops scheduling once disposed", async () => {
    const save = vi.fn(async () => {});
    const controller = createPersistence({ save, takeRevision: async () => {}, onError: () => {} });

    controller.dispose();
    controller.markDirty();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(save).not.toHaveBeenCalled();
  });

  it("takes a Revision now and cancels the pending idle one", async () => {
    const takeRevision = vi.fn(async () => {});
    const controller = createPersistence({
      save: async () => {},
      takeRevision,
      onError: () => {},
    });

    controller.markDirty();
    await controller.takeRevision();
    expect(takeRevision).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(takeRevision).toHaveBeenCalledTimes(1);
  });
});
