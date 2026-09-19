import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "inherit" });
  console.log("Installed git hooks: core.hooksPath = .githooks");
} catch (error) {
  // Not a git checkout (an npm tarball, a CI sandbox): there is no hooks path to
  // set, so this is ignored deliberately rather than being a failure.
  console.warn(
    "Skipped git hook installation:",
    error instanceof Error ? error.message : String(error),
  );
}
