/**
 * MEH-3021 — a business page with a long product list shows 6 rows on the
 * phone / 8 on desktop, then «הצגת כל {count} המוצרים» / «הצגת פחות».
 *
 * ─── WHAT IS INTERCEPTED, and why this is the MEH-1968 exception ───────────
 *
 * The page's rendered tree is CLIENT-fetched (`hooks/useProducerData.js`
 * `api.get('/producers/{id}')`). This spec lets that request reach the REAL
 * backend, takes the real payload, and appends synthetic products to its
 * `products` array before handing it to the page. Everything else on the page
 * (events, reviews, similar businesses) is untouched.
 *
 * The three MEH-1968 conditions (e2e/CLAUDE.md), all of which hold:
 *   1. No backend behaviour is asserted. The subject is a frontend state
 *      machine: how many rows render, what the toggle does, where a deep link
 *      lands. The backend has no say in any of it.
 *   2. The contract is pinned: `ProducerOut.products` (`ProductOut`, OpenAPI
 *      snapshot `backend/openapi.json`), and the payload here IS the real
 *      payload with rows added, so every other field keeps its real shape.
 *   3. The unmocked alternative burns a shared resource. No seeded business
 *      has more than 8 products (DEMO_PRODUCTS = 4, GOLDEN_PRODUCTS = 2), and
 *      admin cannot create products, so a real long list means writing 9+
 *      products into the shared demo owner's business on the staging backend
 *      while other specs in the same run read that business.
 *
 * Selectors: data-testid only. Copy is read from he.json, never typed here.
 */
import type { Page, Route } from "@playwright/test";

import { expect, test } from "./_cloudinary-stub";
import { pickProducer, watchPageErrors, type FeedProducer } from "./_producer-fixture";
import he from "../../messages/he.json";

const SYNTHETIC = 12;
const MOBILE_ROWS = 6;
const DESKTOP_ROWS = 8;

type Product = { id: string; name: string; image_url: string | null; price_min: number };

function syntheticProducts(): Product[] {
  return Array.from({ length: SYNTHETIC }, (_, i) => ({
    id: `e2e-meh3021-${i + 1}`,
    name: `מוצר בדיקה ${i + 1}`,
    // No photo on any of them: photo-first ordering would otherwise move them
    // around the real rows and the deep-link target's position would depend
    // on the seed.
    image_url: null,
    price_min: 10 + i,
    price_max: null,
    description: null,
  })) as Product[];
}

/** Real payload + synthetic rows. Returns the full grid as the page will see it. */
async function serveLongList(page: Page, producer: FeedProducer): Promise<void> {
  const exact = new RegExp(`/api/producers/${producer.id}(\\?.*)?$`);
  await page.route(exact, async (route: Route) => {
    const real = await route.fetch();
    const body = await real.json();
    body.products = [...(body.products || []), ...syntheticProducts()];
    await route.fulfill({ response: real, json: body });
  });
}

const showAll = (n: number) =>
  he.producer.detail.sections.products.show_all.replace("{count}", String(n));

let producer: FeedProducer;

test.beforeAll(async ({ request }) => {
  producer = await pickProducer(request, { label: "any approved business", matches: () => true });
});

test.describe("MEH-3021 — long product list collapses", () => {
  test("closed shows the first rows, open shows all, close returns", async ({ page }, info) => {
    watchPageErrors(page);
    await serveLongList(page, producer);
    await page.goto(`/producer/${producer.id}`);

    const toggle = page.getByTestId("products-toggle");
    await expect(toggle).toBeVisible({ timeout: 20_000 });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    const rows = page.getByTestId("product-row");
    const total = await rows.count(); // DOM rows while closed: 8 (2 hidden on phone)
    expect(total, "closed list renders the desktop preview").toBe(DESKTOP_ROWS);
    const isMobile = (page.viewportSize()?.width ?? 1280) < 768;
    const visible = await rows.evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).offsetParent !== null).length,
    );
    expect(visible, `visible rows on ${info.project.name}`).toBe(isMobile ? MOBILE_ROWS : DESKTOP_ROWS);

    const label = (await toggle.textContent())?.trim() ?? "";
    const m = label.match(/\d+/);
    expect(m, `toggle label carries a count: «${label}»`).not.toBeNull();
    const count = Number(m![0]);
    expect(label).toBe(showAll(count));

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveText(he.producer.detail.sections.products.show_less);
    await expect(page.getByTestId("product-row").filter({ hasText: "מוצר בדיקה 12" })).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("product-row")).toHaveCount(DESKTOP_ROWS);
  });

  test("a deep link to a collapsed product opens the list and its sheet", async ({ page }) => {
    watchPageErrors(page);
    await serveLongList(page, producer);
    await page.goto(`/producer/${producer.id}?product=e2e-meh3021-${SYNTHETIC}`);

    await expect(page.getByTestId("product-sheet")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("product-sheet")).toContainText(`מוצר בדיקה ${SYNTHETIC}`);
    await expect(page.getByTestId("products-toggle")).toHaveAttribute("aria-expanded", "true");
  });
});
