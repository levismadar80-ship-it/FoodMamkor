import { test, expect, type Page, type Route } from "../_cloudinary-stub";

/**
 * Spec:     manual/dashboard-offer-groupbuy — MEH-1249 chunk 11i of 12
 * Purpose:  Convert the CONVERT-verdict rows of two small forms:
 *             MT:MEH-1898   the offer card's fifth type, "הטבה בניסוח חופשי":
 *                           six options, threshold fields unmounted, headline
 *                           required, error clears, a stale threshold is not
 *                           sent
 *             MT:MEH-992    the group-buy creation form: ₪ adornment, the
 *                           price-rule helper that turns red pre-submit, the
 *                           deadline helper, the one-line concept intro
 * Touches:  NO real backend. Reads route-fulfilled as chunks 11a–11h do;
 *           `PUT /producers/me` is captured and fulfilled; `/api/group-buys*`
 *           answers an empty list. No byte reaches a server.
 * Does NOT: cover the public-page and card rendering of a custom offer
 *           (MT:MEH-1898:5-6 — /producer/[id], home, /producers), mobile
 *           (:8), or the server's 422 for an unknown offer_type (:9 —
 *           backend/tests). The group-buy form is never submitted here.
 * Related:  app/[locale]/producer/dashboard/edit/cards.jsx (OffersCard :2019,
 *           OFFER_TYPES :2007, MAX_OFFER_HEADLINE :2016) ·
 *           app/[locale]/producer/dashboard/group-buys/page.js
 * History:  MEH-1249 chunk 11i.
 *
 * ─── MEH-1968 three conditions, stated because the rule requires it ────────
 *   1. No backend BEHAVIOUR is asserted — which controls mount, which button is
 *      blocked, what the client puts on the wire.
 *   2. `active_offer` is a Pydantic sub-model on PUT /producers/me; the group
 *      buys list has a response model; both are the same interception set the
 *      earlier chunks use.
 *   3. Writing an offer to the shared staging backend is a destructive write
 *      (Sapir 13/07).
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 * D1 · MT:MEH-1898:1 says the dropdown's LAST option is the custom one. The
 *      select renders «אין הטבה פעילה» first (value "") and then OFFER_TYPES in
 *      code order, with `custom` last among the five — asserted as the exact
 *      six-option order the code renders.
 * D2 · MT:MEH-992:1 says the ₪ sits "on the right of the field". The Input's
 *      `startAdornment` is at the inline START, which in this RTL page IS the
 *      right; the field itself is `dir="ltr"` so the number reads LTR beside
 *      it. Asserted as "the adornment renders and the input is LTR", not as a
 *      pixel side.
 * D3 · `#offer` is a DEAD deep link: ANCHOR_TO_KEY (page.js:100-116) has no
 *      `offer` entry, though KEY_TO_ANCHOR (:184) and KEY_TO_GROUP (:223) know
 *      the key. The mirror of chunk 11g's business-name finding, added to the
 *      same card (MEH-2262). One test asserts the correct behaviour under
 *      test.fail(); the rest open the card through `?group=location`.
 * D4 · MT:MEH-992 opens the form via «+ קבוצת רכש חדשה». That toggle renders
 *      only when at least one group buy exists (page.js:340); with none, the
 *      empty state's «+ צרו קבוצה ראשונה» is the way in. The 0-items path is
 *      what this spec exercises.
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const IMG = "https://res.cloudinary.com/demo/image/upload/p.jpg";
const BASE = {
  id: 7, name: "מאפיית שקד", city: "חיפה", phone: "050-1234567", primary_contact_method: "whatsapp", whatsapp: "050-1234567",
  phone_verified: true, has_physical_location: true, offers_delivery: false, delivery_nationwide: false, delivery_areas: [],
  categories: [{ id: 2, name: "לחמים ואפייה" }], images: [IMG], products: [{ id: 1, name: "חלה" }],
  short_description: "מאפייה שכונתית", description: "מאפייה שכונתית קטנה בלב חיפה",
  locations: [{ id: 1, kind: "branch", is_primary: true, lat: 32.08, lng: 34.78, opening_hours: "א-ה 09:00-17:00" }],
  active_offer: null as unknown,
};

type Rec = { method: string; url: string; body: unknown };
async function stubEdit(page: Page, opts: { profile?: Record<string, unknown>; writes?: Rec[] } = {}): Promise<void> {
  const p = opts.profile ?? BASE;
  const writes = opts.writes;
  let lastPut: Record<string, unknown> = {};
  const json = (r: Route, s: number, b: unknown) => r.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
  await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) => json(r, 200, { id: 42, email: "owner@example.com", name: "שקד", role: "producer", producer_id: 7 }));
  await page.route("**/favorites**", (r) => json(r, 200, []));
  await page.route("**/api/group-buys**", (r) => json(r, 200, []));
  // The child cards each read their own endpoint; unstubbed they 401 and bounce the tab to /login.
  for (const sub of ["products", "locations", "name-change-requests", "kashrut-requests"]) {
    await page.route(`**/producers/me/${sub}**`, (r) => json(r, 200, []));
  }
  await page.route("**/producers/me/dashboard", (r) =>
    json(r, 200, { producer: { id: 7, name: BASE.name, slug: null, status: "approved", availability_state: "accepting_orders", vacation_until: null }, stats: {} }));
  await page.route("**/producers/me/analytics**", (r) =>
    json(r, 200, { profile_views: { total: 0, last_7d: 0 }, whatsapp_clicks: { total: 0, last_7d: 0 }, contact_clicks: { total: 0, last_7d: 0 },
      average_rating: null, total_reviews: 0, rank_in_city: null, conversion_rate: "0%", profile_strength: 10, top_cities: [], follower_count: 0, new_followers_this_week: 0 }));
  await page.route("**/producers/me", (r: Route) => {
    if (r.request().method() === "PUT") {
      const body = r.request().postDataJSON() as Record<string, unknown>;
      writes?.push({ method: "PUT", url: "/producers/me", body });
      // Stateful: the next GET answers with this PUT merged in, so a reload re-seeds from it.
      lastPut = { ...lastPut, ...body };
    }
    return json(r, 200, { ...p, status: "approved", ...lastPut });
  });
}

// ── MT:MEH-1898 — the offer card ───────────────────────────────────────────

test.describe("offer card — the custom type", () => {
  const card = (page: Page) => page.getByTestId("accordion-offer");
  const body = (page: Page) => page.locator('#offer [role="region"]');
  const typeSelect = (page: Page) => page.getByTestId("offer-type-select");
  const threshold = (page: Page) => page.getByTestId("offer-threshold-input");
  const unit = (page: Page) => page.getByTestId("offer-unit-select");
  const headline = (page: Page) => page.getByTestId("offer-headline-input");
  const expires = (page: Page) => page.getByTestId("offer-expires-input");
  const save = (page: Page) => page.getByTestId("offer-save");
  const headlineError = (page: Page) => page.getByTestId("offer-headline-error");
  const REQUIRED = "להטבה בניסוח חופשי חייבת להיות כותרת";

  /** `#offer` is a dead deep link (drift D3 / MEH-2262): open the location group and the card by hand. */
  async function openOffer(page: Page) {
    await page.goto("/producer/dashboard/edit?group=location");
    await expect(page.getByTestId("group-location"), "control: the location group never rendered — every assertion here is void").toBeVisible({ timeout: 15_000 });
    await card(page).click();
    await expect(body(page)).toBeVisible();
  }

  // The deep-link contract: ANCHOR_TO_KEY (page.js:100-116) has no `offer` entry while
  // KEY_TO_ANCHOR (:184) and KEY_TO_GROUP (:223) know the key — the mirror of the
  // business-name gap. Correct behaviour asserted; expected to fail until fixed.
  test("#offer opens the offer card through the location group", async ({ page }) => {
    await stubEdit(page);
    await page.goto("/producer/dashboard/edit#offer");
    await expect(card(page)).toBeVisible({ timeout: 15_000 });
    await expect(card(page)).toHaveAttribute("aria-expanded", "true");
  });

  // MT:MEH-1898:1 — drift D1: six options, «אין הטבה פעילה» first, the five types after it, custom last.
  test("the type select holds the five types plus «אין הטבה פעילה» — six options, custom last", async ({ page }) => {
    await stubEdit(page);
    await openOffer(page);
    const options = typeSelect(page).locator("option");
    await expect(options).toHaveCount(6);
    await expect(options).toHaveText(["אין הטבה פעילה", "משלוח חינם", "מתנה", "הטבה להזמנה ראשונה", "הנחה באיסוף עצמי", "הטבה בניסוח חופשי"]);
    await expect(options.last()).toHaveAttribute("value", "custom");
  });

  // MT:MEH-1898:2 — the threshold pair is unmounted, not disabled.
  test("choosing the custom type removes the threshold amount and unit from the DOM", async ({ page }) => {
    await stubEdit(page);
    await openOffer(page);
    await typeSelect(page).selectOption("gift_above");
    await expect(threshold(page)).toBeVisible();
    await expect(unit(page)).toBeVisible();
    await typeSelect(page).selectOption("custom");
    await expect(threshold(page)).toHaveCount(0);
    await expect(unit(page)).toHaveCount(0);
    await expect(headline(page)).toBeVisible();
  });

  // MT:MEH-1898:3 — with a valid expiry and no headline the save is blocked and the reason is under the field.
  test("a custom offer with an expiry but no headline blocks the save and says why", async ({ page }) => {
    await stubEdit(page);
    await openOffer(page);
    await typeSelect(page).selectOption("custom");
    await expires(page).fill("2026-12-31");
    await expect(headlineError(page)).toHaveText(REQUIRED);
    await expect(save(page)).toBeDisabled();
  });

  // MT:MEH-1898:4 — typing a headline clears the error and unblocks.
  test("typing a headline clears the error and enables the save", async ({ page }) => {
    await stubEdit(page);
    await openOffer(page);
    await typeSelect(page).selectOption("custom");
    await expires(page).fill("2026-12-31");
    await expect(headlineError(page)).toBeVisible();
    await headline(page).fill("צנצנת דבש קטנה לכל הזמנה");
    await expect(headlineError(page)).toHaveCount(0);
    await expect(save(page)).toBeEnabled();
  });

  // MT:MEH-1898:7 — a threshold typed under a previous type is not sent once the type is custom.
  test("a threshold left over from «מתנה» is not saved once the type is custom", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, { writes });
    await openOffer(page);
    await typeSelect(page).selectOption("gift_above");
    await threshold(page).fill("150");
    await unit(page).selectOption("ils");
    await typeSelect(page).selectOption("custom");
    await headline(page).fill("קופון 10% על ההזמנה הבאה");
    await expires(page).fill("2026-12-31");
    await save(page).click();
    await expect.poll(() => writes.length, { message: "the PUT never left the browser" }).toBe(1);
    expect(writes[0].body).toEqual({
      active_offer: { offer_type: "custom", threshold_value: null, threshold_unit: null, headline: "קופון 10% על ההזמנה הבאה", expires_at: "2026-12-31" },
    });
  });
});

// ── MT:MEH-992 — the group-buy creation form ───────────────────────────────

test.describe("group-buy form — clarity", () => {
  async function openForm(page: Page) {
    await stubEdit(page);
    await page.goto("/producer/dashboard/group-buys");
    // With zero group buys the toggle is not rendered (page.js:340); the empty state's own
    // CTA opens the form — which is the real 0-items path, so that is what is exercised.
    const open = page.getByRole("button", { name: "+ צרו קבוצה ראשונה" });
    await expect(open, "control: the empty-state CTA never rendered — the page or its reads are broken").toBeVisible({ timeout: 15_000 });
    await open.click();
    await expect(page.getByRole("heading", { name: "קבוצת רכש חדשה" })).toBeVisible();
  }
  const regular = (page: Page) => page.getByRole("spinbutton", { name: "מחיר רגיל" });
  const group = (page: Page) => page.getByRole("spinbutton", { name: "מחיר קבוצתי" });
  const helper = (page: Page) => page.getByText("המחיר הקבוצתי חייב להיות נמוך מהמחיר הרגיל.");

  // MT:MEH-992:1 — drift D2: the ₪ adornment renders beside each LTR price field.
  test("both price fields carry a ₪ adornment and read LTR", async ({ page }) => {
    await openForm(page);
    for (const field of [regular(page), group(page)]) {
      await expect(field).toHaveAttribute("type", "number");
      // Direction is asserted as computed — the `dir` may sit on the input or its wrapper.
      expect(await field.evaluate((el) => getComputedStyle(el).direction)).toBe("ltr");
      // The adornment is the input's own sibling: Input.jsx:120-129 renders `startAdornment`
      // as an aria-hidden <span> right before the <input>, both direct children of one
      // `div.relative`. Reaching it through the parent — not an ancestor search for «₪» —
      // keeps the claim spatial: a ₪ rendered anywhere else in the form does not satisfy it.
      const adornment = field.locator("xpath=../span[@aria-hidden='true']");
      await expect(adornment).toHaveCount(1);
      await expect(adornment).toHaveText("₪");
      await expect(adornment).toBeVisible();
    }
  });

  // MT:MEH-992:2 — the price-rule helper is muted until the group price is not lower, then red — before any submit.
  test("the price-rule helper turns red when the group price is not below the regular price", async ({ page }) => {
    await openForm(page);
    await expect(helper(page)).toBeVisible();
    await expect(helper(page)).toHaveClass(/text-fg-muted/);
    await regular(page).fill("20");
    await group(page).fill("25");
    await expect(helper(page)).toHaveClass(/text-red-500/);
    await group(page).fill("15");
    await expect(helper(page)).toHaveClass(/text-fg-muted/);
  });

  // MT:MEH-992:3 — the deadline helper explains the date and names Israel time.
  test("the deadline field explains what the date means, in Israel time", async ({ page }) => {
    await openForm(page);
    await expect(page.getByRole("textbox", { name: "מועד אחרון" })).toHaveAttribute("type", "datetime-local");
    await expect(page.getByText("המועד האחרון להצטרפות, לפי שעון ישראל.")).toBeVisible();
  });

  // MT:MEH-992:4 — one line under the heading says what a group buy is.
  test("the form opens with a one-line concept intro under its heading", async ({ page }) => {
    await openForm(page);
    await expect(page.getByText("קבוצת רכש: כשמספיק לקוחות מצטרפים, כולם מקבלים מחיר סיטונאי.")).toBeVisible();
  });
});
