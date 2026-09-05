import { test, expect, type Page, type Route } from "../_cloudinary-stub";
import { MAX_ORDER_RANGES_PER_DAY, nextOrderRange } from "../../../lib/order-window";

/**
 * Spec:     manual/dashboard-order-window — MEH-1249 chunk 11e of 12
 * Purpose:  Convert the CONVERT-verdict rows of the order-window card
 *           ("מתי מקבלים הזמנות", anchor #order-window) in the edit tab:
 *             MT:MEH-1869   several ranges per day — add / cap / remove /
 *                           overlap / adjacency / legacy seed
 * Touches:  NO real backend. Reads are route-fulfilled as chunks 11a–11d do.
 *           `PUT /producers/me` is CAPTURED and fulfilled, and the GET stub
 *           answers with the LAST captured PUT merged in — so a reload after a
 *           save exercises the seed parser on what the client sent. That is a
 *           client round-trip, not persistence: no byte reaches a server.
 * Does NOT: cover the public-page status between ranges (MT:MEH-1869:8 —
 *           /producer/[id] page group, lib/orderWindow status helper), or
 *           mobile (MT:MEH-1869:9). Does NOT cover MT:MEH-1870 / MT:MEH-1403 /
 *           MT:MEH-1884:6-7 — see the drift block: the surfaces those rows
 *           describe no longer exist.
 * Related:  app/[locale]/producer/dashboard/edit/OrderWindowEditor.jsx ·
 *           lib/order-window.js (the rules the editor mirrors; imported here
 *           so the expectations derive from the code, not from the doc)
 * History:  MEH-1249 chunk 11e.
 *
 * ─── MEH-1968 three conditions, stated because the rule requires it ────────
 *   1. No backend BEHAVIOUR is asserted — which rows render, what the client
 *      blocks, and what it puts on the wire.
 *   2. `order_window` is a JSONB with a backend validator
 *      (backend/app/schemas/schemas.py `_order_window_validator`) that
 *      lib/order-window.js mirrors by declaration; the PUT contract is the
 *      same one chunks 11c/11d capture.
 *   3. Reaching "three ranges on Sunday" honestly means PUTting to the shared
 *      staging backend CI points at — forbidden (Sapir 13/07).
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 * D1 · MT:MEH-1870 (8 rows) describes a "שעות פתיחה" editor with "+ טווח נוסף",
 *      a cap of 3 and an overlap rule. That editor does not exist: since
 *      MEH-2142 `opening_hours` rides the primary location and is a single
 *      free-text <TextInput> inside the location form's details
 *      (LocationsEditor.jsx:885). cards.jsx:1126-1133 records the removal:
 *      "HoursCard — the thin wrapper around HoursEditor — stood here", and
 *      lib/hours-serialize.js is "deliberately LEFT in place even though
 *      HoursEditor was its only UI consumer". The only consumer of the
 *      `add_range` copy key is OrderWindowEditor. Rows 3-4 (public strip)
 *      belong to /producer/[id].
 * D2 · MT:MEH-1403 (3 rows) describes a preset toggle «א׳–ה׳ 9:00–18:00» /
 *      «ניקוי השעות». No component renders either string (grep over app/,
 *      components/, messages/). Same removal as D1.
 * D3 · MT:MEH-1884:6-7 describe a grey hint under the hours card's subtitle for
 *      a business that never saved hours. No consumer of that copy exists.
 * D4 · MT:MEH-1869:1 says the second range opens "13:00–15:00" after a
 *      09:00–13:00 range. The rule is lib/order-window.js `nextOrderRange` —
 *      asserted from that function, whatever its duration constant is.
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const IMG = "https://res.cloudinary.com/demo/image/upload/p.jpg";
const PRIMARY_LOC = { id: 1, kind: "branch", is_primary: true, lat: 32.08, lng: 34.78, opening_hours: "א-ה 09:00-17:00" };

const BASE = {
  id: 7,
  name: "מאפיית שקד",
  city: "חיפה",
  phone: "050-1234567",
  primary_contact_method: "whatsapp",
  whatsapp: "050-1234567",
  phone_verified: true,
  has_physical_location: true,
  offers_delivery: false,
  delivery_nationwide: false,
  delivery_areas: [],
  categories: [{ id: 2, name: "לחמים ואפייה" }],
  images: [{ id: 1, url: IMG }],
  products: [{ id: 1, name: "חלה" }],
  short_description: "מאפייה שכונתית",
  description: "מאפייה שכונתית קטנה בלב חיפה",
  locations: [PRIMARY_LOC],
};

type Range = { open: string; close: string };
/** The current array shape: Sunday, one range. */
const ONE_RANGE = { ...BASE, order_window: { sunday: [{ open: "09:00", close: "13:00" }] as Range[] } };
/** The pre-MEH-1869 shape: a bare object, not an array. */
const LEGACY = { ...BASE, order_window: { sunday: { open: "09:00", close: "13:00" } } };

type EditOpts = { profile?: Record<string, unknown>; puts?: Array<Record<string, unknown>> };

async function stubEdit(page: Page, opts: EditOpts = {}): Promise<void> {
  const { profile: p = ONE_RANGE, puts } = opts;
  const status = "approved";
  let lastPut: Record<string, unknown> = {};
  await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) =>
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ id: 42, email: "owner@example.com", name: "שקד", role: "producer", producer_id: 7 }) }));
  await page.route("**/favorites**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  for (const sub of ["products", "locations", "name-change-requests", "kashrut-requests"]) {
    await page.route(`**/producers/me/${sub}**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  }
  await page.route("**/producers/me/dashboard", (r) =>
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ producer: { id: 7, name: BASE.name, slug: null, status, availability_state: "accepting_orders", vacation_until: null }, stats: {} }) }));
  await page.route("**/producers/me/analytics**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ profile_views: { total: 0, last_7d: 0 }, whatsapp_clicks: { total: 0, last_7d: 0 }, contact_clicks: { total: 0, last_7d: 0 },
        average_rating: null, total_reviews: 0, rank_in_city: null, conversion_rate: "0%", profile_strength: 10, top_cities: [], follower_count: 0, new_followers_this_week: 0 }) }));
  await page.route("**/producers/me", (r: Route) => {
    if (r.request().method() === "PUT") {
      const body = r.request().postDataJSON() as Record<string, unknown>;
      puts?.push(body);
      lastPut = { ...lastPut, ...body };
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...p, status, ...lastPut }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...p, status, ...lastPut }) });
  });
}

const card = (page: Page) => page.getByTestId("accordion-order-window");
const body = (page: Page) => page.locator('#order-window [role="region"]');
const dayToggle = (page: Page, day: string) => body(page).getByRole("checkbox", { name: `${day} — מקבלים הזמנות ביום זה` });
const from = (page: Page, day: string, n: number) => body(page).getByLabel(`${day} פתיחה ${n}`, { exact: true });
const to = (page: Page, day: string, n: number) => body(page).getByLabel(`${day} סגירה ${n}`, { exact: true });
const addRange = (page: Page, i: number) => page.getByTestId(`order-window-add-range-${i}`);
const removeBtns = (page: Page) => body(page).locator('[data-testid^="order-window-remove-"]');
const alerts = (page: Page) => body(page).getByRole("alert");
/** Exact alternation — `name: "שמירה"` alone is a substring match blind to other labels (chunk 11d). */
const saveBtn = (page: Page) => body(page).getByRole("button", { name: /^(שמירה|בשמירה…)$/ });
const OVERLAP = "הטווחים חייבים להיות לפי הסדר ובלי חפיפה ביניהם";
const SUN = "יום ראשון";

async function openWindow(page: Page): Promise<void> {
  await page.goto("/producer/dashboard/edit#order-window");
  await expect(card(page), "control: #order-window never came on screen — every assertion here is void").toBeVisible({ timeout: 15_000 });
  await expect(body(page)).toBeVisible();
  await expect(dayToggle(page, SUN), "fixture precondition: Sunday is seeded open").toBeChecked();
  await expect(from(page, SUN, 1)).toHaveValue("09:00");
  await expect(to(page, SUN, 1)).toHaveValue("13:00");
}

// ── MT:MEH-1869 — several ranges per day ───────────────────────────────────

test.describe("order-window card — several ranges per day", () => {
  // MT:MEH-1869:1 — drift D4: the new range continues from the previous one, per the library rule.
  test("«+ טווח נוסף» adds a second row that starts where the first one ended", async ({ page }) => {
    await stubEdit(page);
    await openWindow(page);
    await expect(removeBtns(page), "a single range has no X").toHaveCount(0);

    await addRange(page, 0).click();
    const expected = nextOrderRange({ from: "09:00", to: "13:00" }) as { from: string; to: string };
    expect(expected, "control: the library must produce a next range for 09:00–13:00").not.toBeNull();
    await expect(from(page, SUN, 2)).toHaveValue(expected.from);
    await expect(to(page, SUN, 2)).toHaveValue(expected.to);
    expect(expected.from).toBe("13:00");
    await expect(alerts(page)).toHaveCount(0);
    await expect(saveBtn(page)).toBeEnabled();
  });

  // MT:MEH-1869:2 — two ranges go on the wire in order, and come back in order after a reload.
  test("two ranges save as an ordered array and re-seed the editor after a reload", async ({ page }) => {
    const puts: Array<Record<string, unknown>> = [];
    await stubEdit(page, { puts });
    await openWindow(page);
    await addRange(page, 0).click();
    await from(page, SUN, 2).fill("16:00");
    await to(page, SUN, 2).fill("20:00");
    await saveBtn(page).click();
    await expect.poll(() => puts.length, { message: "the PUT never left the browser" }).toBe(1);
    await expect(page.getByTestId("order-window-save-success")).toHaveText("חלון ההזמנות נשמר");
    expect(puts[0]).toEqual({ order_window: { sunday: [{ open: "09:00", close: "13:00" }, { open: "16:00", close: "20:00" }] } });

    await page.reload();
    await openWindow(page);
    await expect(from(page, SUN, 2)).toHaveValue("16:00");
    await expect(to(page, SUN, 2)).toHaveValue("20:00");
    await expect(from(page, SUN, 3)).toHaveCount(0);
  });

  // MT:MEH-1869:3 — the cap, read from the library, then observed in the DOM.
  test("at the cap the add button disappears and every range has an X", async ({ page }) => {
    await stubEdit(page);
    await openWindow(page);
    expect(MAX_ORDER_RANGES_PER_DAY, "control: the cap this test observes").toBe(3);
    for (let n = 1; n < MAX_ORDER_RANGES_PER_DAY; n++) await addRange(page, 0).click();
    await expect(from(page, SUN, MAX_ORDER_RANGES_PER_DAY)).toBeVisible();
    await expect(addRange(page, 0)).toHaveCount(0);
    await expect(removeBtns(page)).toHaveCount(MAX_ORDER_RANGES_PER_DAY);
  });

  // MT:MEH-1869:4 — removing the middle range keeps the others; a lone range has no X.
  test("the X removes only its own range, and the last range cannot be removed", async ({ page }) => {
    await stubEdit(page);
    await openWindow(page);
    await addRange(page, 0).click();
    await addRange(page, 0).click();
    await from(page, SUN, 3).fill("18:00");
    await to(page, SUN, 3).fill("21:00");

    await page.getByTestId("order-window-remove-0-1").click();
    await expect(from(page, SUN, 3)).toHaveCount(0);
    await expect(from(page, SUN, 1)).toHaveValue("09:00");
    await expect(from(page, SUN, 2)).toHaveValue("18:00");
    await expect(to(page, SUN, 2)).toHaveValue("21:00");

    await page.getByTestId("order-window-remove-0-1").click();
    await expect(from(page, SUN, 2)).toHaveCount(0);
    await expect(removeBtns(page)).toHaveCount(0);
  });

  // MT:MEH-1869:5 — an overlap is named on the row and blocks the save client-side.
  test("an overlapping range shows the overlap message and the save never leaves", async ({ page }) => {
    const puts: Array<Record<string, unknown>> = [];
    await stubEdit(page, { puts });
    await openWindow(page);
    await addRange(page, 0).click();
    await from(page, SUN, 2).fill("12:00");
    await expect(alerts(page)).toHaveText([OVERLAP]);

    await saveBtn(page).click();
    // The click surfaces the same reason as the form-level error too — that is the
    // observable proof the handler ran and stopped, before we check the wire.
    await expect(alerts(page)).toHaveCount(2);
    expect(puts.length, "a blocked save must not PUT").toBe(0);
  });

  // MT:MEH-1869:6 — touching ranges are a sequence, not an overlap.
  test("a range that starts exactly when the previous one ends saves without an error", async ({ page }) => {
    const puts: Array<Record<string, unknown>> = [];
    await stubEdit(page, { puts });
    await openWindow(page);
    await addRange(page, 0).click();
    await from(page, SUN, 2).fill("13:00");
    await to(page, SUN, 2).fill("17:00");
    await expect(alerts(page)).toHaveCount(0);
    await saveBtn(page).click();
    await expect.poll(() => puts.length, { message: "the PUT never left the browser" }).toBe(1);
    expect(puts[0]).toEqual({ order_window: { sunday: [{ open: "09:00", close: "13:00" }, { open: "13:00", close: "17:00" }] } });
  });

  // MT:MEH-1869:7 — a pre-array record loads as one range, clean and not dirty.
  test("a legacy single-object record opens as one range with nothing to save", async ({ page }) => {
    await stubEdit(page, { profile: LEGACY });
    await openWindow(page);
    await expect(from(page, SUN, 2)).toHaveCount(0);
    await expect(alerts(page)).toHaveCount(0);
    await expect(removeBtns(page)).toHaveCount(0);
    await expect(saveBtn(page), "loading a legacy record must not read as a change").toBeDisabled();
    await expect(page.getByTestId("order-window-empty")).toHaveCount(0);
  });
});
