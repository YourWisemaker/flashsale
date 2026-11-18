import { useAuth } from "../auth.js";
import { BuyBox } from "../components/BuyBox.js";
import { FlashSaleBar } from "../components/FlashSaleBar.js";
import { Gallery } from "../components/Gallery.js";
import { PriceBlock } from "../components/PriceBlock.js";
import { ProductDetails } from "../components/ProductDetails.js";
import { StockMeter } from "../components/StockMeter.js";
import { PURCHASE_MESSAGES } from "../messages.js";
import { useProduct } from "../useProduct.js";
import { useProductSeo } from "../useProductSeo.js";
import { usePurchase } from "../usePurchase.js";
import { useSalePolling } from "../useSalePolling.js";

export function ShopPage() {
  const { user } = useAuth();
  const { sale, error: saleError } = useSalePolling();
  const product = useProduct();
  const purchase = usePurchase(user);
  useProductSeo(product, sale);

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li>Home</li>
          <li>Shoes</li>
          <li>Sneakers</li>
          {product && <li aria-current="page">{product.name}</li>}
        </ol>
      </nav>

      <section className="card product">
        {product && <Gallery images={product.images} />}

        <div className="product__info">
          <h1 className="product__title">{product?.name ?? "Flash sale"}</h1>
          <p className="product__tags">
            <span className="tag">Limited edition</span>
            <span className="tag">1 per customer</span>
          </p>

          {saleError && (
            <p className="notice notice--error">
              Can't reach the sale status right now.
            </p>
          )}
          {!sale && !saleError && (
            <p className="notice">Loading sale status...</p>
          )}

          {sale && (
            <>
              <FlashSaleBar sale={sale} />
              {(sale.status === "ended" || sale.status === "sold_out") && (
                <p className="notice notice--warning">
                  {PURCHASE_MESSAGES[sale.status].text}
                </p>
              )}
              {product && <PriceBlock product={product} />}
              <StockMeter sale={sale} />
            </>
          )}

          <BuyBox
            user={user}
            saleOpen={sale?.status === "active"}
            submitting={purchase.submitting}
            pending={purchase.pending}
            owned={purchase.owned}
            outcome={purchase.outcome}
            onBuy={purchase.buy}
          />
        </div>
      </section>

      {product && <ProductDetails product={product} />}
    </>
  );
}
