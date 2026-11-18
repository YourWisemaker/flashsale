import { expect, test } from "@playwright/test";
import { seedSale } from "./seed-helper.js";

const MINUTE = 60_000;
const buyButton = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Buy Now" });

test("a user can buy, gets confirmed, and can't buy a second time", async ({ page }) => {
  await seedSale({ totalStock: 5 });
  const userId = `e2e-${Date.now()}`;

  await page.goto("/");
  await expect(page.getByText("ACTIVE")).toBeVisible();
  await expect(page.getByText("Stock left: 5 / 5")).toBeVisible();

  await page.getByLabel("User identifier").fill(userId);
  await buyButton(page).click();

  await expect(page.locator(".message")).toHaveText("Purchase received, confirming...");
  // Worker needs a moment to pick the job off the queue and confirm it.
  await expect(page.locator(".message")).toHaveText("You got one! Order confirmed.", { timeout: 10_000 });

  await buyButton(page).click();
  await expect(page.locator(".message")).toHaveText("You already secured one. One per person.");
});

test("loses the race for the last unit and is told it's sold out", async ({ page, request }) => {
  await seedSale({ totalStock: 1 });
  // Freeze timers so the 2s status poll can't refresh the page between
  // "someone else buys" and "this user clicks". That's the real race:
  // the page still says active, the server has already sold out.
  await page.clock.install();

  await page.goto("/");
  await expect(page.getByText("ACTIVE")).toBeVisible();

  const rival = await request.post("http://localhost:3000/api/purchase", { data: { userId: `rival-${Date.now()}` } });
  expect(rival.status()).toBe(202);

  await page.getByLabel("User identifier").fill(`e2e-loser-${Date.now()}`);
  await buyButton(page).click();
  await expect(page.locator(".message")).toHaveText("Sold out. Better luck next time.");
});

test("shows sold out and disables buying once stock is gone", async ({ page }) => {
  await seedSale({ totalStock: 0 });

  await page.goto("/");
  await expect(page.getByText("SOLD_OUT")).toBeVisible();
  await expect(page.getByText("Sold out. Better luck next time.")).toBeVisible();

  await page.getByLabel("User identifier").fill(`e2e-${Date.now()}`);
  await expect(buyButton(page)).toBeDisabled();
});

test("shows a countdown and disables buying before the sale starts", async ({ page }) => {
  await seedSale({ totalStock: 5, startsInMs: 5 * MINUTE, endsInMs: 10 * MINUTE });

  await page.goto("/");
  await expect(page.getByText("UPCOMING")).toBeVisible();
  await expect(page.getByText(/Starts in \d\d:\d\d/)).toBeVisible();

  await page.getByLabel("User identifier").fill(`e2e-${Date.now()}`);
  await expect(buyButton(page)).toBeDisabled();
});

test("tells the user the sale has ended and disables buying", async ({ page }) => {
  await seedSale({ totalStock: 5, startsInMs: -10 * MINUTE, endsInMs: -MINUTE });

  await page.goto("/");
  await expect(page.getByText("ENDED", { exact: true })).toBeVisible();
  await expect(page.getByText("The sale has ended.")).toBeVisible();

  await page.getByLabel("User identifier").fill(`e2e-${Date.now()}`);
  await expect(buyButton(page)).toBeDisabled();
});
