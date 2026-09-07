import { test, expect, type Page } from "../_cloudinary-stub";
import type { Route } from "@playwright/test";

/**
 * Spec:     manual/dashboard-draft-submit
 * Purpose:  MEH-1249 chunk 11j — the owner half of MANUAL_TESTING «MEH-2100 —
 *           טיוטה: באנר ההשלמה ו«שליחה לבדיקה»»: the draft banner's state
 *           matrix (the two closed cells flows/34 leaves unasserted), the cancel
 *           path, the six-row completeness checklist with its חובה/מומלץ chips
 *           and its `#phone-verify` deep link, the split contact ✓ / WhatsApp
 *           missing cell, the 83% divisor, and the OTP flow completing IN the
 *           banner — card gone, item gone, CTA enabled, no reload.
 * Touches:  no backend. Same seams as flows/34-draft-submit-review: GET
 *           /auth/me, /favorites, /producers/me{,/dashboard,/analytics} and the
 *           three POSTs (submit-for-review, verify-phone, verify-phone/confirm)
 *           are route-fulfilled; the token is seeded via addInitScript. Runs on
 *           the default CI E2E target (localhost, no storageState).
 * Does NOT: re-assert what flows/34 already pins (A: five missing + OTP card
 *           mounted; B: POST once + review banner takes over; C: the 422 list;
 *           D: pending gets no draft banner) — those rows are pointed at 34.
 *           Does not touch the registration screen (chunk for /register), the
 *           admin queue (chunk 12), or the RTL/touch-target rows (not converted
 *           in any chunk). Does not reach the "confirm open, profile reloads
 *           incomplete" cell: the dashboard fetches /producers/me ONCE per
 *           mount (page.js:273-279) and `onPhoneVerified` patches locally, so
 *           no in-app trigger exists — that guard is pinned at the unit layer
 *           (__tests__/DraftSubmitBanner.test.jsx «confirm-yes is disabled when
 *           the profile stops being ready mid-confirm»).
 * Related:  components/producer/DraftSubmitBanner.jsx, components/PhoneVerifyCard.jsx,
 *           components/ProfileCompletenessCard.jsx, lib/submission-gate.js,
 *           lib/producer-completeness.js, app/[locale]/producer/dashboard/page.js.
 * History:  MEH-1249 chunk 11j (creation).
 *
 * ON MOCKING INSIDE flows/ — the three conditions in frontend/e2e/CLAUDE.md
 * (MEH-1968), stated rather than assumed:
 *   1. No assertion is about backend BEHAVIOUR. Every one is about which
 *      surface the dashboard renders for a given profile and what it does
 *      with a fixed response; the server-side gate is proven in backend/tests.
 *   2. The contracts are pinned elsewhere: /producers/me is ProducerOut, the
 *      submit 422 is the MEH-1943 shape (SubmissionGateParity.test.js), the OTP
 *      endpoints return bare 200s the card ignores beyond status.
 *   3. The unmocked alternative burns a shared resource — an honest `draft`
 *      needs POST /auth/register/producer on shared runner IPs (rate-limited),
 *      and a real OTP cannot be received in CI at all.
 *
 * MEH-1619 — shown discriminating (see the PR body for the table): three
 * surgical breaks each red exactly one test here and leave the rest green.
 */

const IMG = "https://res.cloudinary.com/demo/image/upload/a.jpg";

/** Every gate item AND every checklist step satisfied: 6/6, ready to submit. */
const ALL_DONE = {
  id: 7,
  name: "מאפיית שקד",
  status: "draft",
  city: "חיפה",
  phone: "050-1234567",
  instagram: null,
  short_description: "מאפייה שכונתית",
  description: "מאפייה שכונתית קטנה בלב חיפה",
  images: [{ id: 1, url: IMG }],
  products: [{ id: 1, name: "חלה" }],
  categories: [{ id: 2, name: "לחמים ואפייה" }],
  // hours.js:177-183 reads opening_hours off the PRIMARY location (MEH-2142).
  locations: [{ id: 1, kind: "branch", is_primary: true, lat: 32.08, lng: 34.78, opening_hours: "א-ה 09:00-17:00" }],
  has_physical_location: true,
  offers_delivery: false,
  delivery_areas: [],
  phone_verified: true,
};

/** The one cell the doc calls out: a typed phone, never verified. 5/6 → 83%. */
const PHONE_UNVERIFIED = { ...ALL_DONE, phone_verified: false };

/** Fails every gate item — flows/34's INCOMPLETE shape. */
const NOTHING_DONE = {
  ...ALL_DONE,
  city: null,
  phone: null,
  images: [],
  products: [],
  categories: [],
  locations: [],
  phone_verified: false,
};

type Rec = { url: string; body: unknown };

/**
 * Seeds a producer session and every read the Overview makes. `profile` is read
 * at request time so a test may flip it between navigations; the app itself
 * never re-fetches within a mount (see header).
 */
async function stubOverview(page: Page, profile: Record<string, unknown>, posts: Rec[] = []) {
  const json = (r: Route, s: number, b: unknown) =>
    r.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
  await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) => json(r, 200, { id: 42, email: "owner@example.com", name: "שקד", role: "producer", producer_id: 7 }));
  await page.route("**/favorites**", (r) => json(r, 200, []));
  await page.route("**/producers/me/dashboard", (r) =>
    json(r, 200, { producer: { id: 7, name: ALL_DONE.name, slug: null, status: "draft", availability_state: "accepting_orders", vacation_until: null }, stats: {} }));
  await page.route("**/producers/me/analytics**", (r) =>
    json(r, 200, { profile_views: { total: 0, last_7d: 0 }, whatsapp_clicks: { total: 0, last_7d: 0 }, contact_clicks: { total: 0, last_7d: 0 },
      average_rating: null, total_reviews: 0, rank_in_city: null, conversion_rate: "0%", profile_strength: 10, top_cities: [], follower_count: 0, new_followers_this_week: 0 }));
  // The three writers. Each records what left the browser; none reaches a server.
  for (const path of ["submit-for-review", "verify-phone", "verify-phone/confirm"]) {
    await page.route(`**/producers/me/${path}`, (r: Route) => {
      if (r.request().method() !== "POST") return r.continue();
      posts.push({ url: path, body: r.request().postDataJSON() });
      return json(r, 200, path === "submit-for-review" ? { status: "pending" } : {});
    });
  }
  // Anchored glob: matches /producers/me and none of the sub-paths above.
  await page.route("**/producers/me", (r: Route) => json(r, 200, { ...profile, status: "draft" }));
}

/** The control: every absence assertion is void if the Overview never rendered. */
async function openOverview(page: Page) {
  await page.goto("/producer/dashboard");
  await expect(page.getByTestId("producer-overview"), "the Overview never rendered — every absence assertion here is void")
    .toBeVisible({ timeout: 15_000 });
}

const banner = (page: Page) => page.getByTestId("draft-submit-banner");
const missingList = (page: Page) => page.getByTestId("draft-missing-list");
const cta = (page: Page) => page.getByTestId("draft-submit-cta");
const checklist = (page: Page) => page.getByTestId("profile-completeness-card");
const checklistRows = (page: Page) => checklist(page).getByRole("list", { name: "התקדמות השלמת הפרופיל" }).getByRole("listitem");

const STEP_LABELS = ["תמונה ראשית", "קטגוריות ומיקום", "מוצר ראשון בקטלוג", "פרטי קשר", "אימות וואטסאפ", "שעות פתיחה"];

// ── the banner's state matrix — the cells flows/34 leaves open ─────────────

test.describe("draft banner — matrix cells and the cancel path", () => {
  // MT:MEH-2100 matrix (1 missing × closed) — the CTA is disabled and ONE row names the item.
  test("one missing item — the CTA is disabled and the list names exactly that item", async ({ page }) => {
    await stubOverview(page, PHONE_UNVERIFIED);
    await openOverview(page);
    await expect(banner(page)).toHaveAttribute("data-state-ready", "false");
    await expect(cta(page)).toBeDisabled();
    const rows = missingList(page).getByRole("listitem");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("אימות מספר הוואטסאפ");
    await expect(page.getByTestId("draft-missing-phone_verified")).toBeVisible();
  });

  // MT:MEH-2100 matrix (many × closed) — flows/34 A pins the five codes; the per-row «חובה» chip is asserted here.
  test("five missing items — every row carries its own «חובה» chip", async ({ page }) => {
    await stubOverview(page, NOTHING_DONE);
    await openOverview(page);
    await expect(cta(page)).toBeDisabled();
    await expect(missingList(page).getByRole("listitem")).toHaveCount(5);
    // Exactly five chips, one per row — a chip rendered once for the list would read 1 here.
    await expect(missingList(page).getByText("חובה", { exact: true })).toHaveCount(5);
  });

  // MT:MEH-2100:2 — «לא» returns to a LIVE CTA, not a stuck disabled one. Live copy reads «עוד לא».
  test("cancelling the confirm returns to an enabled CTA and sends nothing", async ({ page }) => {
    const posts: Rec[] = [];
    await stubOverview(page, ALL_DONE, posts);
    await openOverview(page);
    await expect(cta(page)).toBeEnabled();
    await cta(page).click();
    await expect(page.getByTestId("draft-submit-confirm")).toBeVisible();
    await page.getByTestId("draft-submit-confirm-no").click();
    await expect(page.getByTestId("draft-submit-confirm")).toHaveCount(0);
    await expect(cta(page)).toBeVisible();
    await expect(cta(page)).toBeEnabled();
    expect(posts.filter((p) => p.url === "submit-for-review"), "cancel must not POST").toHaveLength(0);
  });

  // MT:MEH-2100 matrix (0 × open) — flows/34 B pins the single POST and the banner swap; the success toast is asserted here.
  test("confirming shows the success toast that names the 3-business-day window", async ({ page }) => {
    const posts: Rec[] = [];
    await stubOverview(page, ALL_DONE, posts);
    await openOverview(page);
    await cta(page).click();
    await page.getByTestId("draft-submit-confirm-yes").click();
    await expect(page.getByText("הפרופיל נשלח לבדיקה — נעדכן עד 3 ימי עסקים.")).toBeVisible();
    await expect(page.getByTestId("status-pending-banner")).toBeVisible();
    expect(posts.filter((p) => p.url === "submit-for-review")).toHaveLength(1);
  });
});

// ── MT:MEH-2100:3-7 — the completeness checklist, six rows ─────────────────

test.describe("completeness checklist — six rows", () => {
  // MT:MEH-2100:3 — six rows, this order.
  test("the checklist shows six rows in the locked order", async ({ page }) => {
    await stubOverview(page, PHONE_UNVERIFIED);
    await openOverview(page);
    await expect(checklistRows(page)).toHaveCount(6);
    for (const [i, label] of STEP_LABELS.entries()) {
      await expect(checklistRows(page).nth(i)).toContainText(label);
    }
  });

  // MT:MEH-2100:4 — «אימות וואטסאפ» is חובה; «שעות פתיחה» is the ONLY מומלץ.
  test("«אימות וואטסאפ» carries חובה and «שעות פתיחה» is the only מומלץ", async ({ page }) => {
    await stubOverview(page, PHONE_UNVERIFIED);
    await openOverview(page);
    await expect(page.getByTestId("completeness-chip-phone_verified")).toHaveText("חובה");
    await expect(page.getByTestId("completeness-chip-hours")).toHaveText("מומלץ");
    await expect(checklist(page).getByText("מומלץ", { exact: true })).toHaveCount(1);
    await expect(checklist(page).getByText("חובה", { exact: true })).toHaveCount(5);
  });

  // MT:MEH-2100:5 — the row jumps to the banner's OTP card, not to the edit hub.
  test("clicking «אימות וואטסאפ» lands on the banner's #phone-verify anchor, not the edit page", async ({ page }) => {
    await stubOverview(page, PHONE_UNVERIFIED);
    await openOverview(page);
    const link = checklistRows(page).nth(4).getByRole("link");
    await expect(link).toHaveAttribute("href", /#phone-verify$/);
    await link.click();
    await expect.poll(() => page.evaluate(() => `${location.pathname} ${location.hash}`)).toMatch(/^\/(he\/)?producer\/dashboard #phone-verify$/);
    await expect(page.getByTestId("draft-phone-verify")).toBeInViewport();
  });

  // MT:MEH-2100:6 — typed phone, no OTP: contact ✓ AND WhatsApp still missing, on one screen.
  test("a saved-but-unverified phone reads contact ✓ while the WhatsApp row is still missing", async ({ page }) => {
    await stubOverview(page, PHONE_UNVERIFIED);
    await openOverview(page);
    await expect(checklistRows(page).nth(3)).toContainText("הושלם");
    await expect(checklistRows(page).nth(4)).toContainText("עדיין חסר");
    await expect(page.getByTestId("draft-missing-phone_verified")).toBeVisible();
  });

  // MT:MEH-2100:7 — six is the divisor: one missing = 83%, not 80%.
  test("one missing step is 83%, computed over six", async ({ page }) => {
    await stubOverview(page, PHONE_UNVERIFIED);
    await openOverview(page);
    await expect(checklist(page).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "83");
    await expect(checklist(page).getByRole("heading", { level: 2 })).toHaveText("כמעט שם — 83% מוכן");
  });
});

// ── MT:MEH-2100:9-10 — the OTP completes inside the banner ─────────────────

test.describe("WhatsApp verification from the draft", () => {
  // MT:MEH-2100:9 · MT:MEH-2100:10 — card gone, item gone, CTA live, no reload.
  test("a successful OTP removes the card and the item, and enables the CTA on the same screen", async ({ page }) => {
    const posts: Rec[] = [];
    await stubOverview(page, PHONE_UNVERIFIED, posts);
    await openOverview(page);
    const card = page.getByTestId("draft-phone-verify");
    await expect(card).toBeVisible();
    await expect(cta(page)).toBeDisabled();

    await card.getByRole("button", { name: "שלחו קוד אימות" }).click();
    await card.getByLabel("קוד אימות").fill("123456");
    await card.getByRole("button", { name: "אמתו" }).click();

    await expect(page.getByText("הטלפון אומת! העסק הועבר לסקירת הצוות.")).toBeVisible();
    expect(posts.map((p) => p.url)).toEqual(["verify-phone", "verify-phone/confirm"]);
    expect(posts[1].body).toEqual({ code: "123456" });

    await expect(card).toHaveCount(0);
    await expect(missingList(page)).toHaveCount(0);
    await expect(banner(page)).toHaveAttribute("data-state-ready", "true");
    await expect(cta(page)).toBeEnabled();
    // The checklist saw the same flip: 6/6 collapses to the single confirmation line.
    await expect(checklist(page)).toContainText("הפרופיל מלא");
  });
});
