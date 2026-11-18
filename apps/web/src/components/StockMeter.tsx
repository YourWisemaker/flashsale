import type { SaleSnapshot } from "../api.js";

export function StockMeter({ sale }: { sale: SaleSnapshot }) {
  const sold = sale.totalStock - sale.stockLeft;
  const percentSold = sale.totalStock > 0 ? Math.round((sold / sale.totalStock) * 100) : 100;
  const label = sale.stockLeft === 0 ? "None left" : `${sale.stockLeft} left of ${sale.totalStock}`;

  return (
    <div className="stock">
      <p className="stock__text">{label}</p>
      <div
        className="stock__bar"
        role="progressbar"
        aria-label="Units sold"
        aria-valuemin={0}
        aria-valuemax={sale.totalStock}
        aria-valuenow={sold}
      >
        <div className="stock__fill" style={{ width: `${percentSold}%` }} />
      </div>
    </div>
  );
}
