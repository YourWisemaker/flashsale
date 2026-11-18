import type { PurchaseStatus, SaleStatus } from "./api.js";

export type Tone = "info" | "success" | "warning" | "error";

/** Every message the buyer can see after clicking Buy Now, in one table. */
export const PURCHASE_MESSAGES: Record<PurchaseStatus | "confirmed", { text: string; tone: Tone }> = {
  pending: { text: "Purchase received, confirming...", tone: "info" },
  confirmed: { text: "You got one! Order confirmed.", tone: "success" },
  already_purchased: { text: "You already secured one. One per person.", tone: "info" },
  sold_out: { text: "Sold out. Better luck next time.", tone: "warning" },
  upcoming: { text: "The sale hasn't started yet.", tone: "warning" },
  ended: { text: "The sale has ended.", tone: "warning" },
  unavailable: { text: "Something's down on our end, try again in a moment.", tone: "error" },
  invalid_user: { text: "Enter a valid username or email first.", tone: "error" },
  rate_limited: { text: "Slow down, too many attempts. Try again shortly.", tone: "error" },
  error: { text: "Couldn't reach the server. Try again.", tone: "error" },
};

export const SALE_LABELS: Record<SaleStatus, string> = {
  upcoming: "Starts soon",
  active: "Live now",
  sold_out: "Sold out",
  ended: "Ended",
};
