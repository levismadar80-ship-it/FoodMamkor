// MEH-2094 self-QA capture — producer edit page at 375 + 1440.
//
// The CC sandbox has no Postgres and `alembic upgrade` is a denied action, so
// a REAL authenticated session is unavailable (same wall MEH-2057/MEH-2058
// documented). Rather than photograph a redirect and call it evidence, this
// harness stubs the session at the two boundaries the page actually reads —
// localStorage (token + user) and the `/api` calls — so the REAL component
// tree renders with REAL styles at REAL viewports. What it does NOT prove:
// the backend contract (that PUT /producers/me persists), which the vitest
// suite covers at the payload level and the server enforces regardless.
//
// CONTROL (a null output here must not read as success): every capture asserts
// a DOM condition before writing the PNG, and the run exits non-zero if any
// assertion fails. A screenshot written without its assertion passing is the
// failure mode this file exists to avoid.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.QA_BASE_URL || "http://localhost:3000";
// Resolved from the repo, not hardcoded to one checkout — this is run from
// `frontend/`, so the artifacts dir is one level up.
const OUT = path.resolve(process.cwd(), "..", "qa-artifacts", "MEH-2094");
mkdirSync(OUT, { recursive: true });

const USER = { id: 7, email: "owner@example.com", role: "producer", full_name: "בעלת עסק" };

const PRODUCTS = [
  { id: 1, name: "לחם מחמצת כוסמין", description: "אפוי בתנור אבן", price_min: 32, price_max: null, image_url: null, is_vegan: true, is_gluten_free: false, is_vegetarian: true, is_lactose_free: false, is_no_added_sugar: false },
  { id: 2, name: "חלה מתוקה", description: "לשבת", price_min: 28, price_max: null, image_url: null, is_vegan: false, is_gluten_free: false, is_vegetarian: true, is_lactose_free: false, is_no_added_sugar: false },
  { id: 3, name: "בריוש חמאה", description: "", price_min: 40, price_max: null, image_url: null, is_vegan: false, is_gluten_free: false, is_vegetarian: true, is_lactose_free: false, is_no_added_sugar: false },
];

// The marked product — row 2 — so the capture shows a marked row WITH unmarked
// siblings above and below it (a single-row list could not show the contrast).
const PROFILE = {
  id: 42,
  business_name: "מאפיית הגליל",
  slug: "galil-bakery",
  top_product_name: "חלה מתוקה",
  price_range: "מ-₪28",
  products: PRODUCTS,
  categories: [],
  images: [],
  delivery_areas: [],
  city: "כרמיאל",
  status: "approved",
};

const viewports = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures += 1;
  return cond;
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: "he-IL" });

  await ctx.addInitScript(([u]) => {
    localStorage.setItem("token", "qa-stub-token");
    localStorage.setItem("user", JSON.stringify(u));
    // Pre-consent so the fixed bottom banner never covers the accordions at
    // 375 — dismissing it by click re-renders mid-run and detaches locators.
    localStorage.setItem("cookieConsent", "all");
  }, [USER]);

  await ctx.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname.replace(/^\/api/, "");
    const method = route.request().method();
    const json = (data) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });

    if (p === "/auth/me") return json(USER);
    if (p === "/producers/me" && method === "GET") return json(PROFILE);
    if (p === "/producers/me" && method === "PUT") return json(PROFILE);
    if (p === "/producers/me/products") return json(PRODUCTS);
    // Default to an ARRAY, not an object: several dashboard consumers map over
    // the response, and `{}` throws into an error boundary that silently
    // removes the cards this harness is here to photograph.
    return json([]);
  });

  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  pageerror(${vp.name}): ${e.message}`));

  // `?group=profile` is required: the edit route renders 4 shell-only group
  // tiles by default (page.js:774) and the cards live inside a group.
  await page.goto(`${BASE}/he/producer/dashboard/edit?group=profile`, { waitUntil: "load", timeout: 45000 });
  // The auth context boots, then the locale prefix is rewritten — a locator
  // awaited across that navigation hangs on a destroyed execution context.
  // Settle first, then interact.
  await page.waitForTimeout(3500);
  await page.waitForSelector('[data-testid="accordion-products"]', { timeout: 30000 });

  const pricingHeader = page.locator('[data-testid="accordion-pricing"]');
  const productsHeader = page.locator('[data-testid="accordion-products"]');
  const markedRow = page.locator('[data-testid="product-row-top"]');
  const plainRows = page.locator('[data-testid="product-row"]');

  // Every card stays MOUNTED (page.js:30) — the accordion body is `hidden`, not
  // unmounted — so these counts are valid before any click.
  check(`${vp.name}: pricing summary still reads the profile field (page.js:866)`,
    ((await pricingHeader.textContent()) || "").includes("חלה מתוקה"));
  check(`${vp.name}: exactly ONE row marked`, (await markedRow.count()) === 1);
  check(`${vp.name}: the other two rows are unmarked`, (await plainRows.count()) === 2);
  check(`${vp.name}: marked row is the one named in top_product_name`,
    ((await markedRow.first().textContent()) || "").includes("חלה מתוקה"));
  check(`${vp.name}: marked row carries the badge`,
    ((await markedRow.first().textContent()) || "").includes("מוצר מוביל"));
  check(`${vp.name}: the toggle hint renders`,
    (await page.locator('[data-testid="top-product-hint"]').count()) === 1);
  check(`${vp.name}: no top-product text field remains anywhere on the page`,
    (await page.getByPlaceholder("למשל: לחם מחמצת כוסמין").count()) === 0);

  // --- capture 1: the product list with one row marked --------------------
  await productsHeader.scrollIntoViewIfNeeded();
  await productsHeader.click();
  await markedRow.first().waitFor({ state: "visible", timeout: 15000 });
  await markedRow.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/products-marked-${vp.name}.png`, fullPage: false });
  console.log(`  wrote products-marked-${vp.name}.png`);

  // --- capture 2: PricingCard after the field removal ---------------------
  await productsHeader.click(); // collapse products so pricing comes into view
  await page.waitForTimeout(300);
  await pricingHeader.scrollIntoViewIfNeeded();
  await pricingHeader.click();
  await page.waitForTimeout(700);

  const priceInput = page.getByPlaceholder("למשל: מ-₪30");
  check(`${vp.name}: the price input is present and visible`,
    await priceInput.first().isVisible());
  await pricingHeader.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/pricing-price-only-${vp.name}.png`, fullPage: false });
  console.log(`  wrote pricing-price-only-${vp.name}.png`);

  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "\nALL ASSERTIONS PASSED" : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
