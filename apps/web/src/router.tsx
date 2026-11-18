import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

/**
 * Five pages don't need a routing library: the path is state, pushState
 * changes it, popstate (back/forward) reads it back.
 */
const listeners = new Set<() => void>();

export function navigate(to: string): void {
  window.history.pushState(null, "", to);
  listeners.forEach((notify) => notify());
}

export function useLocation(): { pathname: string; search: URLSearchParams } {
  const [, rerender] = useState(0);
  useEffect(() => {
    const notify = () => rerender((n) => n + 1);
    listeners.add(notify);
    window.addEventListener("popstate", notify);
    return () => {
      listeners.delete(notify);
      window.removeEventListener("popstate", notify);
    };
  }, []);
  return { pathname: window.location.pathname, search: new URLSearchParams(window.location.search) };
}

/** A normal <a> (so open-in-new-tab works) that navigates in place on a plain click. */
export function Link({ to, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={to}
      {...rest}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        navigate(to);
      }}
    />
  );
}

/**
 * Only same-site paths are allowed as a post-login redirect, so a crafted
 * "?next=https://evil.example" link can't bounce someone off-site.
 */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
