import { useEffect, useState } from "react";
import { attemptPurchase, fetchMyStatus } from "./api.js";
import { PURCHASE_MESSAGES } from "./messages.js";

type Outcome = keyof typeof PURCHASE_MESSAGES;

/** Outcomes after which this account holds a unit: nothing left to buy. */
const OWNED: ReadonlySet<Outcome> = new Set(["confirmed", "already_purchased"]);

/**
 * Buy, then poll until the worker confirms. No rendering here.
 * `user` is the logged-in email: once it's known, the hook asks the API
 * whether this account already holds a unit, so a returning buyer sees
 * "already secured" instead of a live Buy Now button.
 */
export function usePurchase(user: string | null | undefined) {
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!user) return;
    let current = true;
    // Unknown status (network blip, logged out meanwhile) leaves Buy Now as is.
    fetchMyStatus()
      .catch(() => null)
      .then((status) => {
        if (!current) return;
        if (status === "confirmed") setOutcome("already_purchased");
        if (status === "pending") {
          setOutcome("pending");
          setPending(true);
        }
      });
    return () => {
      current = false;
    };
  }, [user]);

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

  return { buy, submitting, pending, outcome, owned: outcome !== null && OWNED.has(outcome) };
}
