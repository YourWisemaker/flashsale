import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Link, safeNext } from "./router.js";

describe("safeNext", () => {
  it.each([
    ["/", "/"],
    ["/checkout?x=1", "/checkout?x=1"],
    [null, "/"],
    ["", "/"],
    ["https://evil.example", "/"],
    ["//evil.example/path", "/"],
    ["javascript:alert(1)", "/"],
  ])("turns %j into %j (same-site paths only, no open redirect)", (next, expected) => {
    expect(safeNext(next)).toBe(expected);
  });
});

describe("Link", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));
  afterEach(() => cleanup());

  it("navigates in place on a plain click", () => {
    render(<Link to="/login">Log in</Link>);
    fireEvent.click(screen.getByRole("link", { name: "Log in" }));
    expect(window.location.pathname).toBe("/login");
  });

  it("leaves modified clicks to the browser (open in new tab)", () => {
    render(<Link to="/login">Log in</Link>);
    fireEvent.click(screen.getByRole("link", { name: "Log in" }), { metaKey: true });
    fireEvent.click(screen.getByRole("link", { name: "Log in" }), { ctrlKey: true });
    fireEvent.click(screen.getByRole("link", { name: "Log in" }), { shiftKey: true });
    fireEvent.click(screen.getByRole("link", { name: "Log in" }), { button: 1 });
    expect(window.location.pathname).toBe("/");
  });

  it("is a real link with an href", () => {
    render(<Link to="/register">Sign up</Link>);
    expect(screen.getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe("/register");
  });
});
