import type { ProductDocument } from "@flashsale/core";

/**
 * The one product on sale. Photos are by LouisBlaut, CC BY-SA 4.0, via
 * Wikimedia Commons, cropped to squares (see apps/web/public/products/CREDITS.md).
 * Image paths are served by the web app from apps/web/public. Written by
 * `pnpm cli seed` and `pnpm cli product:inject`.
 */
export const SEED_PRODUCT: ProductDocument = {
  sku: "HT-ROYAL-001",
  name: "Royal Blue Hi-Top Sneaker, Hand-Finished Limited Edition",
  description:
    "A hand-finished hi-top in royal blue suede with a brushed satin side panel, woven gold toe guard and gem-set heel tab. Made in a small run for this drop only; once it sells out it won't be restocked.",
  priceCents: 8900,
  originalPriceCents: 14900,
  currency: "USD",
  images: [
    { url: "/products/hi-top-right.jpg", alt: "Royal blue hi-top sneaker, outer side view" },
    { url: "/products/hi-top-left.jpg", alt: "Royal blue hi-top sneaker, inner side view" },
  ],
  specs: [
    { label: "Upper", value: "Suede with brushed satin panel" },
    { label: "Details", value: "Woven gold toe guard, gem-set heel tab" },
    { label: "Sole", value: "White cupsole, black rubber outsole" },
    { label: "Closure", value: "Lace-up, gold eyelets" },
    { label: "Limit", value: "1 pair per customer" },
  ],
};
