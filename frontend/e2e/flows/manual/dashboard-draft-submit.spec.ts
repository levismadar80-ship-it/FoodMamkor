import { test, expect, type Page } from "../_cloudinary-stub";
import type { Route } from "@playwright/test";
import { MONTH_SUMMARY_ZERO } from "../_month-summary-stub";

// MEH-3446: the dashboard layout reads order-settings (lib/use-orders-tab.js).
// Unstubbed, it reaches Railway staging on a staging push, where ordering is on,
// and the fake token draws a 401 that logs the page out. 404 = ordering off.
test.beforeEach(async ({ page }) => {
  await page.route("**/producers/me/order-settings", (r) =>
    r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Not Found" }) }),
  );
  // MEH-3194: the approved dashboard home reads the month summary (MonthValueLine).
  // Unstubbed, the fake token draws a 401 that ends the session (the MEH-3446 class).
  await page.route("**/producers/me/billing/summary", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MONTH_SUMMARY_ZERO) }),
  );
});

/**
 * Spec:     manual/dashboard-draft-submit
 * Purpose:  MEH-1249 chunk 11j — the owner half of MANUAL_TESTING «MEH-2100 —
 *           טיוטה: באנר ההשלמה ו«שליחה לבדיקה»»: the draft banner's state
 *           matrix (the two closed cells flows/34 leaves unasserted), the cancel
 *           path, the six-row completeness checklist with its חובה/מומלץ chips
 *           and its `#phone-verify` deep link, the split contact ✓ / WhatsApp
 *           missing cell, the 83% divisor, and the OTP flow completing IN the
 *           banner — card gone, item gone, CTA enabled, no reload.
 *
 *           MEH-3659: the draft card lists ONLY the submit gate's four rows
 *           («פרטי העסק», photo, product, WhatsApp) as «N מתוך 4», opens
 *           one row at a time (the OTP card inside the WhatsApp row), and
 *           shows the submit button only when all four are done — one tap,
 *           no confirm. The recommended steps wait for «לשפר את העמוד».
 *           The tests below were rewritten for that; history kept here:
 *
 *           MEH-2883 (#4270): for a BUSINESS the draft banner is now only its
 *           actions — DraftSubmitBanner variant="actions"
 *           (`draft-submit-actions`: phone check + CTA + hint, no title, no
 *           `draft-missing-list`) at the foot of the completeness card, so the
 *           missing items are the card's rows. "The banner" below means those
 *           actions; "an item is missing" means its row reads «עדיין חסר».
 * Touches:  no backend. Same seams as flows/34-draft-submit-review: GET
 *           /auth/me, /favorites, /producers/me{,/dashboard,/analytics} and the
 *           three POSTs (submit-for-review, verify-phone, verify-phone/confirm)
 *           are route-fulfilled; the token is seeded via addInitScript. Runs on
 *           the default CI E2E target (localhost, no storageState).
 * Does NOT: re-assert what flows/34 already pins (A: every required row
 *           missing + OTP card mounted; B: POST once + review banner takes
 *           over; C: the 422 wins, and C-org the organizer's 422 list; D:
 *           pending gets no draft surface; A-<code>: each gate rule alone keeps
 *           the CTA disabled) — those rows are pointed at 34. The row counts
 *           below come from the completeness card, which never reads
 *           lib/submission-gate.js: they pin what the owner is shown, not the
 *           gate's rules — A-<code> in 34 is where a dropped rule goes red.
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
 * History:  MEH-1249 chunk 11j (creation). MEH-2883 chunk 2 (re-pointed at
 *           the one-checklist structure of #4270).
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

/** Every gate item AND every checklist step satisfied: 7/7, ready to submit. */
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
  // MEH-3660: the owner confirmed her email (a Google signup always has).
  owner_email_verified: true,
  // MEH-3032: the owner's photo, the 7th («מומלץ») step.
  owner_photo_url: "https://res.cloudinary.com/demo/image/upload/owner.jpg",
};

/** The one cell the doc calls out: a typed phone, never verified. 3 of 4 in draft. */
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
      average_rating: null, total_reviews: 0, conversion_rate: "0%", top_cities: [], follower_count: 0, new_followers_this_week: 0 }));
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

const checklist = (page: Page) => page.getByTestId("profile-completeness-card");
/** A business's draft actions, at the foot of the one checklist (MEH-2883). */
const banner = (page: Page) => checklist(page).getByTestId("draft-submit-actions");
/** The pre-MEH-2883 list. A business never gets it; asserted absent, never read. */
const missingList = (page: Page) => page.getByTestId("draft-missing-list");
const cta = (page: Page) => page.getByTestId("draft-submit-cta");
const checklistRows = (page: Page) => checklist(page).getByRole("list", { name: "התקדמות השלמת העמוד" }).getByRole("listitem");
/** Rows whose screen-reader status reads «עדיין חסר» (checklist_todo). */
const missingRows = (page: Page) => checklistRows(page).filter({ hasText: "עדיין חסר" });

const DRAFT_LABELS = ["פרטי העסק", "תמונה של העסק או המוצרים", "מוצר ראשון", "אימות מספר הוואטסאפ"];

// ── the draft card's state matrix (MEH-3659) ─────────────

test.describe("draft card — matrix cells", () => {
  // (1 missing × open) — that row is the open one, no button yet.
  test("one missing item — only that row is open, and there is no submit button yet", async ({ page }) => {
    await stubOverview(page, PHONE_UNVERIFIED);
    await openOverview(page);
    await expect(checklistRows(page)).toHaveCount(4);
    const rows = missingRows(page);
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("אימות מספר הוואטסאפ");
    await expect(checklist(page).getByTestId("completeness-open-phone_verified")).toBeVisible();
    await expect(page.getByTestId("completeness-counter")).toHaveText("3 מתוך 4");
    await expect(checklist(page).getByRole("heading", { level: 2 })).toHaveText("עוד צעד אחד לשליחה לבדיקה");
    await expect(cta(page)).toHaveCount(0);
    await expect(missingList(page)).toHaveCount(0);
  });

  // (many × open) — every row missing: the first one open, and WhatsApp open
  // too (MEH-3886), so the code button is reachable from the start.
  test("everything missing — four rows, the first and WhatsApp open, no chips", async ({ page }) => {
    await stubOverview(page, NOTHING_DONE);
    await openOverview(page);
    await expect(missingRows(page)).toHaveCount(4);
    await expect(checklist(page).getByTestId(/^completeness-open-(?!cta)/)).toHaveCount(2);
    await expect(checklist(page).getByTestId("completeness-open-phone_verified")).toBeVisible();
    await expect(checklist(page).getByText("חובה", { exact: true })).toHaveCount(0);
    await expect(checklist(page).getByText("מומלץ", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("completeness-counter")).toHaveText("0 מתוך 4");
  });

  // (0 missing) — «הכול מוכן», one tap posts, toast names the window.
  test("all done — «הכול מוכן», one tap sends, and the toast names the 3-business-day window", async ({ page }) => {
    const posts: Rec[] = [];
    await stubOverview(page, ALL_DONE, posts);
    await openOverview(page);
    await expect(checklist(page).getByRole("heading", { level: 2 })).toHaveText("הכול מוכן");
    await expect(banner(page)).toHaveAttribute("data-state-ready", "true");
    await cta(page).click();
    await expect(page.getByTestId("draft-submit-confirm")).toHaveCount(0);
    await expect(page.getByText("העמוד נשלח לבדיקה — נעדכן עד 3 ימי עסקים.")).toBeVisible();
    await expect(page.getByTestId("status-pending-banner")).toBeVisible();
    expect(posts.filter((p) => p.url === "submit-for-review")).toHaveLength(1);
  });

  test("the rows are the gate's, in this order — no recommended row in draft", async ({ page }) => {
    // Hours and owner photo unset: in draft they must not appear at all.
    await stubOverview(page, { ...PHONE_UNVERIFIED, owner_photo_url: null, locations: [{ ...ALL_DONE.locations[0], opening_hours: null }] });
    await openOverview(page);
    await expect(checklistRows(page)).toHaveCount(4);
    for (const [i, label] of DRAFT_LABELS.entries()) {
      await expect(checklistRows(page).nth(i)).toContainText(label);
    }
  });
});

// ── MEH-3660: the email confirmation is the last row, not a site-wide band ──

test.describe("Email confirmation from the draft", () => {
  test("unconfirmed email — a 5th row, open last, resend from the row, and no top banner", async ({ page }) => {
    await stubOverview(page, { ...ALL_DONE, owner_email_verified: false });
    // The user really is unverified, so the site-wide banner WOULD show
    // anywhere else; on this dashboard the row replaces it.
    await page.route("**/auth/me", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: 42, email: "owner@example.com", name: "שקד", role: "producer", producer_id: 7, email_verified: false, producer_status: "draft", producer_kind: "producer" }),
      }));
    const resends: string[] = [];
    await page.route("**/auth/resend-verify", (r) => {
      resends.push(r.request().method());
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await openOverview(page);
    await expect(checklistRows(page)).toHaveCount(5);
    await expect(page.getByTestId("completeness-counter")).toHaveText("4 מתוך 5");
    const row = checklist(page).getByTestId("completeness-open-email_verified");
    await expect(row).toContainText("אישור כתובת המייל");
    await expect(cta(page)).toHaveCount(0);
    await expect(page.getByText("אמתו את כתובת המייל שלכם — כך נשמור על החשבון שלכם")).toHaveCount(0);

    await row.getByRole("button", { name: "שלחו לי שוב" }).click();
    await expect(row.getByTestId("completeness-email-sent")).toHaveText("✓ נשלח!");
    expect(resends).toEqual(["POST"]);
  });
});

// ── the OTP completes inside the WhatsApp row ─────────────────

test.describe("WhatsApp verification from the draft", () => {
  test("a successful OTP closes the row and shows the submit button on the same screen", async ({ page }) => {
    const posts: Rec[] = [];
    await stubOverview(page, PHONE_UNVERIFIED, posts);
    await openOverview(page);
    const card = checklist(page).getByTestId("completeness-open-phone_verified").getByTestId("draft-phone-verify");
    await expect(card).toBeVisible();
    await expect(cta(page)).toHaveCount(0);

    await card.getByRole("button", { name: "שלחו קוד אימות" }).click();
    // MEH-3126: the 6th digit verifies on its own — no tap on «אמתו».
    await card.getByLabel("קוד אימות").fill("123456");

    // MEH-2305: verifying is one step, not the submission — the toast points at the button.
    await expect(page.getByText('הטלפון אומת! כשכל השלבים מוכנים, לחצו "שליחה לבדיקה" כדי שנכיר את העסק.')).toBeVisible();
    expect(posts.map((p) => p.url)).toEqual(["verify-phone", "verify-phone/confirm"]);
    expect(posts[1].body).toEqual({ code: "123456" });

    await expect(page.getByTestId("draft-phone-verify")).toHaveCount(0);
    await expect(missingRows(page)).toHaveCount(0);
    await expect(checklist(page).getByRole("heading", { level: 2 })).toHaveText("הכול מוכן");
    await expect(banner(page)).toHaveAttribute("data-state-ready", "true");
    await expect(cta(page)).toBeEnabled();
    await expect(missingList(page)).toHaveCount(0);
  });
});
