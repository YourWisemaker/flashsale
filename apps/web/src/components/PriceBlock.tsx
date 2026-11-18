import type { Product } from "../api.js";
import { discountPercent, formatPrice } from "../format.js";

export function PriceBlock({ product }: { product: Product }) {
  const off = discountPercent(product.priceCents, product.originalPriceCents);
  return (
    <div className="price">
      {off > 0 && <s className="price__original">{formatPrice(product.originalPriceCents, product.currency)}</s>}
      <span className="price__current">{formatPrice(product.priceCents, product.currency)}</span>
      {off > 0 && <span className="price__badge">{off}% OFF</span>}
    </div>
  );
}
