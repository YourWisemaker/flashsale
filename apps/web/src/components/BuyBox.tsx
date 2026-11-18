import { useState } from "react";
import { PURCHASE_MESSAGES } from "../messages.js";

interface BuyBoxProps {
  saleOpen: boolean;
  submitting: boolean;
  pending: boolean;
  outcome: keyof typeof PURCHASE_MESSAGES | null;
  onBuy: (userId: string) => void;
}

export function BuyBox({ saleOpen, submitting, pending, outcome, onBuy }: BuyBoxProps) {
  const [userId, setUserId] = useState("");
  const disabled = !saleOpen || submitting || pending || userId.trim().length === 0;
  const message = outcome ? PURCHASE_MESSAGES[outcome] : null;

  return (
    <form
      className="buy"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onBuy(userId);
      }}
    >
      <label htmlFor="userId" className="buy__label">
        Username or email
      </label>
      <input
        id="userId"
        className="buy__input"
        type="text"
        autoComplete="username"
        placeholder="you@example.com"
        value={userId}
        onChange={(event) => setUserId(event.target.value)}
        disabled={submitting || pending}
      />
      <button type="submit" className="buy__button" disabled={disabled}>
        {submitting ? "Submitting..." : "Buy Now"}
      </button>
      <p className={`buy__message buy__message--${message?.tone ?? "none"}`} role="status" aria-live="polite">
        {message?.text}
      </p>
    </form>
  );
}
