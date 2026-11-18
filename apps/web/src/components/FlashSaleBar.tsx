import type { SaleSnapshot } from "../api.js";
import { countdownParts } from "../countdown.js";
import { SALE_LABELS } from "../messages.js";
import { useNow } from "../useNow.js";
import { BoltIcon } from "./BoltIcon.js";

export function FlashSaleBar({ sale }: { sale: SaleSnapshot }) {
  const now = useNow();
  const target = sale.status === "upcoming" ? sale.startsAt : sale.status === "active" ? sale.endsAt : null;
  const parts = target ? countdownParts(target, now) : null;

  return (
    <div className={`flash-bar flash-bar--${sale.status}`}>
      <span className="flash-bar__title">
        <BoltIcon size={18} /> FLASH SALE
      </span>
      <span className="flash-bar__status" data-testid="sale-status">
        {SALE_LABELS[sale.status]}
      </span>
      {parts && (
        <span className="flash-bar__timer" aria-label={`${sale.status === "upcoming" ? "Starts in" : "Ends in"} ${parts.hours}:${parts.minutes}:${parts.seconds}`}>
          <span className="flash-bar__timer-label">{sale.status === "upcoming" ? "Starts in" : "Ends in"}</span>
          <span className="digit">{parts.hours}</span>:<span className="digit">{parts.minutes}</span>:
          <span className="digit">{parts.seconds}</span>
        </span>
      )}
    </div>
  );
}
