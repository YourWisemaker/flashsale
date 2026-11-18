/**
 * Mutation testing, see packages/core/stryker.config.mjs for the why.
 * Runs unit and integration tests together: most of this app's logic
 * only means something against real Redis/Mongo, so concurrency is 1.
 * Entry points and ops scripts are wiring with no logic to mutate.
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  mutate: ["src/**/*.ts", "!src/**/__tests__/**", "!src/server.ts", "!src/scripts/**"],
  concurrency: 1,
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  thresholds: { high: 90, low: 80, break: 75 },
  tempDirName: ".stryker-tmp",
};
