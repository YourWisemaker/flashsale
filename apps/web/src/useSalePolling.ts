import { useEffect, useState } from "react";
import { fetchSale, type SaleSnapshot } from "./api.js";

const POLL_MS = 2000;

/** Keeps the sale status on screen fresh without the user refreshing. */
export function useSalePolling() {
  const [sale, setSale] = useState<SaleSnapshot | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const snapshot = await fetchSale();
        if (!cancelled) {
          setSale(snapshot);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { sale, error };
}
