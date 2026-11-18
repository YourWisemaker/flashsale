import { expect, test, type Page } from "@playwright/test";
import { SEED_PRODUCT, seedSale } from "./seed-helper.js";

const MINUTE = 60_000;
const buyButton = (page: Page) => page.getByRole("button", { name: "Buy Now" });
const message = (page: Page) => page.getByRole("status");

test("a user can buy, gets confirmed, and can't buy a second time", async ({ page }) => {
  await seedSale({ totalStock: 5 });

  await page.goto("/");
  await expect(page.getByText("Live now")).toBeVisible();
  await expect(page.getByText("5 left of 5")).toBeVisible();

  await page.getByLabel("Username or email").fill(`e2e-${Date.now()}`);
  await buyButton(page).click();

  await expect(message(page)).toHaveText("Purchase received, confirming...");
  // Worker needs a moment to pick the job off the queue and confirm it.
  await expect(message(page)).toHaveText("You got one! Order confirmed.", { timeout: 10_000 });
  await expect(page.getByText("4 left of 5")).toBeVisible({ timeout: 5_000 });

  await buyButton(page).click();
  await expect(message(page)).toHaveText("You already secured one. One per person.");
});

test("loses the race for the last unit and is told it's sold out", async ({ page, request }) => {
  await seedSale({ totalStock: 1 });
  // Freeze timers so the 2s status poll can't refresh the page between
  // "someone else buys" and "this user clicks". That's the real race:
  // the page still says live, the server has already sold out.
  await page.clock.install();

  await page.goto("/");
  await expect(page.getByText("Live now")).toBeVisible();

  const rival = await request.post("http://localhost:3000/api/purchase", { data: { userId: `rival-${Date.now()}` } });
  expect(rival.status()).toBe(202);

  await page.getByLabel("Username or email").fill(`e2e-loser-${Date.now()}`);
  await buyButton(page).click();
  await expect(message(page)).toHaveText("Sold out. Better luck next time.");
});

test("shows sold out and disables buying once stock is gone", async ({ page }) => {
  await seedSale({ totalStock: 0 });

  await page.goto("/");
  await expect(page.getByTestId("sale-status")).toHaveText("Sold out");
  await expect(page.getByText("None left")).toBeVisible();

  await page.getByLabel("Username or email").fill(`e2e-${Date.now()}`);
  await expect(buyButton(page)).toBeDisabled();
});

test("shows a countdown and disables buying before the sale starts", async ({ page }) => {
  await seedSale({ totalStock: 5, startsInMs: 5 * MINUTE, endsInMs: 10 * MINUTE });

  await page.goto("/");
  await expect(page.getByText("Starts soon")).toBeVisible();
  await expect(page.getByLabel(/^Starts in \d\d:\d\d:\d\d$/)).toBeVisible();

  await page.getByLabel("Username or email").fill(`e2e-${Date.now()}`);
  await expect(buyButton(page)).toBeDisabled();
});

test("tells the user the sale has ended and disables buying", async ({ page }) => {
  await seedSale({ totalStock: 5, startsInMs: -10 * MINUTE, endsInMs: -MINUTE });

  await page.goto("/");
  await expect(page.getByTestId("sale-status")).toHaveText("Ended");
  await expect(page.getByText("The sale has ended.")).toBeVisible();

  await page.getByLabel("Username or email").fill(`e2e-${Date.now()}`);
  await expect(buyButton(page)).toBeDisabled();
});

test("renders the seeded product with real, loaded photos", async ({ page }) => {
  await seedSale({ totalStock: 5 });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: SEED_PRODUCT.name })).toBeVisible();
  await expect(page.getByText("$89.00")).toBeVisible();
  await expect(page.getByText("40% OFF")).toBeVisible();

  const main = page.getByRole("img", { name: SEED_PRODUCT.images[0].alt });
  await expect(main).toBeVisible();
  expect(await main.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(800);

  await page.getByRole("button", { name: `Show photo 2: ${SEED_PRODUCT.images[1].alt}` }).click();
  await expect(page.getByRole("img", { name: SEED_PRODUCT.images[1].alt })).toBeVisible();
});

test("ships SEO basics: meta tags, canonical, favicon, robots, schema.org data", async ({ page, request }) => {
  await seedSale({ totalStock: 5 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: SEED_PRODUCT.name })).toBeVisible();

  await expect(page).toHaveTitle(`${SEED_PRODUCT.name} | Arief Shop`);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /one pair per customer/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "http://localhost:5173/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", "http://localhost:5173/products/hi-top-right.jpg");

  const jsonLd = JSON.parse((await page.locator("#product-jsonld").textContent()) ?? "{}");
  expect(jsonLd).toMatchObject({ "@type": "Product", sku: SEED_PRODUCT.sku, offers: { availability: "https://schema.org/InStock" } });

  const favicon = await request.get("/favicon.svg");
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()["content-type"]).toContain("image/svg+xml");
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /api/");
});

test("can't be framed by another site (anti-clickjacking)", async ({ page, request }) => {
  const res = await request.get("/");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");

  // A hostile page trying to embed the shop: the browser must refuse.
  await page.setContent('<iframe id="victim" src="http://localhost:5173/" width="800" height="600"></iframe>');
  await page.waitForTimeout(1500);
  await expect(page.frameLocator("#victim").getByRole("button", { name: "Buy Now" })).toHaveCount(0);
});
