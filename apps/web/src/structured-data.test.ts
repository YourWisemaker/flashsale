import { describe, expect, it } from "vitest";
import type { Product, SaleSnapshot } from "./api.js";
import { buildProductJsonLd } from "./structured-data.js";

const product: Product = {
  sku: "HT-1",
  name: "Hi-Top",
  description: "A sneaker.",
  priceCents: 8900,
  originalPriceCents: 14900,
  currency: "USD",
  images: [{ url: "/products/a.jpg", alt: "side" }],
  specs: [],
};

const sale = (status: SaleSnapshot["status"]): SaleSnapshot => ({
  status,
  startsAt: "2026-11-18T10:00:00.000Z",
  endsAt: "2026-11-18T11:00:00.000Z",
  totalStock: 10,
  stockLeft: 5,
});

describe("buildProductJsonLd", () => {
  it("describes the product with absolute image URLs and the sale price", () => {
    expect(buildProductJsonLd(product, sale("active"), "https://shop.example")).toEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      sku: "HT-1",
      name: "Hi-Top",
      description: "A sneaker.",
      image: ["https://shop.example/products/a.jpg"],
      offers: {
        "@type": "Offer",
        price: "89.00",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        priceValidUntil: "2026-11-18",
      },
    });
  });

  it.each([
    ["upcoming", "https://schema.org/PreOrder"],
    ["sold_out", "https://schema.org/SoldOut"],
    ["ended", "https://schema.org/Discontinued"],
  ] as const)("maps a %s sale to %s", (status, availability) => {
    expect(buildProductJsonLd(product, sale(status), "https://shop.example").offers.availability).toBe(availability);
  });

  it("omits availability until the sale status is known", () => {
    expect(buildProductJsonLd(product, null, "https://shop.example").offers).toEqual({
      "@type": "Offer",
      price: "89.00",
      priceCurrency: "USD",
    });
  });
});
