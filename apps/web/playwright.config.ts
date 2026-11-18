import { defineConfig, devices } from "@playwright/test";

/**
 * Drives the real browser against the real running stack: api, worker,
 * web, Redis, Mongo. Not started here (three separate processes, no
 * single webServer command covers it), see e2e/README.md for the
 * one-time setup. Consistent with how the rest of this repo's
 * integration tests assume Redis/Mongo are already running rather than
 * each test suite managing its own infra.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 20_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
