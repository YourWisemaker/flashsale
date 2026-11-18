import { useAuth } from "../auth.js";
import { Link, navigate } from "../router.js";
import { BoltIcon } from "./BoltIcon.js";

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link className="brand" to="/" aria-label="Arief Shop home">
          <span className="brand__mark">
            <BoltIcon size={22} />
          </span>
          <span className="brand__name">Arief Shop</span>
        </Link>
        <nav className="site-header__nav" aria-label="Account">
          {user && (
            <>
              <span className="site-header__user">{user}</span>
              <button
                type="button"
                className="site-header__link"
                onClick={async () => {
                  await logout();
                  navigate("/");
                }}
              >
                Log out
              </button>
            </>
          )}
          {user === null && (
            <>
              <Link to="/register" className="site-header__link">
                Sign up
              </Link>
              <Link to="/login" className="site-header__link site-header__link--strong">
                Log in
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
