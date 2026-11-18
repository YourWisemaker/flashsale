import { useEffect, useState } from "react";
import { attemptPurchase, fetchUserStatus } from "./api.js";
import { PURCHASE_MESSAGES } from "./messages.js";

type Outcome = keyof typeof PURCHASE_MESSAGES;

/** Buy, then poll until the worker confirms. No rendering here. */
export function usePurchase() {
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pendingFor, setPendingFor] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingFor) return;
    const id = setInterval(async () => {
      // A failed poll is just retried on the next tick.
      const status = await fetchUserStatus(pendingFor).catch(() => null);
      if (status === "confirmed") {
        setOutcome("confirmed");
        setPendingFor(null);
      }
    }, 1500);
    return () => clearInterval(id);
  }, [pendingFor]);

  async function buy(userId: string) {
    setSubmitting(true);
    setOutcome(null);
    const result = await attemptPurchase(userId);
    setSubmitting(false);
    setOutcome(result.status);
    setPendingFor(result.status === "pending" ? userId : null);
  }

  return { buy, submitting, pending: pendingFor !== null, outcome };
}
