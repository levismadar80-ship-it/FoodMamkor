import { test, expect, type Page } from "../_cloudinary-stub";
import type { Route } from "@playwright/test";

/**
 * Spec:     manual/dashboard-products
 * Purpose:  MEH-1249 chunk 11m — the DASHBOARD rows of MANUAL_TESTING «Product
 *           price validation (MEH-295 backend)»: the products card in the edit
 *           tab — mount, empty state, add (single price / range / legacy
 *           fallback), the four client-side price validations, labels that stay
 *           put while typing, the submit copy, the diet chips on add and edit,
 *           and the inline edit flow (open, save, legacy note, validation,
 *           cancel, switching rows) plus delete-with-dialog.
 * Touches:  no backend. /producers/me/products is a STATEFUL stub — GET lists,
 *           POST appends (with an id), PUT merges, DELETE removes — and every
 *           write is captured, so "add → the row shows the price" exercises the
 *           real list refresh on what the client sent. The edit tab's other
 *           reads (/producers/me, the child cards) are fulfilled as in chunks
 *           11c/11h. Default CI target.
 * Does NOT: touch the backend rows (1-7 — pytest / psql), the layout rows
 *           (20, 29-30), the dietary-cleanup smoke rows (21-27), or the
 *           consumer / register / admin surfaces (34-39) — other page groups.
 * Related:  components/ProductsSection.jsx (validateProductForm, handleAdd,
 *           startEdit/saveEdit, the two dialogs), lib/utils.js formatPriceRange,
 *           app/[locale]/producer/dashboard/edit/page.js (anchorId="products").
 * History:  MEH-1249 chunk 11m (creation).
 *
 * ON MOCKING INSIDE flows/ — the three conditions in frontend/e2e/CLAUDE.md
 * (MEH-1968), stated rather than assumed:
 *   1. No assertion is about backend BEHAVIOUR — which form renders, what the
 *      client validates before sending, what it sends, how a fixed list is
 *      shown. The server's own price rules are rows 1-7 and backend/tests'.
 *   2. The contract is pinned: ProductOut / ProductCreate (schemas.py) and the
 *      MEH-1938 product routes under /producers/me/products.
 *   3. Unmocked, every add / edit / delete here is a WRITE against the shared
 *      staging backend CI points at (e2e.yml:229-233) — the class Sapir's
 *      13/07 ruling forbids.
 *
 * MEH-1619 — shown discriminating (table in the PR body): three surgical
 * breaks, each red exactly one test here, the rest green.
 */

const IMG = "https://res.cloudinary.com/demo/image/upload/p.jpg";
const PROFILE = {
  id: 7, name: "מאפיית שקד", city: "חיפה", phone: "050-1234567", primary_contact_method: "whatsapp", whatsapp: "050-1234567",
  phone_verified: true, has_physical_location: true, offers_delivery: false, delivery_nationwide: false, delivery_areas: [],
  categories: [{ id: 2, name: "לחמים ואפייה" }], images: [IMG], products: [],
  short_description: "מאפייה שכונתית", description: "מאפייה שכונתית קטנה בלב חיפה",
  locations: [{ id: 1, kind: "branch", is_primary: true, lat: 32.08, lng: 34.78, opening_hours: "א-ה 09:00-17:00" }],
  status: "approved", top_product_id: null,
};

type Product = Record<string, unknown> & { id: number; name: string };
const product = (over: Partial<Product> & { id: number; name: string }): Product => ({
  description: null, image_url: null, price_min: 45, price_max: null, price_range: null,
  is_gluten_free: false, is_vegan: false, is_vegetarian: false, is_lactose_free: false, is_no_added_sugar: false, ...over,
});
type Rec = { method: string; url: string; body: unknown };

/** Seeds the edit tab; `rows` is the products "table" the stub mutates. */
async function stubEdit(page: Page, rows: Product[], writes: Rec[] = [], opts: { postDelayMs?: number } = {}) {
  const json = (r: Route, s: number, b: unknown) =>
    r.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
  await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) => json(r, 200, { id: 42, email: "owner@example.com", name: "שקד", role: "producer", producer_id: 7 }));
  await page.route("**/users/me/favorites", (r) => json(r, 200, []));
  await page.route("**/api/group-buys**", (r) => json(r, 200, []));
  for (const sub of ["locations", "name-change-requests", "kashrut-requests"]) {
    await page.route(`**/producers/me/${sub}**`, (r) => json(r, 200, []));
  }
  await page.route("**/producers/me/dashboard", (r) =>
    json(r, 200, { producer: { id: 7, name: PROFILE.name, slug: null, status: "approved", availability_state: "accepting_orders", vacation_until: null }, stats: {} }));
  await page.route("**/producers/me/analytics**", (r) =>
    json(r, 200, { profile_views: { total: 0, last_7d: 0 }, whatsapp_clicks: { total: 0, last_7d: 0 }, contact_clicks: { total: 0, last_7d: 0 },
      average_rating: null, total_reviews: 0, rank_in_city: null, conversion_rate: "0%", profile_strength: 60, top_cities: [], follower_count: 0, new_followers_this_week: 0 }));
  let nextId = 1000;
  await page.route("**/producers/me/products", async (r: Route) => {
    const m = r.request().method();
    if (m === "GET") return json(r, 200, rows);
    if (m === "POST") {
      const body = r.request().postDataJSON() as Record<string, unknown>;
      writes.push({ method: "POST", url: "/producers/me/products", body });
      const created = product({ id: nextId++, name: String(body.name), ...body });
      rows.push(created);
      if (opts.postDelayMs) await new Promise((res) => setTimeout(res, opts.postDelayMs));
      return json(r, 201, created);
    }
    return r.continue();
  });
  await page.route("**/producers/me/products/*", (r: Route) => {
    const m = r.request().method();
    const id = Number(r.request().url().split("/").pop());
    const i = rows.findIndex((x) => x.id === id);
    if (m === "PUT") {
      const body = r.request().postDataJSON() as Record<string, unknown>;
      writes.push({ method: "PUT", url: `/producers/me/products/${id}`, body });
      rows[i] = { ...rows[i], ...body }; return json(r, 200, rows[i]);
    }
    if (m === "DELETE") { writes.push({ method: "DELETE", url: `/producers/me/products/${id}`, body: null }); rows.splice(i, 1); return r.fulfill({ status: 204, body: "" }); }
    return r.continue();
  });
  await page.route("**/producers/me", (r: Route) => json(r, 200, { ...PROFILE, products: rows }));
}

const card = (page: Page) => page.getByTestId("accordion-products");
const body = (page: Page) => page.locator('#products [role="region"]');
const addForm = (page: Page) => body(page).locator("form");
const rowOf = (page: Page, name: string) =>
  body(page).locator('[data-testid="product-row"], [data-testid="product-row-top"]').filter({ hasText: name });

async function openProducts(page: Page) {
  await page.goto("/producer/dashboard/edit#products");
  await expect(card(page), "control: the products card never came on screen — every assertion here is void").toBeVisible({ timeout: 15_000 });
  await expect(body(page)).toBeVisible();
}
async function openAddForm(page: Page) {
  await body(page).getByRole("button", { name: /הוסיפו מוצר/ }).first().click();
  await expect(addForm(page).getByText("מוצר חדש")).toBeVisible();
}
const ERR = {
  required: "הכניסו מחיר", tooLow: "המחיר חייב להיות לפחות 1 ₪", tooHigh: "המחיר לא יכול לעבור 10,000 ₪", maxBelowMin: "מחיר עד חייב להיות גבוה ממחיר מ-",
};

// ── MT rows 8-13 — mount, empty state, add, display ─────────────────────────

test.describe("products card — mount and add", () => {
  // MT:MEH-295:8 — the section is a card of the edit tab, headed «מוצרים», with its "where it appears" line.
  test("the products card mounts in the edit tab with its heading and where-line", async ({ page }) => {
    await stubEdit(page, [product({ id: 1, name: "חלה" })]);
    await openProducts(page);
    await expect(card(page)).toContainText("מוצרים");
    await expect(body(page).getByText("המוצרים יוצגו ברשימה בעמוד שלך — עם השם, התיאור והמחיר שתמלאי כאן.")).toBeVisible();
    await expect(rowOf(page, "חלה")).toBeVisible();
  });

  // MT:MEH-295:9 — zero products: the empty state with its sample card, and the single CTA. Live copy differs from the doc's.
  test("with no products the empty state shows the sample card and one CTA", async ({ page }) => {
    await stubEdit(page, []);
    await openProducts(page);
    await expect(body(page).getByText("הוסיפו את המוצר הראשון שלכם")).toBeVisible();
    await expect(body(page).getByText("ריבת תאנים ביתית")).toBeVisible();
    await expect(body(page).getByText("₪28 לצנצנת")).toBeVisible();
    // The header «הוסיפו מוצר» is suppressed while empty (MEH-1097 F14): exactly one add affordance.
    await expect(body(page).getByRole("button", { name: /הוסיפו מוצר/ })).toHaveCount(1);
    await expect(body(page).getByRole("button", { name: "+ הוסיפו מוצר ראשון" })).toBeVisible();
    await expect(body(page).getByTestId("top-product-hint")).toHaveText("הוסיפו מוצר כדי לבחור מוצר מוביל.");
  });

  // MT:MEH-295:11 — a range renders «50₪–80₪» and posts both prices.
  test("adding a range shows «50₪–80₪» on the new row and posts both prices", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, [product({ id: 1, name: "חלה" })], writes);
    await openProducts(page);
    await openAddForm(page);
    await addForm(page).getByLabel("שם המוצר").fill("טסט-טווח");
    await addForm(page).getByLabel(/^מחיר מ-/).fill("50");
    await addForm(page).getByLabel(/^מחיר עד/).fill("80");
    await addForm(page).getByRole("button", { name: "הוסיפו מוצר" }).click();
    await expect(page.getByText("המוצר נוסף")).toBeVisible();
    await expect(rowOf(page, "טסט-טווח")).toContainText("50₪–80₪");
    expect(writes.map((w) => w.method)).toEqual(["POST"]);
    expect(writes[0].body).toMatchObject({ name: "טסט-טווח", price_min: 50, price_max: 80 });
  });

  // MT:MEH-295:12 — a single price renders «45₪» and posts price_max: null.
  test("adding a single price shows «45₪» and posts price_max null", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, [product({ id: 1, name: "חלה" })], writes);
    await openProducts(page);
    await openAddForm(page);
    await addForm(page).getByLabel("שם המוצר").fill("טסט-יחיד");
    await addForm(page).getByLabel(/^מחיר מ-/).fill("45");
    await addForm(page).getByRole("button", { name: "הוסיפו מוצר" }).click();
    await expect(rowOf(page, "טסט-יחיד")).toContainText("45₪");
    await expect(rowOf(page, "טסט-יחיד")).not.toContainText("–");
    expect(writes[0].body).toMatchObject({ name: "טסט-יחיד", price_min: 45, price_max: null });
  });

  // MT:MEH-295:13 — a legacy row (price_min NULL, price_range set) shows the legacy string as-is.
  test("a legacy product with only price_range shows that string on its row", async ({ page }) => {
    await stubEdit(page, [product({ id: 1, name: "ריבה ישנה", price_min: null, price_range: "₪45/ק״ג" })]);
    await openProducts(page);
    await expect(rowOf(page, "ריבה ישנה")).toContainText("₪45/ק״ג");
  });
});

// ── MT rows 14-19 — the add form's client-side validation and copy ──────────

test.describe("products card — add form validation", () => {
  const cases = [
    { row: 14, title: "an empty min price is refused with «הכניסו מחיר»", min: "", max: "", msg: ERR.required },
    { row: 15, title: "a min price below 1 is refused", min: "0", max: "", msg: ERR.tooLow },
    { row: 16, title: "a price over the 10,000 cap is refused", min: "10001", max: "", msg: ERR.tooHigh },
    { row: 17, title: "a max below the min is refused", min: "50", max: "30", msg: ERR.maxBelowMin },
  ];
  for (const c of cases) {
    // MT:MEH-295:14 · MT:MEH-295:15 · MT:MEH-295:16 · MT:MEH-295:17 — one test per message; none may POST.
    test(`row ${c.row}: ${c.title}`, async ({ page }) => {
      const writes: Rec[] = [];
      await stubEdit(page, [product({ id: 1, name: "חלה" })], writes);
      await openProducts(page);
      await openAddForm(page);
      await addForm(page).getByLabel("שם המוצר").fill("טסט-ולידציה");
      if (c.min !== "") await addForm(page).getByLabel(/^מחיר מ-/).fill(c.min);
      if (c.max !== "") await addForm(page).getByLabel(/^מחיר עד/).fill(c.max);
      await addForm(page).getByRole("button", { name: "הוסיפו מוצר" }).click();
      await expect(addForm(page).getByText(c.msg)).toBeVisible();
      const posted = await expect.poll(() => writes.length, { timeout: 1_500 }).toBeGreaterThan(0).then(() => true).catch(() => false);
      expect(posted, "a client-side validation failure must not POST").toBe(false);
    });
  }

  // MT:MEH-295:18 — the labels stay above the fields while typing (no placeholder-only form).
  test("labels stay visible above name, description and price while typing", async ({ page }) => {
    await stubEdit(page, [product({ id: 1, name: "חלה" })]);
    await openProducts(page);
    await openAddForm(page);
    await addForm(page).getByLabel("שם המוצר").fill("לחם מחמצת");
    await addForm(page).getByLabel("תיאור קצר").fill("כיכר 750 גרם");
    await addForm(page).getByLabel(/^מחיר מ-/).fill("32");
    for (const label of ["שם המוצר", "תיאור קצר", "מחיר מ-", "מחיר עד"]) {
      await expect(addForm(page).locator("label").filter({ hasText: label })).toBeVisible();
    }
  });

  // MT:MEH-295:19 — submit copy. Doc: «הוסיפי מוצר» / «מוסיפה...» (feminine); live: «הוסיפו מוצר» / «בהוספה...».
  test("the submit reads «הוסיפו מוצר», and «בהוספה...» while the POST is in flight", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, [product({ id: 1, name: "חלה" })], writes, { postDelayMs: 1_200 });
    await openProducts(page);
    await openAddForm(page);
    const submit = addForm(page).getByRole("button", { name: /^(הוסיפו מוצר|בהוספה\.\.\.)$/ });
    await expect(submit).toHaveText("הוסיפו מוצר");
    await addForm(page).getByLabel("שם המוצר").fill("טסט-קופי");
    await addForm(page).getByLabel(/^מחיר מ-/).fill("12");
    await submit.click();
    await expect(submit).toHaveText("בהוספה...");
    await expect(submit).toBeDisabled();
    await expect(rowOf(page, "טסט-קופי")).toBeVisible();
  });
});

// ── MT rows 28, 31-33 — the diet chips on add and edit ──────────────────────

test.describe("products card — diet chips", () => {
  const CHIPS = ["ללא גלוטן", "טבעוני", "צמחוני", "ללא לקטוז", "ללא סוכר מוסף"];

  // MT:MEH-295:28 — the doc says three checkboxes; live: FIVE aria-pressed chips under «סימוני תזונה (אופציונלי)».
  test("the add form carries five diet chips, all unpressed, under the diet heading", async ({ page }) => {
    await stubEdit(page, [product({ id: 1, name: "חלה" })]);
    await openProducts(page);
    await openAddForm(page);
    const group = addForm(page).getByRole("group", { name: "סימוני תזונה (אופציונלי)" });
    await expect(group.getByRole("button")).toHaveCount(5);
    for (const label of CHIPS) await expect(group.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "false");
    await expect(addForm(page).getByRole("checkbox")).toHaveCount(0);
  });

  // MT:MEH-295:31 — pressing «טבעוני» puts is_vegan on the wire, and only that flag.
  test("pressing «טבעוני» posts is_vegan true and leaves the other flags false", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, [product({ id: 1, name: "חלה" })], writes);
    await openProducts(page);
    await openAddForm(page);
    await addForm(page).getByLabel("שם המוצר").fill("סלט טבעוני");
    await addForm(page).getByLabel(/^מחיר מ-/).fill("30");
    const vegan = addForm(page).getByRole("button", { name: "טבעוני" });
    await vegan.click();
    await expect(vegan).toHaveAttribute("aria-pressed", "true");
    await addForm(page).getByRole("button", { name: "הוסיפו מוצר" }).click();
    await expect(rowOf(page, "סלט טבעוני")).toBeVisible();
    expect(writes[0].body).toMatchObject({ is_vegan: true, is_gluten_free: false, is_vegetarian: false, is_lactose_free: false, is_no_added_sugar: false });
  });

  // MT:MEH-295:32 · MT:MEH-295:33 — the edit form shows the chips with the product's state; unpressing puts is_vegan false on the PUT.
  test("the edit form shows the five chips with the saved state, and unpressing «טבעוני» PUTs is_vegan false", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, [product({ id: 1, name: "חלה", is_vegan: true })], writes);
    await openProducts(page);
    await rowOf(page, "חלה").getByRole("button", { name: "ערכו חלה" }).click();
    const form = body(page).locator("form");
    const vegan = form.getByRole("button", { name: "טבעוני" });
    await expect(form.getByRole("group", { name: "סימוני תזונה (אופציונלי)" }).getByRole("button")).toHaveCount(5);
    await expect(vegan).toHaveAttribute("aria-pressed", "true");
    await vegan.click();
    await expect(vegan).toHaveAttribute("aria-pressed", "false");
    await form.getByRole("button", { name: "שמרו שינויים" }).click();
    await expect(page.getByText("המוצר עודכן")).toBeVisible();
    expect(writes.map((w) => w.method)).toEqual(["PUT"]);
    expect(writes[0].body).toMatchObject({ is_vegan: false });
  });
});

// ── MT rows 40-46 + 10 — the inline edit flow and delete ────────────────────

test.describe("products card — edit flow", () => {
  const two = () => [product({ id: 1, name: "חלה", price_min: 18, price_max: 24, description: "חלה קלועה" }), product({ id: 2, name: "לחם שיפון", price_min: 32 })];

  // MT:MEH-295:40 — «ערכו» swaps the row for the inline form, prefilled.
  test("«ערכו» replaces the row with a prefilled inline form headed «עריכת מוצר»", async ({ page }) => {
    await stubEdit(page, two());
    await openProducts(page);
    await rowOf(page, "חלה").getByRole("button", { name: "ערכו חלה" }).click();
    const form = body(page).locator("form");
    await expect(form.getByText("עריכת מוצר")).toBeVisible();
    await expect(form.getByLabel("שם המוצר")).toHaveValue("חלה");
    await expect(form.getByLabel("תיאור קצר")).toHaveValue("חלה קלועה");
    await expect(form.getByLabel(/^מחיר מ-/)).toHaveValue("18");
    await expect(form.getByLabel(/^מחיר עד/)).toHaveValue("24");
    // The row itself is gone while editing; the other row is untouched.
    await expect(rowOf(page, "חלה")).toHaveCount(0);
    await expect(rowOf(page, "לחם שיפון")).toBeVisible();
  });

  // MT:MEH-295:41 — edit the name only → «שמרו שינויים» → display mode with the new name, one PUT.
  test("changing only the name and saving returns the row in display mode with the new name", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, two(), writes);
    await openProducts(page);
    await rowOf(page, "חלה").getByRole("button", { name: "ערכו חלה" }).click();
    const form = body(page).locator("form");
    await form.getByLabel("שם המוצר").fill("חלה קלועה לשבת");
    await form.getByRole("button", { name: "שמרו שינויים" }).click();
    await expect(rowOf(page, "חלה קלועה לשבת")).toBeVisible();
    await expect(body(page).locator("form")).toHaveCount(0);
    expect(writes.map((w) => [w.method, w.url])).toEqual([["PUT", "/producers/me/products/1"]]);
    expect(writes[0].body).toMatchObject({ name: "חלה קלועה לשבת", price_min: 18, price_max: 24 });
  });

  // MT:MEH-295:42 — editing a legacy product shows the legacy note and an empty min.
  test("editing a legacy product shows the legacy-price note and an empty min field", async ({ page }) => {
    await stubEdit(page, [product({ id: 3, name: "ריבה ישנה", price_min: null, price_range: "₪45/ק״ג" })]);
    await openProducts(page);
    await rowOf(page, "ריבה ישנה").getByRole("button", { name: "ערכו ריבה ישנה" }).click();
    const form = body(page).locator("form");
    await expect(form.getByText("המחיר הקיים: ₪45/ק״ג (לא בפורמט החדש — הזינו מחיר מספרי לעדכון)")).toBeVisible();
    await expect(form.getByLabel(/^מחיר מ-/)).toHaveValue("");
  });

  // MT:MEH-295:43 · MT:MEH-295:44 — the same validation runs on edit; nothing is PUT.
  for (const c of [
    { row: 43, title: "min 0 on edit is refused", min: "0", max: "", msg: ERR.tooLow },
    { row: 44, title: "max below min on edit is refused", min: "50", max: "30", msg: ERR.maxBelowMin },
  ]) {
    test(`row ${c.row}: ${c.title}`, async ({ page }) => {
      const writes: Rec[] = [];
      await stubEdit(page, two(), writes);
      await openProducts(page);
      await rowOf(page, "חלה").getByRole("button", { name: "ערכו חלה" }).click();
      const form = body(page).locator("form");
      await form.getByLabel(/^מחיר מ-/).fill(c.min);
      await form.getByLabel(/^מחיר עד/).fill(c.max);
      await form.getByRole("button", { name: "שמרו שינויים" }).click();
      await expect(form.getByText(c.msg)).toBeVisible();
      const put = await expect.poll(() => writes.length, { timeout: 1_500 }).toBeGreaterThan(0).then(() => true).catch(() => false);
      expect(put, "a client-side validation failure must not PUT").toBe(false);
    });
  }

  // MT:MEH-295:45 — «בטלו» closes the form; the row shows the ORIGINAL name; nothing is PUT.
  test("cancelling an edit closes the form and keeps the original name, with no PUT", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, two(), writes);
    await openProducts(page);
    await rowOf(page, "חלה").getByRole("button", { name: "ערכו חלה" }).click();
    const form = body(page).locator("form");
    await form.getByLabel("שם המוצר").fill("שם שלא יישמר");
    await form.getByRole("button", { name: "בטלו" }).click();
    await expect(body(page).locator("form")).toHaveCount(0);
    await expect(rowOf(page, "חלה")).toBeVisible();
    await expect(rowOf(page, "שם שלא יישמר")).toHaveCount(0);
    expect(writes).toHaveLength(0);
  });

  // MT:MEH-295:46 — opening B's editor while A's is open returns A to display mode; one form at a time.
  test("opening a second row's editor returns the first to display mode", async ({ page }) => {
    await stubEdit(page, two());
    await openProducts(page);
    await rowOf(page, "חלה").getByRole("button", { name: "ערכו חלה" }).click();
    await expect(body(page).locator("form")).toHaveCount(1);
    await expect(rowOf(page, "חלה")).toHaveCount(0);
    await rowOf(page, "לחם שיפון").getByRole("button", { name: "ערכו לחם שיפון" }).click();
    await expect(body(page).locator("form")).toHaveCount(1);
    await expect(body(page).locator("form").getByLabel("שם המוצר")).toHaveValue("לחם שיפון");
    await expect(rowOf(page, "חלה")).toBeVisible();
    await expect(rowOf(page, "לחם שיפון")).toHaveCount(0);
  });

  // MT:MEH-295:10 — the end-to-end row's third leg: delete asks in a dialog; cancel keeps the row, confirm DELETEs and removes it.
  test("delete asks in a dialog — cancel keeps the row and sends nothing; confirm DELETEs and removes it", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, two(), writes);
    await openProducts(page);
    await rowOf(page, "לחם שיפון").getByRole("button", { name: "מחקו לחם שיפון" }).click();
    const dialog = page.getByRole("dialog", { name: 'למחוק את "לחם שיפון"?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("הפעולה לא ניתנת לביטול.")).toBeVisible();
    await dialog.getByRole("button", { name: "ביטול" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(rowOf(page, "לחם שיפון")).toBeVisible();
    expect(writes, "cancel must not DELETE").toHaveLength(0);

    await rowOf(page, "לחם שיפון").getByRole("button", { name: "מחקו לחם שיפון" }).click();
    await page.getByRole("dialog", { name: 'למחוק את "לחם שיפון"?' }).getByRole("button", { name: "מחיקה" }).click();
    await expect(page.getByText("המוצר נמחק")).toBeVisible();
    await expect(rowOf(page, "לחם שיפון")).toHaveCount(0);
    await expect(rowOf(page, "חלה")).toBeVisible();
    expect(writes.map((w) => [w.method, w.url])).toEqual([["DELETE", "/producers/me/products/2"]]);
  });
});
