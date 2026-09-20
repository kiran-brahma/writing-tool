import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestPersistentStorage", () => {
  it("asks the browser to persist exactly once per page load", async () => {
    const persist = vi.fn(async () => true);
    installStorage({ persist });
    const { requestPersistentStorage } = await import("./persist");

    requestPersistentStorage();
    requestPersistentStorage();
    await Promise.resolve();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the browser exposes no persist", async () => {
    installStorage({});
    const { requestPersistentStorage } = await import("./persist");

    expect(() => requestPersistentStorage()).not.toThrow();
  });

  it("does nothing when navigator.storage is absent", async () => {
    installStorage(undefined);
    const { requestPersistentStorage } = await import("./persist");

    expect(() => requestPersistentStorage()).not.toThrow();
  });

  it("does not surface a refusal as an unhandled rejection", async () => {
    const persist = vi.fn(() => Promise.reject(new Error("not allowed")));
    installStorage({ persist });
    const { requestPersistentStorage } = await import("./persist");

    requestPersistentStorage();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(persist).toHaveBeenCalledTimes(1);
  });
});
