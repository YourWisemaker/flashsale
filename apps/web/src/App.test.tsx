import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.js";
import * as api from "./api.js";
import type { Product, SaleSnapshot } from "./api.js";

vi.mock("./api.js", () => ({
  fetchSale: vi.fn(),
  fetchProduct: vi.fn(),
  attemptPurchase: vi.fn(),
  fetchUserStatus: vi.fn(),
}));

const mocked = vi.mocked(api);
const MINUTE = 60_000;

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

const buyButton = () => screen.getByRole("button", { name: "Buy Now" }) as HTMLButtonElement;
const typeUserId = (value: string) => fireEvent.change(screen.getByLabelText("Username or email"), { target: { value } });
const message = () => screen.getByRole("status");

beforeEach(() => {
  vi.resetAllMocks();
  mocked.fetchProduct.mockResolvedValue(PRODUCT);
  document.getElementById("product-jsonld")?.remove();
});

afterEach(() => {
  cleanup();
});

describe("product page", () => {
  it("shows the product with its sale price, original price and discount", async () => {
    mocked.fetchSale.mockResolvedValue(sale());
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Royal Blue Hi-Top" })).toBeTruthy();
    expect(screen.getByText("$89.00")).toBeTruthy();
    expect(screen.getByText("$149.00")).toBeTruthy();
    expect(screen.getByText("40% OFF")).toBeTruthy();
    expect(screen.getByText("Suede")).toBeTruthy();
    expect(screen.getByText("Hand-finished suede.")).toBeTruthy();
  });

  it("switches the main photo when a thumbnail is clicked", async () => {
    mocked.fetchSale.mockResolvedValue(sale());
    render(<App />);
    const main = await screen.findByRole("img", { name: "outer side" });
    expect(main).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show photo 2: inner side" }));

    expect(screen.getByRole("img", { name: "inner side" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show photo 2: inner side" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("sets the page title and schema.org product data for search engines", async () => {
    mocked.fetchSale.mockResolvedValue(sale());
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Royal Blue Hi-Top" });
    await screen.findByText("Live now");

    expect(document.title).toBe("Royal Blue Hi-Top | Arief Shop");
    const jsonLd = JSON.parse(document.getElementById("product-jsonld")?.textContent ?? "{}");
    expect(jsonLd).toMatchObject({ "@type": "Product", name: "Royal Blue Hi-Top", offers: { price: "89.00", availability: "https://schema.org/InStock" } });
  });

  it("still lets people buy when no product has been seeded", async () => {
    mocked.fetchProduct.mockResolvedValue(null);
    mocked.fetchSale.mockResolvedValue(sale());
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Flash sale" })).toBeTruthy();
    typeUserId("arief");
    expect(buyButton().disabled).toBe(false);
  });
});

describe("sale status", () => {
  it("shows a live sale with its countdown and stock left", async () => {
    mocked.fetchSale.mockResolvedValue(sale());
    render(<App />);

    expect(await screen.findByText("Live now")).toBeTruthy();
    expect(screen.getByLabelText(/^Ends in \d\d:\d\d:\d\d$/)).toBeTruthy();
    expect(screen.getByText("42 left of 100")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Units sold" }).getAttribute("aria-valuenow")).toBe("58");
  });

  it("counts down to an upcoming sale and blocks buying", async () => {
    mocked.fetchSale.mockResolvedValue(sale({ status: "upcoming", startsAt: new Date(Date.now() + 5 * MINUTE).toISOString() }));
    render(<App />);

    expect(await screen.findByText("Starts soon")).toBeTruthy();
    expect(screen.getByLabelText(/^Starts in 00:0[45]:\d\d$/)).toBeTruthy();
    typeUserId("arief");
    expect(buyButton().disabled).toBe(true);
  });

  it.each([
    ["sold_out", "Sold out", "Sold out. Better luck next time."],
    ["ended", "Ended", "The sale has ended."],
  ] as const)("shows a %s sale as %s, says so in words, and blocks buying", async (status, label, notice) => {
    mocked.fetchSale.mockResolvedValue(sale({ status, stockLeft: 0 }));
    render(<App />);

    expect(await screen.findByText(label)).toBeTruthy();
    expect(screen.getByText(notice)).toBeTruthy();
    expect(screen.getByText("None left")).toBeTruthy();
    typeUserId("arief");
    expect(buyButton().disabled).toBe(true);
  });

  it("warns when the sale status can't be loaded", async () => {
    mocked.fetchSale.mockRejectedValue(new Error("offline"));
    render(<App />);

    expect(await screen.findByText("Can't reach the sale status right now.")).toBeTruthy();
  });
});

describe("buying", () => {
  it("keeps Buy Now disabled until a user id is entered", async () => {
    mocked.fetchSale.mockResolvedValue(sale());
    render(<App />);
    await screen.findByText("Live now");

    expect(buyButton().disabled).toBe(true);
    typeUserId("   ");
    expect(buyButton().disabled).toBe(true);
    typeUserId("arief");
    expect(buyButton().disabled).toBe(false);
  });

  it("shows pending, then confirmed once the worker has written the order", async () => {
    mocked.fetchSale.mockResolvedValue(sale());
    mocked.attemptPurchase.mockResolvedValue({ status: "pending", stockLeft: 41 });
    // First poll fails (network blip), the next one confirms.
    mocked.fetchUserStatus.mockRejectedValueOnce(new Error("blip")).mockResolvedValue("confirmed");
    render(<App />);
    await screen.findByText("Live now");

    typeUserId("arief");
    fireEvent.click(buyButton());

    expect(await screen.findByText("Purchase received, confirming...")).toBeTruthy();
    expect(buyButton().disabled).toBe(true);
    expect(await screen.findByText("You got one! Order confirmed.", {}, { timeout: 5000 })).toBeTruthy();
    expect(mocked.attemptPurchase).toHaveBeenCalledWith("arief");
    expect(mocked.fetchUserStatus).toHaveBeenCalledWith("arief");
  });

  it("submits with the Enter key too", async () => {
    mocked.fetchSale.mockResolvedValue(sale());
    mocked.attemptPurchase.mockResolvedValue({ status: "already_purchased" });
    render(<App />);
    await screen.findByText("Live now");

    typeUserId("arief");
    fireEvent.submit(buyButton().closest("form")!);

    expect(await screen.findByText("You already secured one. One per person.")).toBeTruthy();
  });

  it("doesn't submit while the button is disabled", async () => {
    mocked.fetchSale.mockResolvedValue(sale({ status: "ended" }));
    render(<App />);
    await screen.findByText("Ended");

    typeUserId("arief");
    fireEvent.submit(buyButton().closest("form")!);

    expect(mocked.attemptPurchase).not.toHaveBeenCalled();
  });

  it.each([
    ["already_purchased", "You already secured one. One per person.", "info"],
    ["sold_out", "Sold out. Better luck next time.", "warning"],
    ["rate_limited", "Slow down, too many attempts. Try again shortly.", "error"],
    ["unavailable", "Something's down on our end, try again in a moment.", "error"],
    ["invalid_user", "Enter a valid username or email first.", "error"],
  ] as const)("tells the user when the purchase comes back %s", async (status, text, tone) => {
    mocked.fetchSale.mockResolvedValue(sale());
    mocked.attemptPurchase.mockResolvedValue({ status });
    render(<App />);
    await screen.findByText("Live now");

    typeUserId("arief");
    fireEvent.click(buyButton());

    expect(await within(message()).findByText(text)).toBeTruthy();
    expect(message().className).toContain(`buy__message--${tone}`);
  });
});
