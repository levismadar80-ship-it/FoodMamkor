import { test, expect, type Page } from "../_cloudinary-stub";
import type { Route } from "@playwright/test";

/**
 * Spec:     manual/admin-dashboard-analytics — MEH-1249 chunk 12g
 * Purpose:  Convert the CONVERT-verdict rows of the «Analytics — Producer +
 *           Admin dashboards» section (no card id — the heading is mapped to
 *           the marker ANALYTICS, like SWEEP1607 in chunk 11h):
 *             MT:ANALYTICS:19-22   /admin — WAS stat cards, alerts, the DAU chart,
 *                                  top cities, the server-health panel. MEH-2359
 *                                  (26/10) replaced the page with «מה מחכה לטיפול»
 *                                  — the pending businesses + the busy queues;
 *                                  the block now asserts THAT (MT:MEH-2359:1-2,
 *                                  :5-6 in MANUAL_TESTING.md).
 *             MT:ANALYTICS:25, :26 /admin/settings — the vacation-mode toggle
 *             MT:ANALYTICS:28, :29 /admin/producers — the AI risk badge + tooltip
 *             MT:ANALYTICS:44-47   the sidebar pill — since MEH-2359 it is the
 *                                  pending-BUSINESSES count on «מה מחכה לטיפול»
 *                                  and «בתי עסק», not the moderation aggregate
 * Touches:  NO backend. `/admin/dashboard` is answered from a fixture the
 *           layout and the page both read; `/admin/settings/vacation` is a
 *           per-test store the POST mutates and the reload reads back; the
 *           queue list is the 12a/12d inventory. Session via addInitScript.
 *           Default CI target, no DEMO_* fixture, no storageState.
 * Does NOT: assert what the backend AGGREGATES — not DAU from
 *           users.last_active_at, not top cities over producer_page_views, not
 *           the in-memory health sampler, not the Anthropic risk call. Those are
 *           backend tests; a real vacation toggle is a write against the
 *           RAILWAY STAGING backend the storageState specs share
 *           (.github/workflows/e2e.yml:229-233), forbidden 13/07.
 * Related:  app/[locale]/admin/page.js · app/[locale]/admin/layout.js
 *           (badgeCountFor :228) · app/[locale]/admin/settings/page.js
 *           (saveVacation :105) · app/[locale]/admin/producers/AdminProducersTable.jsx
 *           (RiskBadge :123) · manual/admin-settings-licence-actions.spec.ts
 *           (12c — the other settings blocks) · manual/admin-recipes-kebab.spec.ts
 *           (12d — the pill on /admin/recipes).
 * History:  MEH-1249 chunk 12g.
 *
 * ─── The route interception, against the MEH-1968 three conditions ────────
 *
 *   1. No backend BEHAVIOUR is asserted — every test asks what the page renders
 *      from a fixed /admin/dashboard payload, which body the vacation save
 *      sends, and which badge a fixed risk_score earns.
 *   2. The contracts are pinned: the dashboard payload keys the page reads
 *      (page.js `stats` + `pending_producers`; admin/queues.js the per-queue
 *      keys), VacationSettings in/out (settings/page.js:111-118),
 *      ProducerAdminOut.risk_score / risk_reasoning (AdminProducersTable.jsx:477).
 *   3. The unmocked alternative needs 30 days of real DAU, real page views in
 *      ten cities, a fresh signup scored by Anthropic, and a vacation flag
 *      flipped on shared staging.
 *
 * The 404 catch-all on /api/* (chunk 12e) is kept.
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 *
 * D1-D3 (12g) described the pre-MEH-2359 dashboard — two alert cards vs the
 * four MT:ANALYTICS:44 listed, "2 charts", the Markdown-asterisk footnote.
 * That page is gone (stat cards, charts, DAU, top cities, server health all
 * left /admin; growth + cities live on /admin/analytics), so the rows are
 * asserted against the MEH-2359 shape and the ANALYTICS:19-22/44-47 rows in
 * MANUAL_TESTING.md are flagged for the docs backfill as superseded.
 *
 * ─── Rows this chunk does NOT convert ──────────────────────────────────────
 *
 * 1-7 (tracking rows in producer_page_views / the rate limiter), 23-24 (bot
 * traffic, a Railway redeploy), 27 (the 422 model_validator), 30-32 (curl +
 * env toggles), 33-42 (Meta webhook, watchdog, psql), 43 (data creation),
 * 48-49 (SQL privacy invariant) are backend / infra rows. 8-18 describe the
 * April-2026 /producer/dashboard (6 stat cards, 3 quick links) — an OWNER
 * surface in an admin-mapped section whose current shape chunk 11a covers via
 * card 964; flagged for the docs backfill as a re-homing candidate.
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const ADMIN = { id: 1, email: "admin@example.com", name: "מנהלת", role: "admin" };

const DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 7, 7 + i)); // 2026-08-07 … 2026-09-05
  return d.toISOString().slice(0, 10);
});
const DAU = DAYS.map((date, i) => ({ date, count: (i * 7) % 11 }));
const TOP_CITIES = ["תל אביב-יפו", "חיפה", "ירושלים", "באר שבע", "נתניה", "פתח תקווה", "ראשון לציון", "אשדוד", "רחובות", "הרצליה"].map((city, i) => ({ city, count: 100 - i * 9 }));

type Stats = Record<string, number>;
type Dashboard = {
  stats: Stats;
  recent_activity: unknown[];
  monthly_producers: { month: string; producers: number }[];
  pending_producers: { id: number; name: string; city: string | null }[];
  daily_active_users: { date: string; count: number }[];
  top_cities: { city: string; count: number }[];
  server_health: { sample_count: number; response_time_avg_ms: number; requests_per_minute: number } | null;
};
function dashboard(over: Partial<Omit<Dashboard, "stats">> & { stats?: Partial<Stats> } = {}): Dashboard {
  return {
    stats: {
      total_producers: 42,
      pending_producers: 1,
      total_users: 310,
      total_group_buys: 0,
      open_reports: 1,
      new_users_this_week: 12,
      new_producers_this_week: 3,
      total_events: 5,
      total_experiences: 8,
      pending_moderation_count: 4,
      pending_kashrut_requests: 0,
      pending_category_requests: 0,
      pending_name_change_requests: 0,
      undelivered_whatsapp_7d: 0,
      experiences_awaiting_review: 0,
      recipes_awaiting_review: 0,
      ...(over.stats ?? {}),
    },
    recent_activity: over.recent_activity ?? [],
    monthly_producers: over.monthly_producers ?? [
      { month: "2026-04", producers: 2 }, { month: "2026-05", producers: 4 }, { month: "2026-06", producers: 3 },
      { month: "2026-07", producers: 6 }, { month: "2026-08", producers: 5 }, { month: "2026-09", producers: 1 },
    ],
    pending_producers: over.pending_producers ?? [{ id: 501, name: "עסק ממתין", city: "חיפה" }],
    daily_active_users: over.daily_active_users ?? DAU,
    top_cities: over.top_cities ?? TOP_CITIES,
    server_health: over.server_health === undefined
      ? { sample_count: 120, response_time_avg_ms: 42, requests_per_minute: 7 }
      : over.server_health,
  };
}

type Row = Record<string, unknown> & { id: number; name: string; status: string };
function row(over: Partial<Row> = {}): Row {
  return {
    id: 501, name: "עסק לבדיקה", city: "חיפה", status: "pending", slug: null, ambassador: false,
    business_days_waiting: 1, submitted_for_review_at: "2026-09-01T08:00:00Z", created_at: "2026-08-30T08:00:00Z",
    images: [], categories: [{ id: 2, name: "פירות וירקות" }], phone: "050-1234567", has_physical_location: true,
    offers_delivery: false, delivery_nationwide: false, delivery_areas: [], short_description: "ירקות", description: "ירקות טריים.",
    instagram: null, requested_changes: null, changes_requested_at: null, risk_score: null, risk_reasoning: null,
    verification_tier: null, license_pending: false, referral_source: null,
    ...over,
  };
}

type Rec = { method: string; url: string; body: unknown };
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
/** Records the write and returns its parsed body. The prefix is cut at the FIRST "/api". */
const rec = (r: Route, writes?: Rec[]): unknown => {
  const req = r.request();
  let body: unknown = null;
  try { body = req.postDataJSON(); } catch { body = req.postData(); }
  const pathname = new URL(req.url()).pathname;
  const at = pathname.indexOf("/api");
  if (at < 0) throw new Error(`rec(): no /api segment in ${pathname}`);
  writes?.push({ method: req.method(), url: pathname.slice(at + "/api".length), body });
  return body;
};

type StubOpts = {
  dashboard?: Dashboard;
  rows?: Row[];
  writes?: Rec[];
  vacation?: { active: boolean; return_date: string | null };
  /** Status the vacation POST answers with. */
  vacationStatus?: number;
  /** Status GET /admin/dashboard answers with — 500 exercises the fail-visible nav (MEH-2096). */
  dashboardStatus?: number;
};
type Stub = { unstubbed: string[]; dashboardCalls: () => number; setDashboard: (d: Dashboard) => void };

async function stubAdmin(page: Page, opts: StubOpts = {}): Promise<Stub> {
  let dash = opts.dashboard ?? dashboard();
  let vacation = opts.vacation ?? { active: false, return_date: null };
  const { rows = [], writes, vacationStatus = 200, dashboardStatus = 200 } = opts;
  const unstubbed: string[] = [];
  let dashboardCalls = 0;

  await page.addInitScript(() => {
    localStorage.setItem("token", "e2e-token");
    localStorage.setItem("cookieConsent", "essential");
  });
  await page.route((u) => /\/api\//.test(u.pathname), (r) => {
    unstubbed.push(`${r.request().method()} ${new URL(r.request().url()).pathname}`);
    return json(r, { detail: "unstubbed" }, 404);
  });
  await page.route("**/auth/me", (r) => json(r, ADMIN));
  await page.route("**/users/me/favorites", (r) => json(r, []));
  await page.route("**/experiences/count", (r) => json(r, { count: 0 }));
  await page.route("**/categories", (r) => json(r, [{ id: 2, name: "פירות וירקות", slug: "veg" }]));
  await page.route("**/admin/dashboard", (r) => {
    dashboardCalls += 1;
    return dashboardStatus === 200 ? json(r, dash) : json(r, { detail: "boom" }, dashboardStatus);
  });
  // The queue — the 12a inventory.
  // Pathname predicate, not a glob: the settings page asks for ?include_inactive=true (the 12c lesson).
  await page.route((u) => /\/api\/admin\/checklist-items\/?$/.test(u.pathname), (r) => json(r, []));
  await page.route("**/admin/producers/rejection-presets", (r) => json(r, []));
  await page.route("**/admin/producers/*/review-checks", (r) => json(r, { checks: [] }));
  await page.route((u) => /\/api\/admin\/producers\/?$/.test(u.pathname), (r) => json(r, rows));
  // Settings — the 12c inventory + the vacation store.
  await page.route((u) => /\/api\/admin\/settings\/?$/.test(u.pathname), (r) =>
    json(r, { holiday_override_enabled: "false", holiday_override_key: "", friday_mode_override: "false", vacation_mode_active: String(vacation.active), vacation_return_date: vacation.return_date ?? "" }),
  );
  await page.route((u) => /\/api\/admin\/settings\/vacation$/.test(u.pathname), (r) => {
    if (r.request().method() === "POST") {
      const body = rec(r, writes) as { active: boolean; return_date: string | null };
      if (vacationStatus !== 200) return json(r, { detail: "boom" }, vacationStatus);
      vacation = { active: body.active, return_date: body.active ? body.return_date : null };
    }
    return json(r, vacation);
  });

  return { unstubbed, dashboardCalls: () => dashboardCalls, setDashboard: (d) => { dash = d; } };
}

async function openDashboard(page: Page): Promise<void> {
  await page.goto("/he/admin");
  await expect(page.getByRole("heading", { name: "מה מחכה לטיפול" }), "control: the home never rendered").toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("admin-home-pending"), "control: the pending panel never rendered").toBeVisible({ timeout: 15_000 });
}
/** The two MEH-2359 home panels. */
const pendingPanel = (page: Page) => page.getByTestId("admin-home-pending");
const queuesPanel = (page: Page) => page.getByTestId("admin-home-queues");
/** The one «עוד» disclosure — desktop sidebar only; the attribute is readable while hidden. */
const moreGroup = (page: Page) => page.getByTestId("admin-nav-more");
/**
 * The dashboard card whose <h2> reads `heading`, scoped to the page's <main> so
 * neither nav can match. `.last()` picks the innermost white container around
 * that heading — the card itself rather than the grid cell wrapping it. A second
 * card with the same <h2> would not be picked silently: every test also asserts
 * the heading by role + exact name, which is a strict-mode violation on two.
 */
const card = (page: Page, heading: string) =>
  page.locator("main div.bg-white").filter({ has: page.getByRole("heading", { name: heading, exact: true }) }).last();
/** The pills that are actually rendered — the desktop sidebar and the mobile nav each carry a set; the other is display:none.
 *  MEH-2359: the pending-businesses count sits on BOTH approvals entries («מה מחכה לטיפול» + «בתי עסק»), so a count resolves to two. */
const pill = (page: Page, count: number) => page.locator(`[aria-label="${count} פריטים לאישור"]:visible`);
/** A visible ADMIN-nav link (sidebar or phone strip, never the home's queue rows) by its accessible-name prefix — the pill text is part of the name. */
const navLink = (page: Page, label: string) =>
  page.locator("aside nav, div.md\\:hidden > nav").getByRole("link", { name: new RegExp(`^${label}`) }).locator("visible=true");

// ── MT:ANALYTICS:19-22 → MEH-2359 — /admin «מה מחכה לטיפול» ───────────────

test.describe("/admin — «מה מחכה לטיפול»", () => {
  test("control: every read the home makes is stubbed", async ({ page }) => {
    const stub = await stubAdmin(page);
    await openDashboard(page);
    expect(stub.unstubbed, "an /api/* read reached the 404 catch-all — a stub is missing").toEqual([]);
    expect(stub.dashboardCalls(), "the layout and the page each read /admin/dashboard once").toBe(2);
  });

  // MT:MEH-2359:1 — the pending list IS the page: one row per preview entry, «בדוק» → the edit screen,
  // «צפה בכל» → the pending filter, the count in the heading. And none of the 12g furniture.
  test("the pending businesses list with «בדוק» + «צפה בכל», and no stat cards / charts / health panel", async ({ page }) => {
    await stubAdmin(page);
    await openDashboard(page);
    const panel = pendingPanel(page);
    await expect(panel.getByRole("heading", { name: /^בקשות ממתינות/ })).toContainText("1");
    await expect(panel.locator("span.bg-yellow-400"), "the count pill in the heading").toHaveText("1");
    await expect(panel.getByRole("listitem")).toHaveCount(1);
    await expect(panel.getByRole("listitem").first()).toContainText("עסק ממתין");
    await expect(panel.getByRole("listitem").first()).toContainText("חיפה");
    await expect(panel.getByRole("link", { name: "בדוק" })).toHaveAttribute("href", /\/admin\/producers\/501\/edit$/);
    await expect(panel.getByRole("link", { name: /^צפה בכל/ })).toHaveAttribute("href", /\/admin\/producers\?status=pending$/);
    await expect(page.getByRole("link", { name: /^סטטיסטיקה ואנליטיקס/ })).toHaveAttribute("href", /\/admin\/analytics$/);
    // The 12g furniture — pinned ABSENT, by the selectors 12g pinned it present with.
    await expect(page.locator("main span.text-3xl"), "no stat cards").toHaveCount(0);
    await expect(page.locator("main svg polyline"), "no line chart").toHaveCount(0);
    for (const heading of ["לוח מחוונים", "בתי עסק חדשים — 6 חודשים אחרונים", "משתמשים פעילים — 30 ימים אחרונים", "ערים מובילות", "בריאות שרת — שעה אחרונה", "פעילות אחרונה"]) {
      await expect(page.getByRole("heading", { name: heading }), `«${heading}» left the home`).toHaveCount(0);
    }
  });

  // MT:MEH-2359:3 — a queue row exists only while its count is > 0; reports is NOT special on the home.
  test("the queues panel lists only the non-empty queues, with their counts", async ({ page }) => {
    await stubAdmin(page, { dashboard: dashboard({ stats: { open_reports: 0, pending_kashrut_requests: 2, undelivered_whatsapp_7d: 5 } }) });
    await openDashboard(page);
    const rows = queuesPanel(page).getByRole("link");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAttribute("href", /\/admin\/kashrut$/);
    await expect(rows.nth(0)).toContainText("כשרות");
    await expect(rows.nth(0).locator("span.bg-yellow-400")).toHaveText("2");
    await expect(rows.nth(1)).toHaveAttribute("href", /\/admin\/whatsapp-failures$/);
    await expect(rows.nth(1).locator("span.bg-yellow-400")).toHaveText("5");
    await expect(queuesPanel(page).getByText("אין פריטים ממתינים בשאר התורים")).toHaveCount(0);
  });

  // MT:MEH-2359:2 — 0 pending + 0 in every queue: both empty lines, nothing yellow anywhere.
  test("with nothing waiting both panels say so and nothing is yellow", async ({ page }) => {
    await stubAdmin(page, { dashboard: dashboard({ stats: { pending_producers: 0, open_reports: 0 }, pending_producers: [] }) });
    await openDashboard(page);
    await expect(pendingPanel(page).getByText("אין בקשות ממתינות")).toBeVisible();
    await expect(queuesPanel(page).getByText("אין פריטים ממתינים בשאר התורים")).toBeVisible();
    await expect(queuesPanel(page).getByRole("link")).toHaveCount(0);
    await expect(page.locator(".bg-yellow-400"), "no yellow count on the page or in either nav").toHaveCount(0);
  });

  // The preview is capped by the endpoint; the remainder is said, not hidden.
  test("when the count exceeds the preview the panel says how many more are in the queue", async ({ page }) => {
    await stubAdmin(page, { dashboard: dashboard({ stats: { pending_producers: 7 } }) });
    await openDashboard(page);
    await expect(pendingPanel(page).getByText("ועוד 6 בתור")).toBeVisible();
    await expect(pendingPanel(page).locator("span.bg-yellow-400")).toHaveText("7");
  });
});

// ── MT:ANALYTICS:25, :26 — /admin/settings vacation mode ───────────────────

async function openSettings(page: Page): Promise<void> {
  await page.goto("/he/admin/settings");
  await expect(page.getByRole("heading", { name: /^מצב חופשה/ }), "control: the settings page never rendered").toBeVisible({ timeout: 15_000 });
}
/** The vacation block — the page carries two other switches (holiday window, Friday mode) above it.
 *  Same shape and same reasoning as `card()`: <main>-scoped, innermost white container around the heading. */
const vacationBlock = (page: Page) =>
  page.locator("main div.bg-white").filter({ has: page.getByRole("heading", { name: /^מצב חופשה/ }) }).last();
const vacationSwitch = (page: Page) => vacationBlock(page).getByRole("switch");
const vacationSave = (page: Page) => page.getByRole("button", { name: "שמרי מצב חופשה" });
const returnDate = (page: Page) => page.getByLabel("אני בחופשה עד");

test.describe("/admin/settings — vacation mode", () => {
  test("control: every read the settings page makes is stubbed", async ({ page }) => {
    const stub = await stubAdmin(page);
    await openSettings(page);
    await expect(vacationSwitch(page)).toHaveAttribute("aria-checked", "false");
    expect(stub.unstubbed, "an /api/* read reached the 404 catch-all — a stub is missing").toEqual([]);
  });

  // MT:ANALYTICS:25 — on + date + save → toast; reload persists; off → toast; reload → date gone.
  test("toggle on + date + save posts {active,return_date} and persists; toggle off posts active:false and clears the date", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes });
    await openSettings(page);
    await expect(vacationSave(page), "nothing dirty yet").toBeDisabled();
    await vacationSwitch(page).click();
    await expect(vacationSwitch(page)).toHaveAttribute("aria-checked", "true");
    await returnDate(page).fill("2026-10-01");
    await expect(vacationSave(page)).toBeEnabled();
    await vacationSave(page).click();
    await expect(page.getByText("מצב חופשה הופעל עד 2026-10-01")).toBeVisible();
    expect(writes).toEqual([{ method: "POST", url: "/admin/settings/vacation", body: { active: true, return_date: "2026-10-01" } }]);
    await page.reload();
    await openSettings(page);
    await expect(vacationSwitch(page), "the reload reads the persisted state back").toHaveAttribute("aria-checked", "true");
    await expect(returnDate(page)).toHaveValue("2026-10-01");
    await vacationSwitch(page).click();
    await expect(returnDate(page), "the date field hides with the toggle off").toHaveCount(0);
    await vacationSave(page).click();
    await expect(page.getByText("מצב חופשה בוטל")).toBeVisible();
    expect(writes[1]).toEqual({ method: "POST", url: "/admin/settings/vacation", body: { active: false, return_date: null } });
    await page.reload();
    await openSettings(page);
    await expect(vacationSwitch(page)).toHaveAttribute("aria-checked", "false");
    await expect(returnDate(page)).toHaveCount(0);
  });

  // MT:ANALYTICS:26 — on with no date → save disabled + the red inline warning.
  test("toggle on without a date keeps save disabled and shows the red warning", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes });
    await openSettings(page);
    await vacationSwitch(page).click();
    await expect(returnDate(page)).toHaveValue("");
    await expect(vacationSave(page)).toBeDisabled();
    const warn = page.getByText("חובה לציין תאריך חזרה כשמצב חופשה מופעל");
    await expect(warn).toBeVisible();
    await expect(warn).toHaveClass(/text-red-600/);
    await returnDate(page).fill("2026-10-01");
    await expect(warn).toHaveCount(0);
    await expect(vacationSave(page)).toBeEnabled();
    expect(writes, "nothing was sent while the form was invalid").toEqual([]);
  });
});

// ── MT:ANALYTICS:28, :29 — the AI risk badge on the queue ──────────────────

test.describe("/admin/producers — the risk badge", () => {
  const RISK_ROWS = [
    row({ id: 1, name: "עסק ללא ציון", risk_score: null, risk_reasoning: null }),
    row({ id: 2, name: "עסק ירוק", risk_score: 20, risk_reasoning: "פרופיל מלא, טלפון ישראלי, קטגוריה רגילה." }),
    row({ id: 3, name: "עסק צהוב", risk_score: 50, risk_reasoning: "תיאור קצר מאוד ואין תמונות." }),
    row({ id: 4, name: "עסק אדום", risk_score: 90, risk_reasoning: "שם גנרי, טלפון זר, קטגוריה רגישה." }),
  ];
  const badge = (page: Page, name: string) => page.getByRole("row", { name: new RegExp(name) }).locator("span[title]").filter({ hasText: /סיכון|אין מידע/ });

  // MT:ANALYTICS:28 — colour-coded by score: green ≤30 / yellow 31-70 / red >70 / grey «אין מידע» for null.
  // (The "fresh signup + ~10 s" half is the Anthropic call — backend.) The risk column is md:table-cell,
  // so text and classes are asserted rather than visibility.
  test("null → grey «אין מידע»; 20 → green; 50 → yellow; 90 → red, each with its score", async ({ page }) => {
    await stubAdmin(page, { rows: RISK_ROWS });
    await page.goto("/he/admin/producers");
    await expect(page.getByRole("row", { name: /עסק אדום/ })).toBeVisible({ timeout: 15_000 });
    await expect(badge(page, "עסק ללא ציון")).toHaveText("אין מידע");
    await expect(badge(page, "עסק ללא ציון")).toHaveClass(/bg-gray-100/);
    await expect(badge(page, "עסק ירוק")).toHaveText("סיכון נמוך (20)");
    await expect(badge(page, "עסק ירוק")).toHaveClass(/bg-primary\/20/);
    await expect(badge(page, "עסק צהוב")).toHaveText("סיכון בינוני (50)");
    await expect(badge(page, "עסק צהוב")).toHaveClass(/bg-yellow-100/);
    await expect(badge(page, "עסק אדום")).toHaveText("סיכון גבוה (90)");
    await expect(badge(page, "עסק אדום")).toHaveClass(/bg-red-100/);
  });

  // MT:ANALYTICS:29 — the tooltip carries the full Hebrew reasoning, or «טרם דורג» when unscored.
  test("the badge's tooltip is the reasoning text, or «טרם דורג» when there is none", async ({ page }) => {
    await stubAdmin(page, { rows: RISK_ROWS });
    await page.goto("/he/admin/producers");
    await expect(page.getByRole("row", { name: /עסק אדום/ })).toBeVisible({ timeout: 15_000 });
    await expect(badge(page, "עסק אדום")).toHaveAttribute("title", "שם גנרי, טלפון זר, קטגוריה רגישה.");
    await expect(badge(page, "עסק ירוק")).toHaveAttribute("title", "פרופיל מלא, טלפון ישראלי, קטגוריה רגילה.");
    await expect(badge(page, "עסק ללא ציון")).toHaveAttribute("title", "טרם דורג");
  });
});

// ── MT:ANALYTICS:44-47 → MEH-2359 — the sidebar pill + the queue filter ────

test.describe("admin nav — the pending-businesses pill, the queue filter, «עוד»", () => {
  // MT:ANALYTICS:44/45 — the yellow pill carries pending_producers, on BOTH approvals entries.
  test("«מה מחכה לטיפול» and «בתי עסק» each carry a yellow pill with the pending-businesses count", async ({ page }) => {
    await stubAdmin(page, { dashboard: dashboard({ stats: { pending_producers: 3, pending_moderation_count: 9 } }) });
    await openDashboard(page);
    const pills = pill(page, 3);
    await expect(pills).toHaveCount(2);
    for (const [i, href] of [[0, /\/admin$/], [1, /\/admin\/producers$/]] as const) {
      await expect(pills.nth(i)).toHaveText("3");
      await expect(pills.nth(i)).toHaveClass(/bg-yellow-400/);
      await expect(pills.nth(i)).toHaveAttribute("title", "3 פריטים ממתינים לאישור");
      await expect(pills.nth(i).locator("xpath=ancestor::a[1]")).toHaveAttribute("href", href);
    }
    await expect(pill(page, 9), "the old moderation aggregate is not a pill anywhere").toHaveCount(0);
  });

  // MT:ANALYTICS:46 — the pill survives a route change; the layout re-reads on every pathname.
  test("moving to /admin/producers keeps the pill — the layout re-reads the count on the new pathname", async ({ page }) => {
    // open_reports 0: the fixture's one open report would be a third «1» pill, on «דיווחים».
    const stub = await stubAdmin(page, { dashboard: dashboard({ stats: { open_reports: 0 } }) });
    await openDashboard(page);
    const before = stub.dashboardCalls();
    // getByRole excludes hidden elements, so of the two navs (sidebar hidden on the
    // phone, mobile strip hidden on desktop) exactly one «בתי עסק» link resolves.
    const producersLink = navLink(page, "בתי עסק");
    await expect(producersLink, "the nav link to the queue is visible").toBeVisible();
    await producersLink.click();
    await expect(page).toHaveURL(/\/admin\/producers$/);
    await expect(page.getByRole("heading", { name: /בתי עסק/ }).first()).toBeVisible();
    await expect(pill(page, 1)).toHaveCount(2);
    expect(stub.dashboardCalls(), "one more /admin/dashboard read for the new pathname").toBeGreaterThan(before);
  });

  // MT:ANALYTICS:47 — once the count reaches 0 the pill is gone on the next load.
  test("when the count is 0 the next load renders no pill", async ({ page }) => {
    const stub = await stubAdmin(page, { dashboard: dashboard({ stats: { open_reports: 0 } }) });
    await openDashboard(page);
    await expect(pill(page, 1)).toHaveCount(2);
    stub.setDashboard(dashboard({ stats: { pending_producers: 0, open_reports: 0 }, pending_producers: [] }));
    await page.reload();
    await openDashboard(page);
    await expect(navLink(page, "מה מחכה לטיפול"), "the nav is rendered").toBeVisible();
    await expect(page.locator('[aria-label$="פריטים לאישור"]')).toHaveCount(0);
  });

  // MT:MEH-2359:3 — a queue is listed only while its count is > 0; «דיווחים» stays at 0.
  test("the queues section lists «דיווחים» at 0 and every other queue only while it has items", async ({ page }) => {
    await stubAdmin(page, { dashboard: dashboard({ stats: { open_reports: 0, pending_kashrut_requests: 0, recipes_awaiting_review: 4 } }) });
    await openDashboard(page);
    await expect(navLink(page, "דיווחים")).toBeVisible();
    await expect(navLink(page, "מתכונים")).toBeVisible();
    await expect(pill(page, 4).locator("xpath=ancestor::a[1]")).toHaveAttribute("href", /\/admin\/recipes$/);
    for (const label of ["כשרות", "בקשות קטגוריה", "בקשות שינוי שם", "הודעות שלא נמסרו", "חוויות"]) {
      await expect(navLink(page, label), `«${label}» is hidden at 0`).toHaveCount(0);
    }
  });

  // MT:MEH-2359:6 — the endpoint dies: «!» on both approvals entries and every queue listed, none hidden.
  test("when /admin/dashboard fails the approvals entries show «!» and every queue is listed without a count", async ({ page }) => {
    await stubAdmin(page, { dashboardStatus: 500 });
    await page.goto("/he/admin");
    const unknown = page.locator('[aria-label="שגיאה בטעינת המידע"]:visible');
    await expect(unknown).toHaveCount(2);
    await expect(unknown.first()).toHaveText("!");
    for (const label of ["דיווחים", "כשרות", "בקשות קטגוריה", "בקשות שינוי שם", "הודעות שלא נמסרו", "חוויות", "מתכונים"]) {
      await expect(navLink(page, label), `«${label}» stays listed`).toBeVisible();
    }
    await expect(page.locator('[aria-label$="פריטים לאישור"]'), "no numeric pill while the count is unknown").toHaveCount(0);
  });

  // MT:MEH-2359:4 — «עוד» is collapsed on the home and opens itself on a deep link into one of its pages.
  test("«עוד» is closed on /admin and open on /admin/settings, where the active item lives", async ({ page }) => {
    await stubAdmin(page);
    await openDashboard(page);
    await expect(moreGroup(page)).not.toHaveAttribute("open", /.*/);
    await openSettings(page);
    await expect(moreGroup(page)).toHaveAttribute("open", /.*/);
    // A plain locator, not getByRole: on the phone the sidebar is display:none and role queries skip hidden nodes.
    await expect(moreGroup(page).locator("a", { hasText: "הגדרות" })).toHaveAttribute("aria-current", "page");
  });
});
