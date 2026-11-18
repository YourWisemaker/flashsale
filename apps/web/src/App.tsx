import { useEffect, useState } from "react";
import { attemptPurchase, fetchUserStatus, type PurchaseStatus, type UserOrderStatus } from "./api.js";
import { formatCountdown } from "./countdown.js";
import { useSalePolling } from "./useSalePolling.js";

const MESSAGES: Record<PurchaseStatus, string> = {
  pending: "Purchase received, confirming...",
  already_purchased: "You already secured one. One per person.",
  sold_out: "Sold out. Better luck next time.",
  upcoming: "The sale hasn't started yet.",
  ended: "The sale has ended.",
  unavailable: "Something's down on our end, try again in a moment.",
  invalid_user: "Enter a valid user id first.",
  rate_limited: "Slow down, too many attempts. Try again shortly.",
  error: "Couldn't reach the server. Try again.",
};

export default function App() {
  const { sale, error: saleError } = useSalePolling();
  const [userId, setUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<UserOrderStatus | null>(null);
  const [, forceTick] = useState(0);

  // Re-render once a second so the countdown text stays live.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Once a purchase is pending, poll until the worker confirms it.
  useEffect(() => {
    if (orderStatus !== "pending" || !userId) return;
    const id = setInterval(async () => {
      // A failed poll is just retried on the next tick.
      const status = await fetchUserStatus(userId).catch(() => null);
      if (status === "confirmed") {
        setOrderStatus("confirmed");
        setMessage("You got one! Order confirmed.");
      }
    }, 1500);
    return () => clearInterval(id);
  }, [orderStatus, userId]);

  async function handleBuy() {
    setSubmitting(true);
    setMessage(null);
    const result = await attemptPurchase(userId);
    setSubmitting(false);
    setMessage(MESSAGES[result.status]);
    setOrderStatus(result.status === "pending" ? "pending" : null);
  }

  const buyDisabled = !sale || sale.status !== "active" || submitting || userId.trim().length === 0;

  return (
    <main className="page">
      <h1>Flash Sale</h1>

      <section className="status-card">
        {saleError && <p className="warning">Can't reach the sale status right now.</p>}
        {!sale && !saleError && <p>Loading sale status...</p>}
        {sale && (
          <>
            <p className="status-line">
              Status: <strong>{sale.status.toUpperCase()}</strong>
            </p>
            {sale.status === "upcoming" && <p>Starts in {formatCountdown(sale.startsAt)}</p>}
            {sale.status === "active" && <p>Ends in {formatCountdown(sale.endsAt)}</p>}
            {sale.status === "sold_out" && <p className="warning">{MESSAGES.sold_out}</p>}
            {sale.status === "ended" && <p className="warning">{MESSAGES.ended}</p>}
            <p>
              Stock left: {sale.stockLeft} / {sale.totalStock}
            </p>
          </>
        )}
      </section>

      <section className="buy-form">
        <label htmlFor="userId">User identifier</label>
        <input
          id="userId"
          type="text"
          placeholder="you@example.com"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          disabled={submitting || orderStatus === "pending"}
        />
        <button onClick={handleBuy} disabled={buyDisabled || orderStatus === "pending"}>
          {submitting ? "Submitting..." : "Buy Now"}
        </button>
      </section>

      {message && <p className="message">{message}</p>}
    </main>
  );
}
