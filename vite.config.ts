import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // No DOM test layer. Storage code runs against the in-memory IndexedDB
    // installed in the setup file below.
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.test.{ts,tsx}",
      "worker/**/*.test.ts",
      "scripts/**/*.test.mjs",
      "harness/**/*.test.ts",
    ],
  },
});
