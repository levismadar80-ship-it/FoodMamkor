import { test, expect, type Page } from "../_cloudinary-stub";
import type { Route } from "@playwright/test";

/**
 * Spec:     manual/dashboard-availability
 * Purpose:  MEH-1249 chunk 11k — the dashboard rows of MANUAL_TESTING «MEH-291
 *           Phase 3 — Unified availability card». MEH-2759: the four-pill
 *           radiogroup is now ONE «בהפסקה» switch — what it posts, the
 *           vacation mini-form revealed BEFORE any save
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
 * Related:  app/[locale]/producer/dashboard/page.js (togglePause,
 *           setAvailabilityState, the vacation mini-form), lib/israel-date.js.
 * History:  MEH-1249 chunk 11k (creation). MEH-2759: radios → one switch.
 *
 * ON MOCKING INSIDE flows/ — the three conditions in frontend/e2e/CLAUDE.md
 * (MEH-1968), stated rather than assumed:
 *   1. No assertion is about backend BEHAVIOUR: whether the switch is on, what the
 *      browser sends, what the mini-form does with an empty date, what a fixed
 *      dashboard payload renders. The server's own rules are backend/tests'.
 *   2. The contracts are pinned: POST /producers/me/availability-state takes
 *      {state, vacation_until?} (AvailabilityStateIn) and the dashboard payload
 *      is DashboardOut — both Pydantic models, both used by flows/34 already.
 *   3. Unmocked, every switch click is a WRITE against the shared staging backend
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
  // The one favorites read the app makes (favorites-cache.js:47) — named exactly, not by substring.
  await page.route("**/users/me/favorites", (r) => json(r, 200, []));
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
      average_rating: null, total_reviews: 0, conversion_rate: "0%", top_cities: [], follower_count: 0, new_followers_this_week: 0 }));
  await page.route("**/producers/me", (r) => json(r, 200, APPROVED));
}

/** The control: absence assertions are void if the Overview never rendered. */
async function openOverview(page: Page) {
  await page.goto("/producer/dashboard");
  await expect(page.getByTestId("producer-overview"), "the Overview never rendered — every absence assertion here is void")
    .toBeVisible({ timeout: 15_000 });
}

const pauseSwitch = (page: Page) => page.getByRole("switch", { name: "בהפסקה" });
const dateInput = (page: Page) => page.getByLabel("חזרה ב:");
const saveVacation = (page: Page) => page.getByRole("button", { name: "שמרו" });
const futureIso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const REQUIRED_DATE = "בחרו תאריך חזרה כדי לעבור להפסקה";

async function expectPaused(page: Page, on: boolean) {
  await expect(pauseSwitch(page)).toHaveAttribute("aria-checked", on ? "true" : "false");
}

// MT:MEH-291:1 · MEH-2759 — one availability card, one «בהפסקה» switch, no radios.
test("the card shows one enabled «בהפסקה» switch, off, and no radios", async ({ page }) => {
  await stubDashboard(page, { availability_state: "accepting_orders", vacation_until: null });
  await openOverview(page);
  await expect(pauseSwitch(page)).toBeVisible();
  await expect(pauseSwitch(page)).toBeEnabled();
  await expectPaused(page, false);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByRole("radiogroup")).toHaveCount(0);
  await expect(page.getByTestId("availability-disabled-hint")).toHaveCount(0);
});

// MEH-2759 — the two removed states are read-only; a row still on one reads as not paused.
for (const value of ["available_today", "full_this_week"] as const) {
  test(`a row still on «${value}» shows the switch off and no date input`, async ({ page }) => {
    await stubDashboard(page, { availability_state: value, vacation_until: null });
    await openOverview(page);
    await expectPaused(page, false);
    await expect(dateInput(page)).toHaveCount(0);
  });
}

// MT:MEH-291:5 — turning the switch on reveals the mini-form BEFORE any save; nothing leaves the browser.
test("turning «בהפסקה» on reveals the return-date input and «שמרו» without posting", async ({ page }) => {
  const posts: Rec[] = [];
  await stubDashboard(page, { availability_state: "accepting_orders", vacation_until: null }, posts);
  await openOverview(page);
  await pauseSwitch(page).click();
  await expectPaused(page, true);
  await expect(dateInput(page)).toBeVisible();
  await expect(dateInput(page)).toHaveValue("");
  await expect(saveVacation(page)).toBeVisible();
  // Inverted bounded wait: a POST that fires late is still a POST. The bound is far
  // above a click→request round-trip, so a healthy run pays it only here, on the
  // "it did not happen" answer — the shape .claude/rules/testing.md prescribes.
  const posted = await expect.poll(() => posts.length, { timeout: 2_000 }).toBeGreaterThan(0).then(() => true).catch(() => false);
  expect(posted, "turning the switch on must not POST — «שמרו» is the only writer").toBe(false);
});

// MT:MEH-291:6 — «שמרו» with no date: the inline error, and still no POST.
test("«שמרו» with an empty date shows the inline error and posts nothing", async ({ page }) => {
  const posts: Rec[] = [];
  await stubDashboard(page, { availability_state: "accepting_orders", vacation_until: null }, posts);
  await openOverview(page);
  await pauseSwitch(page).click();
  await saveVacation(page).click();
  await expect(page.getByRole("alert").filter({ hasText: REQUIRED_DATE })).toBeVisible();
  await expect(dateInput(page)).toHaveAttribute("aria-invalid", "true");
  const posted = await expect.poll(() => posts.length, { timeout: 2_000 }).toBeGreaterThan(0).then(() => true).catch(() => false);
  expect(posted, "an empty date must be blocked client-side — no POST may leave").toBe(false);
});

// MT:MEH-291:7 — a future date + «שמרו» posts both fields; a reload is still on vacation with the date.
test("a future date + «שמרו» posts state and date, and a reload re-seeds both", async ({ page }) => {
  const posts: Rec[] = [];
  const until = futureIso(10);
  await stubDashboard(page, { availability_state: "accepting_orders", vacation_until: null }, posts);
  await openOverview(page);
  await pauseSwitch(page).click();
  await dateInput(page).fill(until);
  await saveVacation(page).click();
  await expect(page.getByText(`נשמר — בהפסקה עד ${until}`)).toBeVisible();
  expect(posts.map((p) => p.body)).toEqual([{ state: "on_vacation", vacation_until: until }]);

  await page.reload();
  await expect(page.getByTestId("producer-overview")).toBeVisible({ timeout: 15_000 });
  await expectPaused(page, true);
  await expect(dateInput(page)).toHaveValue(until);
});

// MT:MEH-291:8 — turning the switch off resumes and clears the vacation date.
test("turning «בהפסקה» off posts accepting_orders and clears the return date", async ({ page }) => {
  const posts: Rec[] = [];
  await stubDashboard(page, { availability_state: "on_vacation", vacation_until: futureIso(5) }, posts);
  await openOverview(page);
  await expectPaused(page, true);
  await expect(dateInput(page)).not.toHaveValue("");
  await pauseSwitch(page).click();
  await expectPaused(page, false);
  await expect(page.getByText("מצב הזמינות עודכן")).toBeVisible();
  expect(posts.map((p) => p.body)).toEqual([{ state: "accepting_orders" }]);
  await expect(dateInput(page)).toHaveCount(0);
  // And the "server" agrees on reload: no vacation, no date block.
  await page.reload();
  await expect(page.getByTestId("producer-overview")).toBeVisible({ timeout: 15_000 });
  await expectPaused(page, false);
  await expect(dateInput(page)).toHaveCount(0);
});
