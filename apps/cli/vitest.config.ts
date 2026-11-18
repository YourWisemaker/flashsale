import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 15_000,
    // Stryker copies the suite into .stryker-tmp; never run that copy.
    exclude: [...configDefaults.exclude, ".stryker-tmp/**"],
    // Integration files share one Redis db and Mongo database with
    // destructive resets, so they must not interleave.
    fileParallelism: false,
  },
});
