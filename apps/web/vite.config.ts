import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/**
 * Anti-clickjacking: nobody may put this page in a frame (that's how a
 * "Buy Now" click gets hijacked). Both headers, because old browsers only
 * know X-Frame-Options. frame-ancestors can't be set from a <meta> tag, so
 * whatever serves the built files in production must send these too.
 */
const securityHeaders = {
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

// The built app has no inline scripts, so production gets a full policy.
// Dev keeps only frame-ancestors: Vite's hot reload injects inline scripts.
const productionCsp =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

export default defineConfig(({ mode }) => {
  // Root .env holds VITE_SITE_URL (used in index.html for canonical/og URLs).
  const env = loadEnv(mode, "../..", "");
  const apiUrl = env.VITE_API_URL ?? "http://localhost:3000";
  const proxy = { "/api": apiUrl, "/health": apiUrl };

  return {
    plugins: [react()],
    envDir: "../..",
    server: { port: 5173, proxy, headers: securityHeaders },
    preview: { port: 4173, proxy, headers: { ...securityHeaders, "Content-Security-Policy": productionCsp } },
  };
});
