import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20_000,
    // Stryker copies the suite into .stryker-tmp; never run that copy.
    exclude: [...configDefaults.exclude, ".stryker-tmp/**"],
    // The integration tests here share one Redis db and one Mongo
    // database (see test-helpers.ts) and each file's beforeEach does a
    // destructive reset. Running files in parallel lets one file's
    // reset wipe data another file just wrote. Only two fast files,
    // so running them sequentially costs nothing noticeable.
    fileParallelism: false,
  },
});
