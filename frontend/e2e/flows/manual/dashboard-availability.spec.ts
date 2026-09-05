import { test, expect, type Page } from "../_cloudinary-stub";
import type { Route } from "@playwright/test";

/**
 * Spec:     manual/dashboard-availability
 * Purpose:  MEH-1249 chunk 11k — the dashboard rows of MANUAL_TESTING «MEH-291
 *           Phase 3 — Unified availability card»: the four-pill radiogroup, what
 *           each pill posts, the vacation mini-form revealed BEFORE any save
 *           (MEH-999), the empty-date guard, the saved return date surviving a
 *           reload, and switching back clearing it.
 * Touches:  no backend. GET /auth/me, /favorites, /producers/me{,/analytics}
 *           are fulfilled; GET /producers/me/dashboard is STATEFUL — it answers
 *           with whatever the last captured POST /producers/me/availability-state
 *           wrote, so a reload re-seeds from the "server" exactly as page.js:258
 *           expects. The token is seeded via addInitScript. Default CI target.
 * Does NOT: touch the other 15 rows of that section — ProducerCard dots,
 *           /producer/[id] banners, the admin form, the Friday strip and the
 *           /producers default-hide belong to other page groups. Does not assert
 *           the backend's vacation-date validation (backend/tests).
 * Related:  app/[locale]/producer/dashboard/page.js (AVAILABILITY_OPTIONS,
 *           setAvailabilityState, the vacation mini-form), lib/israel-date.js.
 * History:  MEH-1249 chunk 11k (creation).
 *
 * ON MOCKING INSIDE flows/ — the three conditions in frontend/e2e/CLAUDE.md
 * (MEH-1968), stated rather than assumed:
 *   1. No assertion is about backend BEHAVIOUR: which pill is checked, what the
 *      browser sends, what the mini-form does with an empty date, what a fixed
 *      dashboard payload renders. The server's own rules are backend/tests'.
 *   2. The contracts are pinned: POST /producers/me/availability-state takes
 *      {state, vacation_until?} (AvailabilityStateIn) and the dashboard payload
 *      is DashboardOut — both Pydantic models, both used by flows/34 already.
 *   3. Unmocked, every pill click is a WRITE against the shared staging backend
 *      CI points at (e2e.yml:229-233) — the class Sapir's 13/07 ruling forbids.
 *
 * MEH-1619 — shown discriminating (table in the PR body): three surgical breaks,
 * each red exactly one test here, the rest green.
 */

const IMG = "https://res.cloudinary.com/demo/image/upload/a.jpg";

const APPROVED = {
  id: 7, name: "מאפיית שקד", status: "approved", city: "חיפה", phone: "050-1234567", phone_verified: true,
  short_description: "מאפייה שכונתית", description: "מאפייה שכונתית קטנה בלב חיפה",
  images: [{ id: 1, url: IMG }], products: [{ id: 1, name: "חלה" }], categories: [{ id: 2, name: "לחמים ואפייה" }],
  locations: [{ id: 1, kind: "branch", is_primary: true, lat: 32.08, lng: 34.78, opening_hours: "א-ה 09:00-17:00" }],
  has_physical_location: true, offers_delivery: false, delivery_areas: [], slug: "shaked",
};

type Avail = { availability_state: string; vacation_until: string | null };
type Rec = { body: Record<string, unknown> };

/**
 * Seeds a producer session. `state` is the "server's" row: every POST to
 * availability-state is captured into `posts` AND applied to it, so the next
 * GET /producers/me/dashboard (a reload) answers with what was saved.
 */
async function stubDashboard(page: Page, state: Avail, posts: Rec[] = []) {
  const json = (r: Route, s: number, b: unknown) =>
    r.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
  await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) => json(r, 200, { id: 42, email: "owner@example.com", name: "שקד", role: "producer", producer_id: 7 }));
  await page.route("**/favorites**", (r) => json(r, 200, []));
  await page.route("**/producers/me/availability-state", (r: Route) => {
    if (r.request().method() !== "POST") return r.continue();
    const body = r.request().postDataJSON() as Record<string, unknown>;
    posts.push({ body });
    state.availability_state = String(body.state);
    state.vacation_until = body.state === "on_vacation" ? String(body.vacation_until ?? "") || null : null;
    return json(r, 200, { ...state });
  });
  await page.route("**/producers/me/dashboard", (r) =>
    json(r, 200, { producer: { id: 7, name: APPROVED.name, slug: APPROVED.slug, status: "approved", ...state }, stats: {} }));
  await page.route("**/producers/me/analytics**", (r) =>
    json(r, 200, { profile_views: { total: 3, last_7d: 1 }, whatsapp_clicks: { total: 1, last_7d: 0 }, contact_clicks: { total: 0, last_7d: 0 },
      average_rating: null, total_reviews: 0, rank_in_city: null, conversion_rate: "0%", profile_strength: 100, top_cities: [], follower_count: 0, new_followers_this_week: 0 }));
  await page.route("**/producers/me", (r) => json(r, 200, APPROVED));
}

/** The control: absence assertions are void if the Overview never rendered. */
async function openOverview(page: Page) {
  await page.goto("/producer/dashboard");
  await expect(page.getByTestId("producer-overview"), "the Overview never rendered — every absence assertion here is void")
    .toBeVisible({ timeout: 15_000 });
}

const OPTIONS = ["פתוח להזמנות", "זמין היום", "עמוס השבוע", "בהפסקה"] as const;
const group = (page: Page) => page.getByRole("radiogroup", { name: "מצב נוכחי" });
const pill = (page: Page, name: (typeof OPTIONS)[number]) => group(page).getByRole("radio", { name });
const dateInput = (page: Page) => page.getByLabel("חזרה ב:");
const saveVacation = (page: Page) => page.getByRole("button", { name: "שמרו" });
const futureIso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const REQUIRED_DATE = "בחרו תאריך חזרה כדי לעבור להפסקה";

async function expectOnlyChecked(page: Page, name: (typeof OPTIONS)[number]) {
  for (const o of OPTIONS) {
    await expect(pill(page, o)).toHaveAttribute("aria-checked", o === name ? "true" : "false");
  }
}

// MT:MEH-291:1 — one availability card, four pills. Live heading is «מצב נוכחי», not «מצב זמינות».
test("the card shows four pills in the locked order, the saved state checked and all enabled", async ({ page }) => {
  await stubDashboard(page, { availability_state: "accepting_orders", vacation_until: null });
  await openOverview(page);
  await expect(group(page)).toBeVisible();
  const radios = group(page).getByRole("radio");
  await expect(radios).toHaveCount(4);
  for (const [i, name] of OPTIONS.entries()) {
    await expect(radios.nth(i)).toHaveText(name);
    await expect(radios.nth(i)).toBeEnabled();
  }
  await expectOnlyChecked(page, "פתוח להזמנות");
  await expect(page.getByTestId("availability-disabled-hint")).toHaveCount(0);
});

// MT:MEH-291:2 · MT:MEH-291:3 · MT:MEH-291:4 — the three no-date states: pill lights, one POST, no date input.
// Doc labels «זמינה היום 🟢» / «עמוסה השבוע 🟠» — live copy is «זמין היום» / «עמוס השבוע», no emoji.
for (const [name, value] of [["פתוח להזמנות", "accepting_orders"], ["זמין היום", "available_today"], ["עמוס השבוע", "full_this_week"]] as const) {
  test(`clicking «${name}» checks it, posts {state:"${value}"} and shows no date input`, async ({ page }) => {
    const posts: Rec[] = [];
    // Start from a DIFFERENT state so the click is a change, not a no-op.
    await stubDashboard(page, { availability_state: value === "full_this_week" ? "available_today" : "full_this_week", vacation_until: null }, posts);
    await openOverview(page);
    await pill(page, name).click();
    await expectOnlyChecked(page, name);
    await expect(page.getByText("מצב הזמינות עודכן")).toBeVisible();
    expect(posts.map((p) => p.body)).toEqual([{ state: value }]);
    await expect(dateInput(page)).toHaveCount(0);
  });
}

// MT:MEH-291:5 — «בהפסקה» reveals the mini-form BEFORE any save; nothing leaves the browser.
test("clicking «בהפסקה» reveals the return-date input and «שמרו» without posting", async ({ page }) => {
  const posts: Rec[] = [];
  await stubDashboard(page, { availability_state: "accepting_orders", vacation_until: null }, posts);
  await openOverview(page);
  await pill(page, "בהפסקה").click();
  await expectOnlyChecked(page, "בהפסקה");
  await expect(dateInput(page)).toBeVisible();
  await expect(dateInput(page)).toHaveValue("");
  await expect(saveVacation(page)).toBeVisible();
  expect(posts, "selecting vacation must not POST until «שמרו»").toHaveLength(0);
});

// MT:MEH-291:6 — «שמרו» with no date: the inline error, and still no POST.
test("«שמרו» with an empty date shows the inline error and posts nothing", async ({ page }) => {
  const posts: Rec[] = [];
  await stubDashboard(page, { availability_state: "accepting_orders", vacation_until: null }, posts);
  await openOverview(page);
  await pill(page, "בהפסקה").click();
  await saveVacation(page).click();
  await expect(page.getByRole("alert").filter({ hasText: REQUIRED_DATE })).toBeVisible();
  await expect(dateInput(page)).toHaveAttribute("aria-invalid", "true");
  expect(posts, "an empty date must be blocked client-side").toHaveLength(0);
});

// MT:MEH-291:7 — a future date + «שמרו» posts both fields; a reload is still on vacation with the date.
test("a future date + «שמרו» posts state and date, and a reload re-seeds both", async ({ page }) => {
  const posts: Rec[] = [];
  const until = futureIso(10);
  await stubDashboard(page, { availability_state: "accepting_orders", vacation_until: null }, posts);
  await openOverview(page);
  await pill(page, "בהפסקה").click();
  await dateInput(page).fill(until);
  await saveVacation(page).click();
  await expect(page.getByText(`נשמר — בהפסקה עד ${until}`)).toBeVisible();
  expect(posts.map((p) => p.body)).toEqual([{ state: "on_vacation", vacation_until: until }]);

  await page.reload();
  await expect(page.getByTestId("producer-overview")).toBeVisible({ timeout: 15_000 });
  await expectOnlyChecked(page, "בהפסקה");
  await expect(dateInput(page)).toHaveValue(until);
});

// MT:MEH-291:8 — switching back clears the vacation date.
test("switching back to «פתוח להזמנות» clears the return date", async ({ page }) => {
  const posts: Rec[] = [];
  await stubDashboard(page, { availability_state: "on_vacation", vacation_until: futureIso(5) }, posts);
  await openOverview(page);
  await expectOnlyChecked(page, "בהפסקה");
  await expect(dateInput(page)).not.toHaveValue("");
  await pill(page, "פתוח להזמנות").click();
  await expectOnlyChecked(page, "פתוח להזמנות");
  expect(posts.map((p) => p.body)).toEqual([{ state: "accepting_orders" }]);
  await expect(dateInput(page)).toHaveCount(0);
  // And the "server" agrees on reload: no vacation, no date block.
  await page.reload();
  await expect(page.getByTestId("producer-overview")).toBeVisible({ timeout: 15_000 });
  await expectOnlyChecked(page, "פתוח להזמנות");
  await expect(dateInput(page)).toHaveCount(0);
});
