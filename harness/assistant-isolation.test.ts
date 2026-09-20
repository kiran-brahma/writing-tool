import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 105's structural half. The assistant's type signature already makes the
 * Writer's prose unavailable to it, and a behaviour test asserts what actually
 * leaves through the seam. Neither catches a later change that quietly wires a
 * Document-carrying module into the assistant, because the callers might still
 * happen to pass prompt text. So this pins the assistant module's imports to a
 * known allowlist: a new import — prose or otherwise — fails here until someone
 * decides it deliberately.
 *
 * The check lives under `harness/` because it reads source with Node, which the
 * app's own TypeScript project does not type.
 */
const ALLOWED_IMPORTS = new Set([
  "./modelCall",
  "./prompt",
  "./starterPasses",
  "../wire/connection",
  "../wire/modelRequest",
  "../wire/transport",
]);

/** Every module specifier the source imports, type-only imports included. */
function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
}

describe("prompt assistant isolation", () => {
  it("imports only the modules that carry no Document prose", () => {
    const source = readFileSync(join(process.cwd(), "src/core/promptAssistant.ts"), "utf8");

    for (const specifier of importSpecifiers(source)) {
      expect(ALLOWED_IMPORTS.has(specifier), `promptAssistant.ts now imports ${specifier}`).toBe(
        true,
      );
    }
  });
});
