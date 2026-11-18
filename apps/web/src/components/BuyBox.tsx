import { PURCHASE_MESSAGES } from "../messages.js";
import { Link } from "../router.js";

interface BuyBoxProps {
  /** Logged-in email; null when logged out, undefined while still checking. */
  user: string | null | undefined;
  saleOpen: boolean;
  submitting: boolean;
  pending: boolean;
  outcome: keyof typeof PURCHASE_MESSAGES | null;
  onBuy: () => void;
}

export function BuyBox({ user, saleOpen, submitting, pending, outcome, onBuy }: BuyBoxProps) {
  if (user === null) {
    return (
      <div className="buy">
        <p className="buy__label">Log in to buy. One pair per account.</p>
        <Link to="/login?next=/" className="buy__button buy__button--link">
          Log in to buy
        </Link>
        <p className="buy__hint">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </div>
    );
  }

  const message = outcome ? PURCHASE_MESSAGES[outcome] : null;
  const disabled = !user || !saleOpen || submitting || pending;

  return (
    <div className="buy">
      {user && (
        <p className="buy__label">
          Buying as <strong>{user}</strong>
        </p>
      )}
      <button type="button" className="buy__button" disabled={disabled} onClick={onBuy}>
        {submitting ? "Submitting..." : "Buy Now"}
      </button>
      <p className={`buy__message buy__message--${message?.tone ?? "none"}`} role="status" aria-live="polite">
        {message?.text}
      </p>
    </div>
  );
}
