import { useEffect, useState } from "react";
import { fetchProduct, type Product } from "./api.js";

/** Product display data changes only on re-seed, so it's fetched once. */
export function useProduct() {
  const [product, setProduct] = useState<Product | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProduct()
      .then((p) => !cancelled && setProduct(p))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return product;
}
