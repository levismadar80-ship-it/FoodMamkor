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
/** `DEMO_SLUG` in backend/scripts/seed_demo_business.py. */
const DEMO_SLUG = "ruach-hasadeh";

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
  // MEH-3435: "any approved business" picked the lowest id in the feed, which
  // can be a business another spec creates and removes mid-run — the detail
  // fetch then answered 404. The seeded demo business (DEMO_SLUG in
  // backend/scripts/seed_demo_business.py, seeded by
  // scripts/e2e/start-local-backend.sh and on staging) is never removed.
  producer = await pickProducer(request, {
    label: `the seeded demo business (slug ${DEMO_SLUG})`,
    matches: (p) => p.slug === DEMO_SLUG,
  });
});

test.describe("MEH-3021 — long product list collapses", () => {
  test("closed shows the first rows, open shows all, close returns", async ({ page }, info) => {
    watchPageErrors(page);
    await serveLongList(page, producer);

    // MEH-3379 — the same single-budget chain MEH-3148 fixed at :109, in the
    // sibling test I missed inside this very file. One 20 s budget covered
    // SSR, hydration, the stubbed `/api/producers/<id>` refetch that
    // `serveLongList` installs, and then the render — so a slow earlier link
    // was reported as «products-toggle not found». Measured for :109 at 1440:
    // unthrottled the stubbed data lands at ~1.1 s, at CPU x10 with 60 ms per
    // chunk at ~4.8 s; on a 2-core runner carrying two workers, a backend and
    // Postgres, the chain is what overruns 20 s, not the toggle. Seen on
    // PR #4635's run (shard 1/2): 21.5 s, then green on retry in 1.8 s.
    //
    // Arm the listener BEFORE the goto so the payload is awaited where it
    // actually sits in the chain, then give the toggle its own full 20 s from
    // data-in-hand. The budget is re-pointed, not widened — a toggle that
    // never renders still reds — and the 200 control keeps a bad stub from
    // letting the next assertion ask the wrong question.
    const payload = page.waitForResponse(
      (r) => new RegExp(`/api/producers/${producer.id}$`).test(new URL(r.url()).pathname),
      { timeout: 20_000 },
    );
    await page.goto(`/producer/${producer.id}`);
    expect((await payload).status(), "the stubbed long list was served").toBe(200);

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

    // MEH-3148: the one 20 s budget here covered a serial chain — the stubbed
    // `/api/producers/<id>` response, hydration, the deep-link effect
    // (ProducerSections.jsx:332-345) and then the sheet — and named the LAST
    // link whenever an earlier one was slow, which is why the log said
    // «product-sheet not found» and the retry passed in 2.1 s. Timed at 1440
    // against a seeded local stack: unthrottled the sheet is up ~1.1 s after
    // `goto`; at CPU x10 with 60 ms per chunk it is ~5.6 s. The fetch is the
    // part that stretches on a 2-core runner carrying two workers, a backend
    // and Postgres.
    //
    // The listener is armed BEFORE the goto, so the payload is awaited where it
    // actually is in the chain rather than polled for afterwards. The sheet then
    // keeps its own full 20 s, measured from data-in-hand — the budget is
    // re-pointed, NOT widened, and that distinction is the whole change: an
    // earlier draft gated on a product row instead, which only attaches because
    // the deep-link effect expanded the list, so it sat DOWNSTREAM of the thing
    // it was meant to gate and handed the chain 40 s. The independent reviewer
    // (rule 5a) caught that; this is the corrected form.
    const payload = page.waitForResponse(
      (r) => new RegExp(`/api/producers/${producer.id}$`).test(new URL(r.url()).pathname),
      { timeout: 20_000 },
    );
    await page.goto(`/producer/${producer.id}?product=e2e-meh3021-${SYNTHETIC}`);
    const res = await payload;
    // Control: a non-200 here would leave the page with the real short list and
    // nothing for the deep link to open, so the sheet assertion below would be
    // asking the wrong question.
    expect(res.status(), "the stubbed long list was served").toBe(200);

    await expect(page.getByTestId("product-sheet")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("product-sheet")).toContainText(`מוצר בדיקה ${SYNTHETIC}`);
    await expect(page.getByTestId("products-toggle")).toHaveAttribute("aria-expanded", "true");
  });
});

/**
 * MEH-3055 — the owner's groups become filter chips. Same interception as
 * above (MEH-1968, conditions in the header): the real payload plus two
 * groups and products sorted into them.
 */
test.describe("MEH-3055 — product group chips", () => {
  test("2 groups with products: chips filter the list, «all» restores", async ({ page }) => {
    watchPageErrors(page);
    const exact = new RegExp(`/api/producers/${producer.id}(\\?.*)?$`);
    await page.route(exact, async (route: Route) => {
      const real = await route.fetch();
      const body = await real.json();
      body.product_groups = [
        { id: "e2e-g1", name: "קבוצת בדיקה א" },
        { id: "e2e-g2", name: "קבוצת בדיקה ב" },
      ];
      body.top_product_id = null;
      body.top_product_name = null;
      body.products = syntheticProducts()
        .slice(0, 4)
        .map((p, i) => ({ ...p, group_id: i < 3 ? "e2e-g1" : "e2e-g2" }));
      await route.fulfill({ response: real, json: body });
    });
    await page.goto(`/producer/${producer.id}`);

    const chips = page.getByTestId("product-group-chip");
    await expect(chips).toHaveCount(3, { timeout: 20_000 }); // all + 2 groups, no «more»
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("product-row")).toHaveCount(4);

    await chips.nth(2).click();
    await expect(chips.nth(2)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("product-row")).toHaveCount(1);

    await chips.first().click();
    await expect(page.getByTestId("product-row")).toHaveCount(4);
  });
});
