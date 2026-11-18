import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SEED_PRODUCT } from "../../seed/product.js";

// The web app serves these files from apps/web/public; a typo here
// would ship a broken gallery that no other test would notice.
// Found by walking up rather than a fixed relative path, because Stryker
// runs this test from a sandbox copy nested deeper in the tree.
function findWebPublic(from: string): string {
  const candidate = join(from, "apps/web/public");
  if (existsSync(candidate)) return candidate;
  const parent = dirname(from);
  if (parent === from) throw new Error("apps/web/public not found above this test");
  return findWebPublic(parent);
}
const webPublic = findWebPublic(dirname(fileURLToPath(import.meta.url)));
const filled = (value: string) => value.trim().length > 0;

describe("seed product", () => {
  it("has a gallery, and every image is a real file the web app serves", () => {
    // Checked explicitly: a loop over an empty list proves nothing.
    expect(SEED_PRODUCT.images.length).toBeGreaterThanOrEqual(2);
    for (const image of SEED_PRODUCT.images) {
      expect(image.url, image.url).toMatch(/^\/products\/[\w-]+\.jpg$/);
      expect(statSync(join(webPublic, image.url)).isFile(), image.url).toBe(true);
      expect(filled(image.alt), `alt for ${image.url}`).toBe(true);
    }
  });

  it("has the copy the page and search engines show", () => {
    expect(filled(SEED_PRODUCT.sku)).toBe(true);
    expect(filled(SEED_PRODUCT.name)).toBe(true);
    expect(SEED_PRODUCT.description.length).toBeGreaterThan(40);
    expect(SEED_PRODUCT.specs.length).toBeGreaterThan(0);
    for (const spec of SEED_PRODUCT.specs) expect(filled(spec.label) && filled(spec.value), spec.label).toBe(true);
  });

  it("is priced in a real currency, discounted, in whole cents", () => {
    expect(() => new Intl.NumberFormat("en", { style: "currency", currency: SEED_PRODUCT.currency })).not.toThrow();
    expect(SEED_PRODUCT.currency).toMatch(/^[A-Z]{3}$/);
    expect(Number.isInteger(SEED_PRODUCT.priceCents)).toBe(true);
    expect(SEED_PRODUCT.priceCents).toBeGreaterThan(0);
    expect(SEED_PRODUCT.priceCents).toBeLessThan(SEED_PRODUCT.originalPriceCents);
  });
});
