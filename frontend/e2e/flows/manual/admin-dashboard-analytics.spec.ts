import { test, expect, type Page } from "../_cloudinary-stub";
import type { Route } from "@playwright/test";

/**
 * Spec:     manual/admin-dashboard-analytics — MEH-1249 chunk 12g
 * Purpose:  Convert the CONVERT-verdict rows of the «Analytics — Producer +
 *           Admin dashboards» section (no card id — the heading is mapped to
 *           the marker ANALYTICS, like SWEEP1607 in chunk 11h):
 *             MT:ANALYTICS:19-22   /admin — stat cards, alerts, the DAU chart,
 *                                  top cities, the server-health panel
 *             MT:ANALYTICS:25, :26 /admin/settings — the vacation-mode toggle
 *             MT:ANALYTICS:28, :29 /admin/producers — the AI risk badge + tooltip
 *             MT:ANALYTICS:44-47   the sidebar pending-moderation pill
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
 *      (page.js:40-260), VacationSettings in/out (settings/page.js:111-118),
 *      ProducerAdminOut.risk_score / risk_reasoning (AdminProducersTable.jsx:477).
 *   3. The unmocked alternative needs 30 days of real DAU, real page views in
 *      ten cities, a fresh signup scored by Anthropic, and a vacation flag
 *      flipped on shared staging.
 *
 * The 404 catch-all on /api/* (chunk 12e) is kept.
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 *
 * D1 · MT:ANALYTICS:44 expects the dashboard's alert cards to "list the 4"
 *      (pending producer, open report, flagged home product, pending
 *      experience). The dashboard renders TWO alert cards — pending producers
 *      and open reports (page.js:104-131); flagged products and pending
 *      experiences have no card, only their share of the sidebar count.
 *      Asserted as measured: two cards, and the pill still reads 4.
 * D2 · MT:ANALYTICS:19 counts "2 charts". Measured: two SVG line charts
 *      (6-month producers, DAU) plus the top-cities bar list — asserted as
 *      the two headings + the list, since a bar list is not an SVG chart.
 * D3 · MT:ANALYTICS:22 says the panel shows `response_time_avg_ms` and
 *      `requests_per_minute` "+ a per-process note". The footnote is a raw
 *      i18n string carrying Markdown asterisks («**מידע:** …») that the page
 *      renders literally — asserted by the words, not the glyphs.
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
};
type Stub = { unstubbed: string[]; dashboardCalls: () => number; setDashboard: (d: Dashboard) => void };

async function stubAdmin(page: Page, opts: StubOpts = {}): Promise<Stub> {
  let dash = opts.dashboard ?? dashboard();
  let vacation = opts.vacation ?? { active: false, return_date: null };
  const { rows = [], writes, vacationStatus = 200 } = opts;
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
  await page.route("**/admin/dashboard", (r) => { dashboardCalls += 1; return json(r, dash); });
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
  await expect(page.getByRole("heading", { name: "לוח מחוונים" }), "control: the dashboard never rendered").toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "בריאות שרת — שעה אחרונה" }), "control: the health panel never rendered").toBeVisible();
}
/**
 * The dashboard card whose <h2> reads `heading`, scoped to the page's <main> so
 * neither nav can match. `.last()` picks the innermost white container around
 * that heading — the card itself rather than the grid cell wrapping it. A second
 * card with the same <h2> would not be picked silently: every test also asserts
 * the heading by role + exact name, which is a strict-mode violation on two.
 */
const card = (page: Page, heading: string) =>
  page.locator("main div.bg-white").filter({ has: page.getByRole("heading", { name: heading, exact: true }) }).last();
/** The one pill that is actually rendered — the desktop sidebar and the mobile nav each carry one; the other is display:none. */
const pill = (page: Page, count: number) => page.locator(`[aria-label="${count} פריטים לאישור"]:visible`);

// ── MT:ANALYTICS:19-22 — /admin ─────────────────────────────────────────────

test.describe("/admin — the dashboard", () => {
  test("control: every read the dashboard makes is stubbed", async ({ page }) => {
    const stub = await stubAdmin(page);
    await openDashboard(page);
    expect(stub.unstubbed, "an /api/* read reached the 404 catch-all — a stub is missing").toEqual([]);
    expect(stub.dashboardCalls(), "the layout and the page each read /admin/dashboard once").toBe(2);
  });

  // MT:ANALYTICS:19 — 4 main cards + 4 secondary + alert cards + 2 charts + health + activity. (D2 on "2 charts".)
  test("4 main stat cards, 4 secondary, both alert cards, two chart headings, the health panel and the activity feed", async ({ page }) => {
    await stubAdmin(page);
    await openDashboard(page);
    for (const [label, value] of [["סה״כ בתי עסק", "42"], ["ממתינים לאישור", "1"], ["משתמשים רשומים", "310"], ["קבוצות רכש", "0"]] as const) {
      // A stat card is the <a> carrying the 3xl number; the alert card below shares the words «ממתינים לאישור».
      const c = page.locator("a").filter({ has: page.locator("span.text-3xl") }).filter({ hasText: label });
      await expect(c, label).toHaveCount(1);
      await expect(c.locator("span.text-3xl")).toHaveText(value);
    }
    await expect(page.getByText("משתמשים חדשים השבוע")).toBeVisible();
    await expect(page.locator("div").filter({ hasText: /^\+12משתמשים חדשים השבוע/ }).last()).toContainText("מתוך 310 סה״כ");
    await expect(page.locator("div").filter({ hasText: /^\+3עסקים חדשים השבוע/ }).last()).toContainText("מתוך 42 סה״כ");
    for (const [label, value] of [["אירועים", "5"], ["חוויות", "8"]] as const) {
      const c = page.locator("a").filter({ has: page.locator("span.text-3xl") }).filter({ hasText: label });
      await expect(c, label).toHaveCount(1);
      await expect(c.locator("span.text-3xl")).toHaveText(value);
    }
    await expect(page.getByRole("link", { name: /1 בתי עסק ממתינים לאישור/ })).toHaveAttribute("href", /\/admin\/producers\?status=pending$/);
    await expect(page.getByRole("link", { name: /1 דיווחים פתוחים/ })).toHaveAttribute("href", /\/admin\/reports$/);
    await expect(page.getByRole("heading", { name: "בתי עסק חדשים — 6 חודשים אחרונים" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "משתמשים פעילים — 30 ימים אחרונים" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "ערים מובילות" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "בריאות שרת — שעה אחרונה" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "פעילות אחרונה" })).toBeVisible();
    await expect(page.getByText("אין נתונים עדיין", { exact: true }), "empty activity feed").toBeVisible();
    await expect(page.getByRole("img", { name: "DAU 30 ימים" })).toBeVisible();
  });

  // MT:ANALYTICS:20 — the DAU chart: 30 points, date labels at start / middle / end; and its empty state.
  test("the DAU chart draws 30 points and labels the first, middle and last date", async ({ page }) => {
    await stubAdmin(page);
    await openDashboard(page);
    const svg = page.getByRole("img", { name: "DAU 30 ימים" });
    await expect(svg.locator("circle")).toHaveCount(30);
    // Only the MM-DD labels — a future axis label or title must not turn a date-format failure into a count mismatch.
    const dateLabels = svg.locator("text").filter({ hasText: /^\d\d-\d\d$/ });
    await expect(dateLabels).toHaveText(["08-07", "08-22", "09-05"]);
    // Pinned on purpose: a new <text> node (axis, title, tooltip) is a chart change this row should notice and re-pin.
    await expect(svg.locator("text"), "the chart renders exactly the three date labels").toHaveCount(3);
    await expect(svg.locator("polyline")).toHaveAttribute("points", /^8\.0,\d+(\.\d+)? /);
  });

  test("with no DAU data the chart card reads «אין נתונים עדיין»", async ({ page }) => {
    await stubAdmin(page, { dashboard: dashboard({ daily_active_users: [] }) });
    await openDashboard(page);
    const c = card(page, "משתמשים פעילים — 30 ימים אחרונים");
    await expect(c.getByText("אין נתונים עדיין")).toBeVisible();
    await expect(page.getByRole("img", { name: "DAU 30 ימים" })).toHaveCount(0);
  });

  // MT:ANALYTICS:21 — top cities: up to 10, name + count, a bar per row; and its empty state.
  test("top cities lists the ten rows in order with their counts", async ({ page }) => {
    await stubAdmin(page);
    await openDashboard(page);
    const items = card(page, "ערים מובילות").getByRole("listitem");
    await expect(items).toHaveCount(10);
    await expect(items.first()).toContainText("תל אביב-יפו");
    await expect(items.first()).toContainText("100");
    await expect(items.nth(9)).toContainText("הרצליה");
    await expect(items.nth(9)).toContainText("19");
    await expect(items.first().locator("div.bg-primary")).toHaveAttribute("style", /width: 100%/);
    await expect(items.nth(9).locator("div.bg-primary")).toHaveAttribute("style", /width: 19%/);
  });

  test("with no city data the card explains why", async ({ page }) => {
    await stubAdmin(page, { dashboard: dashboard({ top_cities: [] }) });
    await openDashboard(page);
    await expect(card(page, "ערים מובילות").getByText("עוד אין נתוני ערים — לקוחות שלא התחברו לא מדווחים עיר.")).toBeVisible();
  });

  // MT:ANALYTICS:22 — the health panel: the two numbers, the sample count, the per-process footnote. (D3.)
  test("the health panel shows avg response time, requests per minute, the sample count and the per-process note", async ({ page }) => {
    await stubAdmin(page);
    await openDashboard(page);
    const c = card(page, "בריאות שרת — שעה אחרונה");
    await expect(c.getByText("120 בקשות")).toBeVisible();
    await expect(c.locator("p").filter({ hasText: "זמן תגובה ממוצע" }).locator("xpath=following-sibling::*[1]")).toContainText("42");
    await expect(c.locator("p").filter({ hasText: "בקשות לדקה" }).locator("xpath=following-sibling::*[1]")).toContainText("7");
    await expect(c).toContainText("per-process בזיכרון");
    await expect(c).toContainText("מתאפסים בכל deploy");
  });

  test("with no samples yet the health panel waits for traffic", async ({ page }) => {
    await stubAdmin(page, { dashboard: dashboard({ server_health: { sample_count: 0, response_time_avg_ms: 0, requests_per_minute: 0 } }) });
    await openDashboard(page);
    await expect(card(page, "בריאות שרת — שעה אחרונה").getByText("בהמתנה לתנועה...")).toBeVisible();
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

// ── MT:ANALYTICS:44-47 — the sidebar pending-moderation pill ───────────────

test.describe("admin nav — the pending-moderation pill", () => {
  // MT:ANALYTICS:44 — the dashboard's alert cards. D1: two cards render, not four.
  test("with 4 pending items the dashboard shows the two alert cards it has, and the pill still reads 4 (D1)", async ({ page }) => {
    await stubAdmin(page);
    await openDashboard(page);
    await expect(page.getByRole("link", { name: /1 בתי עסק ממתינים לאישור/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /1 דיווחים פתוחים/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /ממתינים לאישור|דיווחים פתוחים/ }).filter({ has: page.getByText("לחצו לטיפול").or(page.getByText("דורש בדיקה")) }), "exactly two alert cards").toHaveCount(2);
    await expect(pill(page, 4)).toHaveText("4");
  });

  // MT:ANALYTICS:45 — the yellow pill on «לוח מחוונים» carries the count.
  test("the «לוח מחוונים» entry carries a yellow pill with the count", async ({ page }) => {
    await stubAdmin(page);
    await openDashboard(page);
    const p = pill(page, 4);
    await expect(p).toHaveText("4");
    await expect(p).toHaveClass(/bg-yellow-400/);
    await expect(p).toHaveAttribute("title", "4 פריטים ממתינים לאישור");
    await expect(p.locator("xpath=ancestor::a[1]")).toHaveAttribute("href", /\/admin$/);
    await expect(p.locator("xpath=ancestor::a[1]")).toContainText("לוח מחוונים");
  });

  // MT:ANALYTICS:46 — the pill survives a route change; the layout re-reads on every pathname.
  test("moving to /admin/producers keeps the pill — the layout re-reads the count on the new pathname", async ({ page }) => {
    const stub = await stubAdmin(page);
    await openDashboard(page);
    const before = stub.dashboardCalls();
    // getByRole excludes hidden elements, so of the two navs (sidebar hidden on the
    // phone, mobile strip hidden on desktop) exactly one «בתי עסק» link resolves.
    const producersLink = page.getByRole("link", { name: "בתי עסק", exact: true });
    await expect(producersLink, "the nav link to the queue is visible").toBeVisible();
    await producersLink.click();
    await expect(page).toHaveURL(/\/admin\/producers$/);
    await expect(page.getByRole("heading", { name: /בתי עסק/ }).first()).toBeVisible();
    await expect(pill(page, 4)).toHaveText("4");
    expect(stub.dashboardCalls(), "one more /admin/dashboard read for the new pathname").toBeGreaterThan(before);
  });

  // MT:ANALYTICS:47 — once the count reaches 0 the pill is gone on the next load.
  test("when the count is 0 the next load renders no pill", async ({ page }) => {
    const stub = await stubAdmin(page);
    await openDashboard(page);
    await expect(pill(page, 4)).toHaveText("4");
    stub.setDashboard(dashboard({ stats: { pending_moderation_count: 0, pending_producers: 0, open_reports: 0 } }));
    await page.reload();
    await openDashboard(page);
    await expect(page.locator('a:visible').filter({ hasText: "לוח מחוונים" }).first(), "the nav is rendered").toBeVisible();
    await expect(page.locator('[aria-label$="פריטים לאישור"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: /ממתינים לאישור/ }).filter({ hasText: "לחצו לטיפול" }), "no alert card either").toHaveCount(0);
  });
});

