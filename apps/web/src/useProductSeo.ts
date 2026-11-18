import { useEffect } from "react";
import type { Product, SaleSnapshot } from "./api.js";
import { buildProductJsonLd } from "./structured-data.js";

const SCRIPT_ID = "product-jsonld";

/** Page title and schema.org data follow the live product and sale status. */
export function useProductSeo(product: Product | null, sale: SaleSnapshot | null) {
  useEffect(() => {
    if (!product) return;
    document.title = `${product.name} | Arief Shop`;

    let script = document.getElementById(SCRIPT_ID);
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.setAttribute("type", "application/ld+json");
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(buildProductJsonLd(product, sale, window.location.origin));
    // Only status and end time feed the JSON-LD; the 2s poll hands over a
    // new `sale` object every time, which would rewrite the tag for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, sale?.status, sale?.endsAt]);
}
