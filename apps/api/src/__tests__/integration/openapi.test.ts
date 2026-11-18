import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setupTestApp } from "./test-helpers.js";

const ctx = await setupTestApp();

afterAll(ctx.teardown);
beforeEach(ctx.reset);

type Spec = { info: { title: string }; paths: Record<string, Record<string, unknown>> };

/** Every "METHOD /path" Fastify serves, minus HEAD (automatic) and Swagger UI's own routes. */
function servedRoutes(): string[] {
  // printRoutes draws a tree (children indented 4 per level, path relative
  // to the parent); rebuild full paths from the indentation.
  const parents: string[] = [];
  const routes: string[] = [];
  for (const line of ctx.app.printRoutes({ commonPrefix: false }).split("\n")) {
    const match = /^([│ ]*)[├└]── (\S+) \(([^)]+)\)$/.exec(line);
    if (!match) continue;
    const depth = match[1].length / 4;
    parents.length = depth;
    const path = (parents[depth - 1] ?? "") + match[2];
    parents.push(path);
    for (const method of match[3].split(", ")) routes.push(`${method} ${path}`);
  }
  return routes.filter((route) => !route.startsWith("HEAD") && !route.includes(" /docs"));
}

describe("OpenAPI spec at /docs", () => {
  it("documents exactly the routes the API serves", async () => {
    const spec = (await ctx.app.inject({ method: "GET", url: "/docs/json" })).json<Spec>();
    // The hand-written spec, not one generated from (schema-less) routes.
    expect(spec.info.title).toBe("Arief Shop Flash Sale API");
    const documented = Object.entries(spec.paths).flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`));

    expect(documented.sort()).toEqual(servedRoutes().sort());
  });

  it("serves Swagger UI that still can't be framed", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/docs" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    const csp = res.headers["content-security-policy"];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("frame-ancestors 'self'");
    expect(csp).toContain("script-src 'self' ;");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("style-src 'self' https:");
  });
});
