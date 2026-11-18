import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.js";
import * as api from "./api.js";
import type { Product, SaleSnapshot } from "./api.js";

vi.mock("./api.js", () => ({
  fetchSale: vi.fn(),
  fetchProduct: vi.fn(),
  attemptPurchase: vi.fn(),
  fetchMyStatus: vi.fn(),
  fetchMe: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
}));

const mocked = vi.mocked(api);
const MINUTE = 60_000;
const USER = "arief@example.com";

function sale(overrides: Partial<SaleSnapshot> = {}): SaleSnapshot {
  return {
    status: "active",
    startsAt: new Date(Date.now() - MINUTE).toISOString(),
    endsAt: new Date(Date.now() + 10 * MINUTE).toISOString(),
    totalStock: 100,
    stockLeft: 42,
    ...overrides,
  };
}

const PRODUCT: Product = {
  sku: "HT-1",
  name: "Royal Blue Hi-Top",
  description: "Hand-finished suede.",
  priceCents: 8900,
  originalPriceCents: 14900,
  currency: "USD",
  images: [
    { url: "/products/a.jpg", alt: "outer side" },
    { url: "/products/b.jpg", alt: "inner side" },
  ],
  specs: [{ label: "Upper", value: "Suede" }],
};

/** Renders the app at a path, as if the browser had opened it. */
function openAt(path: string) {
  window.history.replaceState(null, "", path);
  render(<App />);
}

const buyButton = () => screen.getByRole("button", { name: "Buy Now" }) as HTMLButtonElement;
const message = () => screen.getByRole("status");
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const loggedInAs = (email: string) => screen.findByText(email, { selector: "strong" });

beforeEach(() => {
  vi.resetAllMocks();
  mocked.fetchProduct.mockResolvedValue(PRODUCT);
  mocked.fetchSale.mockResolvedValue(sale());
  mocked.fetchMe.mockResolvedValue(USER);
  mocked.logout.mockResolvedValue(undefined);
  document.getElementById("product-jsonld")?.remove();
});

afterEach(() => {
  cleanup();
});

describe("product page", () => {
  it("shows the product with its sale price, original price and discount", async () => {
    openAt("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Royal Blue Hi-Top" })).toBeTruthy();
    expect(screen.getByText("$89.00")).toBeTruthy();
    expect(screen.getByText("$149.00")).toBeTruthy();
    expect(screen.getByText("40% OFF")).toBeTruthy();
    expect(screen.getByText("Suede")).toBeTruthy();
    expect(screen.getByText("Hand-finished suede.")).toBeTruthy();
  });

  it("switches the main photo when a thumbnail is clicked", async () => {
    openAt("/");
    expect(await screen.findByRole("img", { name: "outer side" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show photo 2: inner side" }));
    expect(screen.getByRole("img", { name: "inner side" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show photo 2: inner side" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("sets the page title and schema.org product data for search engines", async () => {
    openAt("/");
    await screen.findByRole("heading", { level: 1, name: "Royal Blue Hi-Top" });
    await screen.findByText("Live now");
    expect(document.title).toBe("Royal Blue Hi-Top | Arief Shop");
    const jsonLd = JSON.parse(document.getElementById("product-jsonld")?.textContent ?? "{}");
    expect(jsonLd).toMatchObject({ "@type": "Product", name: "Royal Blue Hi-Top", offers: { price: "89.00", availability: "https://schema.org/InStock" } });
  });

  it("still works when no product has been seeded", async () => {
    mocked.fetchProduct.mockResolvedValue(null);
    openAt("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Flash sale" })).toBeTruthy();
    await loggedInAs(USER);
    expect(buyButton().disabled).toBe(false);
  });
});

describe("sale status", () => {
  it("shows a live sale with its countdown and stock left", async () => {
    openAt("/");
    expect(await screen.findByText("Live now")).toBeTruthy();
    expect(screen.getByLabelText(/^Ends in \d\d:\d\d:\d\d$/)).toBeTruthy();
    expect(screen.getByText("42 left of 100")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Units sold" }).getAttribute("aria-valuenow")).toBe("58");
  });

  it("counts down to an upcoming sale and blocks buying", async () => {
    mocked.fetchSale.mockResolvedValue(sale({ status: "upcoming", startsAt: new Date(Date.now() + 5 * MINUTE).toISOString() }));
    openAt("/");
    expect(await screen.findByText("Starts soon")).toBeTruthy();
    expect(screen.getByLabelText(/^Starts in 00:0[45]:\d\d$/)).toBeTruthy();
    await loggedInAs(USER);
    expect(buyButton().disabled).toBe(true);
  });

  it.each([
    ["sold_out", "Sold out", "Sold out. Better luck next time."],
    ["ended", "Ended", "The sale has ended."],
  ] as const)("shows a %s sale as %s, says so in words, and blocks buying", async (status, label, notice) => {
    mocked.fetchSale.mockResolvedValue(sale({ status, stockLeft: 0 }));
    openAt("/");
    expect(await screen.findByText(label)).toBeTruthy();
    expect(screen.getByText(notice)).toBeTruthy();
    expect(screen.getByText("None left")).toBeTruthy();
    await loggedInAs(USER);
    expect(buyButton().disabled).toBe(true);
  });

  it("warns when the sale status can't be loaded", async () => {
    mocked.fetchSale.mockRejectedValue(new Error("offline"));
    openAt("/");
    expect(await screen.findByText("Can't reach the sale status right now.")).toBeTruthy();
  });
});

describe("buying", () => {
  it("asks a logged-out visitor to log in instead of showing Buy Now", async () => {
    mocked.fetchMe.mockResolvedValue(null);
    openAt("/");

    const loginToBuy = await screen.findByRole("link", { name: "Log in to buy" });
    expect(loginToBuy.getAttribute("href")).toBe("/login?next=/");
    expect(screen.queryByRole("button", { name: "Buy Now" })).toBeNull();
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe("/register");
  });

  it("disables Buy Now while it doesn't yet know who you are", async () => {
    mocked.fetchMe.mockReturnValue(new Promise(() => undefined));
    openAt("/");
    await screen.findByText("Live now");
    expect(buyButton().disabled).toBe(true);
  });

  it("shows who is buying, then pending, then confirmed once the worker has written the order", async () => {
    mocked.attemptPurchase.mockResolvedValue({ status: "pending", stockLeft: 41 });
    // First poll fails (network blip), the next one confirms.
    mocked.fetchMyStatus.mockRejectedValueOnce(new Error("blip")).mockResolvedValue("confirmed");
    openAt("/");

    expect(await loggedInAs(USER)).toBeTruthy();
    await screen.findByText("Live now");
    fireEvent.click(buyButton());

    expect(await screen.findByText("Purchase received, confirming...")).toBeTruthy();
    expect(buyButton().disabled).toBe(true);
    expect(await screen.findByText("You got one! Order confirmed.", {}, { timeout: 5000 })).toBeTruthy();
    expect(mocked.attemptPurchase).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(mocked.fetchMyStatus).toHaveBeenCalled();
  });

  it.each([
    ["already_purchased", "You already secured one. One per person.", "info"],
    ["sold_out", "Sold out. Better luck next time.", "warning"],
    ["rate_limited", "Slow down, too many attempts. Try again shortly.", "error"],
    ["unavailable", "Something's down on our end, try again in a moment.", "error"],
    ["unauthorized", "Your session ended. Log in again to buy.", "error"],
    ["in_progress", "Your purchase is already being processed.", "info"],
  ] as const)("tells the user when the purchase comes back %s", async (status, text, tone) => {
    mocked.attemptPurchase.mockResolvedValue({ status });
    openAt("/");
    await loggedInAs(USER);
    await screen.findByText("Live now");

    fireEvent.click(buyButton());

    expect(await within(message()).findByText(text)).toBeTruthy();
    expect(message().className).toContain(`buy__message--${tone}`);
  });
});

describe("idempotency", () => {
  it("sends a fresh key with every click, so a new click is a new attempt", async () => {
    mocked.attemptPurchase.mockResolvedValue({ status: "already_purchased" });
    openAt("/");
    await loggedInAs(USER);
    await screen.findByText("Live now");

    fireEvent.click(buyButton());
    await screen.findByText("You already secured one. One per person.");
    fireEvent.click(buyButton());
    await screen.findByText("You already secured one. One per person.");

    const [first, second] = mocked.attemptPurchase.mock.calls.map(([key]) => key);
    expect(first).not.toBe(second);
  });
});

describe("header", () => {
  it("shows the account and logs out", async () => {
    openAt("/");
    expect(await screen.findByText(USER, { selector: ".site-header__user" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("link", { name: "Log in" })).toBeTruthy();
    expect(mocked.logout).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Buy Now" })).toBeNull();
  });

  it("offers log in and sign up when logged out, and navigates in place", async () => {
    mocked.fetchMe.mockResolvedValue(null);
    openAt("/");
    expect((await screen.findByRole("link", { name: "Sign up" })).getAttribute("href")).toBe("/register");
    fireEvent.click(screen.getByRole("link", { name: "Log in" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Log in" })).toBeTruthy();
    expect(window.location.pathname).toBe("/login");
  });
});

describe("log in page", () => {
  beforeEach(() => {
    mocked.fetchMe.mockResolvedValue(null);
  });

  it("logs in and goes back to where the user came from", async () => {
    mocked.login.mockResolvedValue({ ok: true, email: USER });
    openAt("/login?next=/");
    type("Email", USER);
    type("Password", "correct-horse");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await loggedInAs(USER)).toBeTruthy();
    expect(window.location.pathname).toBe("/");
    expect(mocked.login).toHaveBeenCalledWith(USER, "correct-horse");
  });

  it("never redirects off-site after login", async () => {
    mocked.login.mockResolvedValue({ ok: true, email: USER });
    openAt("/login?next=https://evil.example");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    await screen.findByText("Live now");
    expect(window.location.pathname).toBe("/");
    expect(window.location.host).toBe("localhost:3000");
  });

  it("shows the API's error and stays put", async () => {
    mocked.login.mockResolvedValue({ ok: false, message: "Wrong email or password." });
    openAt("/login");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Wrong email or password.");
    expect(window.location.pathname).toBe("/login");
  });

  it("links to forgot password and sign up, and asks search engines not to index it", () => {
    openAt("/login");
    expect(screen.getByRole("link", { name: "Forgot password?" }).getAttribute("href")).toBe("/forgot-password");
    expect(document.title).toBe("Log in | Arief Shop");
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex");
  });

  it("changes the existing robots tag instead of adding a contradicting second one, and restores it", () => {
    const existing = document.createElement("meta");
    existing.name = "robots";
    existing.content = "index, follow";
    document.head.appendChild(existing);

    openAt("/login");
    expect(document.querySelectorAll('meta[name="robots"]')).toHaveLength(1);
    expect(existing.content).toBe("noindex");

    cleanup();
    expect(existing.content).toBe("index, follow");
    existing.remove();
  });

  it("disables the button while signing in", async () => {
    let finish!: (value: api.AuthResult) => void;
    mocked.login.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    openAt("/login");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect((screen.getByRole("button", { name: "Please wait..." }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish({ ok: false, message: "Wrong email or password." }));
  });
});

describe("register page", () => {
  beforeEach(() => {
    mocked.fetchMe.mockResolvedValue(null);
  });

  it("creates the account and lands logged in on the shop", async () => {
    mocked.register.mockResolvedValue({ ok: true, email: "new@example.com" });
    openAt("/register");
    type("Email", "new@example.com");
    type("Password", "correct-horse");
    type("Confirm password", "correct-horse");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await loggedInAs("new@example.com")).toBeTruthy();
    expect(mocked.register).toHaveBeenCalledWith("new@example.com", "correct-horse");
  });

  it("catches mismatched passwords without calling the API", async () => {
    openAt("/register");
    type("Password", "correct-horse");
    type("Confirm password", "correct-hors");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Passwords don't match.");
    expect(mocked.register).not.toHaveBeenCalled();
  });

  it("shows the API's error, e.g. an email that's taken", async () => {
    mocked.register.mockResolvedValue({ ok: false, message: "That email already has an account. Log in, or reset your password." });
    openAt("/register");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect((await screen.findByRole("alert")).textContent).toContain("already has an account");
  });
});

describe("forgot password page", () => {
  beforeEach(() => {
    mocked.fetchMe.mockResolvedValue(null);
  });

  it("confirms the link is on its way", async () => {
    mocked.forgotPassword.mockResolvedValue({ ok: true, message: "If that email has an account, a reset link is on its way." });
    openAt("/forgot-password");
    type("Email", USER);
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText("If that email has an account, a reset link is on its way.")).toBeTruthy();
    expect(mocked.forgotPassword).toHaveBeenCalledWith(USER);
  });

  it("shows an error for a malformed email", async () => {
    mocked.forgotPassword.mockResolvedValue({ ok: false, message: "Enter a valid email address." });
    openAt("/forgot-password");
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Enter a valid email address.");
  });

  it("tells local developers where the email goes", () => {
    openAt("/forgot-password");
    expect(screen.getByText("Running locally? Read the email with pnpm cli outbox")).toBeTruthy();
  });
});

describe("reset password page", () => {
  beforeEach(() => {
    mocked.fetchMe.mockResolvedValue(null);
  });

  it("explains when the link has no token", () => {
    openAt("/reset-password");
    expect(screen.getByRole("heading", { name: "Reset link missing" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Send a new link" }).getAttribute("href")).toBe("/forgot-password");
  });

  it("saves the new password with the token from the link and logs the user in", async () => {
    mocked.resetPassword.mockResolvedValue({ ok: true, email: USER });
    openAt("/reset-password?token=abc123");
    type("New password", "new-password");
    type("Confirm new password", "new-password");
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await loggedInAs(USER)).toBeTruthy();
    expect(mocked.resetPassword).toHaveBeenCalledWith("abc123", "new-password");
    expect(window.location.pathname).toBe("/");
  });

  it("catches mismatched passwords, and shows an expired-link error from the API", async () => {
    mocked.resetPassword.mockResolvedValue({ ok: false, message: "This reset link is invalid or has expired. Ask for a new one." });
    openAt("/reset-password?token=old");
    type("New password", "new-password");
    type("Confirm new password", "different");
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Passwords don't match.");
    expect(mocked.resetPassword).not.toHaveBeenCalled();

    type("Confirm new password", "new-password");
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect((await screen.findByRole("alert")).textContent).toBe("This reset link is invalid or has expired. Ask for a new one.");
  });
});

describe("routing", () => {
  it("shows a not-found page for unknown paths", () => {
    openAt("/nope");
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the shop" }).getAttribute("href")).toBe("/");
  });

  it("follows the browser's back button", async () => {
    mocked.fetchMe.mockResolvedValue(null);
    openAt("/");
    fireEvent.click(await screen.findByRole("link", { name: "Log in" }));
    await screen.findByRole("heading", { level: 1, name: "Log in" });

    await act(async () => {
      const popped = new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
      window.history.back();
      await popped;
    });
    expect(await screen.findByText("Live now")).toBeTruthy();
  });
});
