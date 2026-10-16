import { defineConfig } from "vitest/config";

// The conformance harness runs in Node against the pure engine/lib code — no
// DOM, no Vite plugins needed. Kept separate from vite.config.ts so the app's
// plugins don't load during tests.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
