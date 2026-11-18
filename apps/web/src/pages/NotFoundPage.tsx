import { Link } from "../router.js";
import { usePageMeta } from "../usePageMeta.js";

export function NotFoundPage() {
  usePageMeta("Page not found", { noindex: true });
  return (
    <section className="auth card">
      <h1 className="auth__title">Page not found</h1>
      <p className="auth__intro">There's nothing here. The sale is on the home page.</p>
      <Link to="/" className="buy__button buy__button--link">
        Go to the shop
      </Link>
    </section>
  );
}
