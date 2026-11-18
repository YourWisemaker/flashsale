/**
 * Mutation testing: Stryker changes the source one small edit at a time
 * (flip a comparison, drop a branch, blank a string) and re-runs the
 * tests. A surviving mutant is a change no test noticed.
 *
 * concurrency 1: the tests run against real Redis/Mongo databases, so
 * parallel test runners would trample each other's data.
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  testRunner: "vitest",
  // pnpm's strict node_modules hides the runner from Stryker's default
  // "@stryker-mutator/*" glob, so name it explicitly.
  plugins: ["@stryker-mutator/vitest-runner"],
  mutate: ["src/**/*.ts", "!src/**/__tests__/**"],
  concurrency: 1,
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  thresholds: { high: 90, low: 80, break: 75 },
  tempDirName: ".stryker-tmp",
};
