import { describe, expect, it, vi } from "vitest";
import { createPersistRequest } from "./persist";

describe("createPersistRequest", () => {
  it("asks the browser to persist exactly once, however many saves follow", async () => {
    const persist = vi.fn(async () => true);
    const request = createPersistRequest({ persist });

    await expect(request.request()).resolves.toBe(true);
    await expect(request.request()).resolves.toBe(true);

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent calls into one request", async () => {
    let release: (granted: boolean) => void = () => {};
    const persist = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );
    const request = createPersistRequest({ persist });

    const first = request.request();
    const second = request.request();
    release(true);

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("returns null when the browser exposes no persist", async () => {
    const request = createPersistRequest({});

    await expect(request.request()).resolves.toBeNull();
  });

  it("returns null instead of rejecting when the request fails", async () => {
    const persist = vi.fn(async () => {
      throw new Error("storage persistence is not allowed");
    });
    const request = createPersistRequest({ persist });

    await expect(request.request()).resolves.toBeNull();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("returns null when navigator.storage is absent entirely", async () => {
    const request = createPersistRequest(undefined);

    await expect(request.request()).resolves.toBeNull();
  });
});
