import { describe, expect, it } from "vitest";

interface ProbeRecord {
  value: number;
}

function openProbeDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("obelus-probe", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("probe");
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("indexedDB.open failed"));
    };
  });
}

function awaitRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed"));
    };
  });
}

describe("in-memory IndexedDB test setup", () => {
  it("exercises storage without a production interface introduced for testing", async () => {
    const database = await openProbeDatabase();

    try {
      const write = database.transaction("probe", "readwrite");
      write.objectStore("probe").put({ value: 42 }, "answer");
      await new Promise<void>((resolve, reject) => {
        write.oncomplete = () => {
          resolve();
        };
        write.onerror = () => {
          reject(write.error ?? new Error("write transaction failed"));
        };
      });

      const read = database.transaction("probe", "readonly");
      const record = await awaitRequest<ProbeRecord>(read.objectStore("probe").get("answer"));

      expect(record).toEqual({ value: 42 });
    } finally {
      database.close();
    }
  });
});
