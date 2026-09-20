import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The harness never ships to the UI. It is a manual verification tool, not an
 * affordance, so no app source may import it — the client under `src/` or the
 * Worker under `worker/`. This reads source rather than driving a browser,
 * because no behaviour test can prove a module is absent from the bundle.
 */
describe("constitution harness shipping", () => {
  it("is imported by no app source file", () => {
    const appFiles = [
      ...sourceFiles(join(process.cwd(), "src")),
      ...sourceFiles(join(process.cwd(), "worker")),
    ];
    const importers = appFiles.filter((file) =>
      /["'][^"']*\/harness/.test(readFileSync(file, "utf8")),
    );

    expect(appFiles.length).toBeGreaterThan(0);
    expect(importers).toEqual([]);
  });
});

/** Every `.ts`/`.tsx` file under `dir`, the app's full source surface. */
function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (entry.isFile() && (path.endsWith(".ts") || path.endsWith(".tsx"))) {
      files.push(path);
    }
  }
  return files;
}
