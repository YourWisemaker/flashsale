/** Pure, no I/O. Prices travel as integer cents to avoid float rounding. */
export function formatPrice(cents: number, currency: string, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

/** Whole-percent discount, rounded down so the badge never overstates it. */
export function discountPercent(priceCents: number, originalPriceCents: number): number {
  if (originalPriceCents <= 0 || priceCents >= originalPriceCents) return 0;
  return Math.floor(((originalPriceCents - priceCents) / originalPriceCents) * 100);
}
