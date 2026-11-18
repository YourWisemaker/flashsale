import type { Product, SaleSnapshot } from "./api.js";

const AVAILABILITY: Record<SaleSnapshot["status"], string> = {
  upcoming: "https://schema.org/PreOrder",
  active: "https://schema.org/InStock",
  sold_out: "https://schema.org/SoldOut",
  ended: "https://schema.org/Discontinued",
};

/**
 * schema.org Product data so search engines can show price and
 * availability. Pure: the caller passes the page origin, because
 * schema.org wants absolute image URLs.
 */
export function buildProductJsonLd(product: Product, sale: SaleSnapshot | null, origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    sku: product.sku,
    name: product.name,
    description: product.description,
    image: product.images.map((image) => new URL(image.url, origin).href),
    offers: {
      "@type": "Offer",
      price: (product.priceCents / 100).toFixed(2),
      priceCurrency: product.currency,
      ...(sale && { availability: AVAILABILITY[sale.status], priceValidUntil: sale.endsAt.slice(0, 10) }),
    },
  };
}
