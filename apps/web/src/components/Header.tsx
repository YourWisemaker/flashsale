import { BoltIcon } from "./BoltIcon.js";

export function Header() {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <a className="brand" href="/" aria-label="Arief Shop home">
          <span className="brand__mark">
            <BoltIcon size={22} />
          </span>
          <span className="brand__name">Arief Shop</span>
        </a>
        <p className="site-header__tagline">Limited drops. One per customer.</p>
      </div>
    </header>
  );
}
