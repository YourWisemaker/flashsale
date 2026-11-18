import type { Product } from "../api.js";

export function ProductDetails({ product }: { product: Product }) {
  return (
    <section className="card details" aria-labelledby="details-heading">
      <h2 id="details-heading" className="card__heading">
        Product details
      </h2>
      {product.specs.length > 0 && (
        <dl className="specs">
          {product.specs.map((spec) => (
            <div className="specs__row" key={spec.label}>
              <dt>{spec.label}</dt>
              <dd>{spec.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <h2 className="card__heading">Description</h2>
      <p className="details__description">{product.description}</p>
    </section>
  );
}
