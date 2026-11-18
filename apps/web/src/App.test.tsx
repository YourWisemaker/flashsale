import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.js";
import * as api from "./api.js";
import type { SaleSnapshot } from "./api.js";

vi.mock("./api.js", () => ({
  fetchSale: vi.fn(),
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

const buyButton = () => screen.getByRole("button", { name: "Buy Now" }) as HTMLButtonElement;
const typeUserId = (value: string) => fireEvent.change(screen.getByLabelText("User identifier"), { target: { value } });

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("App", () => {
  it("shows the live sale status and stock", async () => {
    mocked.fetchSale.mockResolvedValue(sale());
    render(<App />);

    expect(await screen.findByText("ACTIVE")).toBeTruthy();
    expect(screen.getByText("Stock left: 42 / 100")).toBeTruthy();
    expect(screen.getByText(/Ends in \d\d:\d\d/)).toBeTruthy();
  });

  it("keeps Buy Now disabled until a user id is entered", async () => {
    mocked.fetchSale.mockResolvedValue(sale());
    render(<App />);
    await screen.findByText("ACTIVE");

    expect(buyButton().disabled).toBe(true);
    typeUserId("arief");
    expect(buyButton().disabled).toBe(false);
  });

  it("shows pending, then confirmed once the worker has written the order", async () => {
    mocked.fetchSale.mockResolvedValue(sale());
    mocked.attemptPurchase.mockResolvedValue({ status: "pending", stockLeft: 41 });
    mocked.fetchUserStatus.mockResolvedValue("confirmed");
    render(<App />);
    await screen.findByText("ACTIVE");

    typeUserId("arief");
    fireEvent.click(buyButton());

    expect(await screen.findByText("Purchase received, confirming...")).toBeTruthy();
    expect(await screen.findByText("You got one! Order confirmed.", {}, { timeout: 3000 })).toBeTruthy();
    expect(mocked.attemptPurchase).toHaveBeenCalledWith("arief");
    expect(mocked.fetchUserStatus).toHaveBeenCalledWith("arief");
  });

  it.each([
    ["already_purchased", "You already secured one. One per person."],
    ["sold_out", "Sold out. Better luck next time."],
    ["rate_limited", "Slow down, too many attempts. Try again shortly."],
    ["unavailable", "Something's down on our end, try again in a moment."],
  ] as const)("tells the user when the purchase comes back %s", async (status, message) => {
    mocked.fetchSale.mockResolvedValue(sale());
    mocked.attemptPurchase.mockResolvedValue({ status });
    render(<App />);
    await screen.findByText("ACTIVE");

    typeUserId("arief");
    fireEvent.click(buyButton());

    expect(await screen.findByText(message)).toBeTruthy();
  });

  it.each([
    ["sold_out", "Sold out. Better luck next time."],
    ["ended", "The sale has ended."],
  ] as const)("explains a %s sale and blocks buying", async (status, message) => {
    mocked.fetchSale.mockResolvedValue(sale({ status, stockLeft: 0 }));
    render(<App />);

    expect(await screen.findByText(message)).toBeTruthy();
    typeUserId("arief");
    expect(buyButton().disabled).toBe(true);
  });

  it("counts down to an upcoming sale and blocks buying", async () => {
    mocked.fetchSale.mockResolvedValue(sale({ status: "upcoming", startsAt: new Date(Date.now() + 5 * MINUTE).toISOString() }));
    render(<App />);

    expect(await screen.findByText(/Starts in \d\d:\d\d/)).toBeTruthy();
    typeUserId("arief");
    expect(buyButton().disabled).toBe(true);
  });

  it("warns when the sale status can't be loaded", async () => {
    mocked.fetchSale.mockRejectedValue(new Error("offline"));
    render(<App />);

    expect(await screen.findByText("Can't reach the sale status right now.")).toBeTruthy();
  });
});
