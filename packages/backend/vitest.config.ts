import { defineConfig } from "vitest/config";

// Convex function tests run against convex-test's in-memory backend. They use
// a `.spec.ts` suffix so the node:test runner and the Convex bundler (which
// skips multi-dot files) both leave them alone.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.spec.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
