import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // e2e/ is Playwright's, not Vitest's.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
