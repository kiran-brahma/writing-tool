import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The module holds a page-load guard, so each case imports a fresh copy. The
 * browser capability is stubbed on `navigator` rather than injected, because
 * the spec forbids production code shaped by a test seam.
 */
type StorageStub = { persist?: () => Promise<boolean> };

function installStorage(storage: StorageStub | undefined): void {
  Object.defineProperty(globalThis.navigator, "storage", {
    value: storage,
    configurable: true,
  });
}

async function loadPersist(storage: StorageStub | undefined) {
  installStorage(storage);
  vi.resetModules();
  return import("./persist");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestPersistentStorage", () => {
  it("asks the browser to persist exactly once per page load", async () => {
    const persist = vi.fn(async () => true);
    const { requestPersistentStorage } = await loadPersist({ persist });

    await requestPersistentStorage();
    await requestPersistentStorage();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the browser exposes no persist", async () => {
    const { requestPersistentStorage } = await loadPersist({});

    await expect(requestPersistentStorage()).resolves.toBeUndefined();
  });

  it("does nothing when navigator.storage is absent", async () => {
    const { requestPersistentStorage } = await loadPersist(undefined);

    await expect(requestPersistentStorage()).resolves.toBeUndefined();
  });

  it("resolves rather than rejecting when the browser refuses", async () => {
    const persist = vi.fn(() => Promise.reject(new Error("not allowed")));
    const { requestPersistentStorage } = await loadPersist({ persist });

    await expect(requestPersistentStorage()).resolves.toBeUndefined();
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
