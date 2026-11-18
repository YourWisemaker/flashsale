import { expect, test, type Page } from "@playwright/test";
import { DEMO_USER, latestResetLink, SEED_PRODUCT, seedSale } from "./seed-helper.js";

const MINUTE = 60_000;
const buyButton = (page: Page) => page.getByRole("button", { name: "Buy Now" });
const message = (page: Page) => page.getByRole("status");

/** Logs in through the API; the session cookie lands in the page's browser context. */
async function logInAsDemo(page: Page) {
  const res = await page.request.post("/api/auth/login", { data: DEMO_USER });
  expect(res.status()).toBe(200);
}

async function logInThroughForm(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test.describe("buying", () => {
  test("logged out: Log in to buy, then back to the shop to buy, get confirmed, and be blocked a second time", async ({ page }) => {
    await seedSale({ totalStock: 5 });

    await page.goto("/");
    await expect(buyButton(page)).toHaveCount(0);
    await page.getByRole("link", { name: "Log in to buy" }).click();
    await expect(page).toHaveURL(/\/login\?next=\/$/);

    await logInThroughForm(page, DEMO_USER.email, DEMO_USER.password);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(`Buying as ${DEMO_USER.email}`)).toBeVisible();
    await expect(page.getByText("5 left of 5")).toBeVisible();

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
    await logInAsDemo(page);
    // Freeze timers so the 2s status poll can't refresh the page between
    // "someone else buys" and "this user clicks". That's the real race:
    // the page still says live, the server has already sold out.
    await page.clock.install();
    await page.goto("/");
    await expect(page.getByText("Live now")).toBeVisible();

    const rival = { email: `rival-${Date.now()}@example.com`, password: "rival-password" };
    expect((await request.post("http://localhost:3000/api/auth/register", { data: rival })).status()).toBe(201);
    expect((await request.post("http://localhost:3000/api/purchase")).status()).toBe(202);

    await buyButton(page).click();
    await expect(message(page)).toHaveText("Sold out. Better luck next time.");
  });

  test("shows sold out and disables buying once stock is gone", async ({ page }) => {
    await seedSale({ totalStock: 0 });
    await logInAsDemo(page);
    await page.goto("/");
    await expect(page.getByTestId("sale-status")).toHaveText("Sold out");
    await expect(page.getByText("None left")).toBeVisible();
    await expect(buyButton(page)).toBeDisabled();
  });

  test("shows a countdown and disables buying before the sale starts", async ({ page }) => {
    await seedSale({ totalStock: 5, startsInMs: 5 * MINUTE, endsInMs: 10 * MINUTE });
    await logInAsDemo(page);
    await page.goto("/");
    await expect(page.getByText("Starts soon")).toBeVisible();
    await expect(page.getByLabel(/^Starts in \d\d:\d\d:\d\d$/)).toBeVisible();
    await expect(buyButton(page)).toBeDisabled();
  });

  test("tells the user the sale has ended and disables buying", async ({ page }) => {
    await seedSale({ totalStock: 5, startsInMs: -10 * MINUTE, endsInMs: -MINUTE });
    await logInAsDemo(page);
    await page.goto("/");
    await expect(page.getByTestId("sale-status")).toHaveText("Ended");
    await expect(page.getByText("The sale has ended.")).toBeVisible();
    await expect(buyButton(page)).toBeDisabled();
  });
});

test.describe("accounts", () => {
  test("register a new account and land logged in on the shop", async ({ page }) => {
    await seedSale({ totalStock: 5 });
    const email = `new-${Date.now()}@example.com`;

    await page.goto("/");
    await page.getByRole("link", { name: "Sign up" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("a-good-password");
    await page.getByLabel("Confirm password").fill("a-good-password");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText(`Buying as ${email}`)).toBeVisible();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("link", { name: "Log in to buy" })).toBeVisible();
  });

  test("a wrong password shows one generic error", async ({ page }) => {
    await seedSale({ totalStock: 5 });
    await page.goto("/login");
    await logInThroughForm(page, DEMO_USER.email, "not-the-password");
    await expect(page.getByRole("alert")).toHaveText("Wrong email or password.");
  });

  test("forgot password: the emailed link sets a new password that works, once", async ({ page }) => {
    await seedSale({ totalStock: 5 });

    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.getByLabel("Email").fill(DEMO_USER.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If that email has an account, a reset link is on its way.")).toBeVisible();

    const link = await latestResetLink(DEMO_USER.email);
    expect(link.startsWith("http://localhost:5173/reset-password?token=")).toBe(true);
    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill("brand-new-password");
    await page.getByLabel("Confirm new password").fill("brand-new-password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText(`Buying as ${DEMO_USER.email}`)).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await page.goto("/login");
    await logInThroughForm(page, DEMO_USER.email, "brand-new-password");
    await expect(page.getByText(`Buying as ${DEMO_USER.email}`)).toBeVisible();

    // The link is single use.
    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill("third-password");
    await page.getByLabel("Confirm new password").fill("third-password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByRole("alert")).toHaveText("This reset link is invalid or has expired. Ask for a new one.");
  });
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
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /api/");
  expect(robots).toContain("Disallow: /login");

  await page.goto("/login");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
});

test("can't be framed by another site (anti-clickjacking)", async ({ page, request }) => {
  const res = await request.get("/");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");

  // A hostile page trying to embed the shop: the browser must refuse.
  await page.setContent('<iframe id="victim" src="http://localhost:5173/" width="800" height="600"></iframe>');
  await page.waitForTimeout(1500);
  await expect(page.frameLocator("#victim").getByRole("link", { name: "Log in to buy" })).toHaveCount(0);
});
