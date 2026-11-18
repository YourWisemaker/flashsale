import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 10_000,
    // Stryker copies the suite into .stryker-tmp; never run that copy.
    exclude: [...configDefaults.exclude, ".stryker-tmp/**"],
  },
});
