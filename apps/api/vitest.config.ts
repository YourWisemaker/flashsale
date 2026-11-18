import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 15_000,
    // Stryker copies the suite into .stryker-tmp; never run that copy.
    exclude: [...configDefaults.exclude, ".stryker-tmp/**"],
    // Integration test files share one Redis db / Mongo database and
    // each uses a destructive beforeEach reset (see test-helpers.ts).
    // Only one integration file today, but this stays off so adding a
    // second one later doesn't silently reintroduce a cross-file race.
    fileParallelism: false,
  },
});
