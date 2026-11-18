import { useEffect, useState } from "react";
import { attemptPurchase, fetchMyStatus } from "./api.js";
import { PURCHASE_MESSAGES } from "./messages.js";

type Outcome = keyof typeof PURCHASE_MESSAGES;

/** Buy, then poll until the worker confirms. No rendering here. */
export function usePurchase() {
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(async () => {
      // A failed poll is just retried on the next tick.
      const status = await fetchMyStatus().catch(() => null);
      if (status === "confirmed") {
        setOutcome("confirmed");
        setPending(false);
      }
    }, 1500);
    return () => clearInterval(id);
  }, [pending]);

  async function buy() {
    setSubmitting(true);
    setOutcome(null);
    // A fresh key per click, so a retry of this click is safe and a new click is a new attempt.
    const result = await attemptPurchase(crypto.randomUUID());
    setSubmitting(false);
    setOutcome(result.status);
    setPending(result.status === "pending");
  }

  return { buy, submitting, pending, outcome };
}
