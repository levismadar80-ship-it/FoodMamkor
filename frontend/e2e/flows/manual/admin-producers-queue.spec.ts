import { test, expect, type Page } from "../_cloudinary-stub";
import type { Route } from "@playwright/test";
// The map the chips are painted from, imported rather than remembered (the
// MEH-2168 lesson flows/33 records). Plain-JS module, no .d.ts — same import
// flows/33 carries; the expect-error keeps this file at zero e2e-tsc errors.
// @ts-expect-error TS7016 — untyped JS module
import { PRODUCER_STATUS_LABELS, PRODUCER_STATUS_COLORS, UNKNOWN_STATUS_COLOR } from "../../../lib/producer-status.js";

/**
 * Spec:     manual/admin-producers-queue — MEH-1249 chunk 12a
 * Purpose:  Convert the CONVERT-verdict rows of four MANUAL_TESTING sections
 *           that all land on the admin approvals queue (/admin/producers) and
 *           its status vocabulary:
 *             MT:MEH-2138-E   the SLA counter above the toolbar
 *             MT:MEH-294      Hebrew status chips + the /admin activity feed
 *             MT:MEH-1232     photo thumbnails on pending rows
 *             MT:MEH-669      admin lockout from producer registration
 * Touches:  NO backend. /auth/me, /admin/dashboard, /admin/producers,
 *           /admin/checklist-items and the per-row review-checks are
 *           route-stubbed and the session token is seeded via addInitScript —
 *           the chunk-11 pattern (manual/dashboard-shell.spec.ts). Runs on the
 *           DEFAULT CI E2E target with no DEMO_* fixture and no storageState.
 * Does NOT: approve, reject, request changes, toggle, delete or import. Those
 *           are chunk 12b, and every one of them is a write the real
 *           storageState specs would make against the RAILWAY STAGING backend
 *           (.github/workflows/e2e.yml:229-233) — forbidden by Sapir's 13/07
 *           ruling. This chunk reads the queue; it never acts on it.
 * Related:  app/[locale]/admin/producers/{page.js,QueueSlaSummary.jsx,
 *           AdminProducersTable.jsx,sla-statuses.js} · admin/page.js ·
 *           lib/producer-status.js · flows/33-admin-producers-tab (the seeded,
 *           read-only counterpart) · flows/25-role-reachability.
 * History:  MEH-1249 chunk 12a.
 *
 * ─── The route interception, against the MEH-1968 three conditions ────────
 *
 *   1. No backend BEHAVIOUR is asserted. `business_days_waiting` is computed
 *      server-side (utils/clock.business_days_waiting) and arrives as a field;
 *      every test here asks what the CLIENT does with a given value — which
 *      tone, which count, which rows carry a strip — never whether the server
 *      counted the days right.
 *   2. The contracts are pinned: ProducerAdminOut (schemas.py) carries
 *      `status`, `business_days_waiting`, `submitted_for_review_at`, `images`;
 *      /admin/dashboard's `stats` + `recent_activity` are read by two live
 *      pages and by admin/layout.js.
 *   3. The unmocked alternative is worse than the rate-limiter case the rule
 *      cites: a pending business that has waited exactly 2 or 3 business days,
 *      a draft that has waited 40, a 30-deep queue, a broken image URL — every
 *      one is a fixture that has to be WRITTEN into shared staging before it
 *      can be read. flows/33 documents the same wall for §2C: the seed has no
 *      pending producer at all.
 *
 * The Cloudinary import is the suite-wide STUB (MEH-1925), not part of this.
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 *
 * D1 · MT:MEH-669:2 says an admin typing /register/producer is "automatically
 *      redirected to /admin (no form ever rendered)". STALE by design: MEH-1489
 *      replaced the silent redirect with a terminal in-place screen
 *      (RegisterProducerClient.jsx:~800, `register-producer-gate-admin`). The
 *      "no form" half still holds and is asserted; the URL now stays put.
 * D2 · MT:MEH-669:12 names three surfaces that must hide the add-business CTA
 *      from an admin — Header drawer, Footer pitch panel, /producers empty
 *      state. Two of the three no longer carry the CTA for ANYONE: MEH-907
 *      removed the Header's (nav-registry.js, `registerProducer` note) and
 *      MEH-721 removed the Footer panel (Footer.jsx:21-23). The surface that
 *      still gates it by role is the mobile AccountSheet (registry audience
 *      "consumer"), so that is what is asserted — for the admin (absent) and
 *      the consumer (present, row 13).
 * D3 · MT:MEH-294:7 describes a "לא קיבלת הודעה? … עריכת פרופיל → /settings"
 *      line on the pending dashboard. Neither the copy nor its target exists:
 *      he.json has no such string and the /settings business tab was removed
 *      (MEH-1355). Not converted; the row is stale, not the dashboard.
 * D4 · MT:MEH-2138-E:6 says 375px. The mobile project is Pixel 5 (393px); the
 *      assertion is "inside the viewport, one line" at that width, which is
 *      the claim the row makes, at the width the suite actually runs.
 *
 * ─── Rows this chunk does NOT convert ──────────────────────────────────────
 *
 * MT:MEH-669:3 (a raw fetch to /auth/register/producer expecting 403) is a
 * backend row — tests/test_api.py territory. :4 (refresh /admin, role intact)
 * is flows/25-role-reachability's first admin test. :5 needs a linked Google
 * account. :8 and :11 submit a real registration — a write. :9-10 (anonymous
 * form renders) are manual/register-producer.spec.ts's pre-flight tests. :14
 * (logged-out CTAs) is the guest half of the same registry audience and is
 * covered by the consumer case only as far as "the sheet is role-aware"; the
 * guest sheet is manual/auth's territory.
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const ADMIN = { id: 1, email: "admin@example.com", name: "מנהלת", role: "admin" };
const CONSUMER = { id: 2, email: "dana@example.com", name: "דנה", role: "consumer" };

const IMG = (n: number) => `https://res.cloudinary.com/demo/image/upload/queue-${n}.jpg`;
/** The MEH-1222 shape: a host that is not an image server at all. */
const BROKEN_IMG = "https://bread.jpg";

type Row = Record<string, unknown> & { id: number; name: string; status: string };

let seq = 100;
/** One admin-list row. Completeness fields are filled so producerCompleteness() is quiet. */
function row(over: Partial<Row> = {}): Row {
  const id = (over.id as number) ?? ++seq;
  return {
    id,
    name: `עסק ${id}`,
    city: "חיפה",
    status: "pending",
    business_days_waiting: 0,
    submitted_for_review_at: "2026-09-01T08:00:00Z",
    created_at: "2026-08-30T08:00:00Z",
    images: [],
    categories: [{ id: 1, name: "לחמים ואפייה" }],
    phone: "050-1234567",
    has_physical_location: true,
    offers_delivery: false,
    delivery_nationwide: false,
    delivery_areas: [],
    short_description: "מאפייה שכונתית",
    description: "לחם מחמצת, כל יום.",
    instagram: null,
    slug: null,
    requested_changes: null,
    changes_requested_at: null,
    risk_score: null,
    risk_reasoning: null,
    verification_tier: null,
    license_pending: false,
    referral_source: null,
    ...over,
  };
}

const pending = (days: number, over: Partial<Row> = {}) =>
  row({ status: "pending", business_days_waiting: days, ...over });

type Activity = { type: string; id: string; name: string; status: string; created_at: string };

type StubOpts = {
  rows?: Row[];
  user?: Record<string, unknown> | null;
  activity?: Activity[];
  /** Every GET the list made, as its `status` query param (or null). */
  listCalls?: (string | null)[];
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/**
 * Seeds an admin (or consumer) session and every read the queue makes.
 *
 * The list route is a URL PREDICATE, not a glob: `**\/admin/producers**` would
 * also swallow `/admin/producers/{id}/review-checks`, and an anchored glob
 * cannot express "with or without a query string". The predicate matches the
 * collection path only and answers from `rows`, filtered by `?status=` the way
 * the backend does, so the toolbar's filter round-trips.
 */
async function stubAdmin(page: Page, opts: StubOpts = {}): Promise<void> {
  const { rows = [], user = ADMIN, activity = [], listCalls } = opts;
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  if (user) await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) => (user ? json(r, user) : json(r, { detail: "unauthenticated" }, 401)));
  await page.route("**/users/me/favorites", (r) => json(r, []));
  await page.route("**/categories**", (r) => json(r, []));
  await page.route("**/admin/dashboard", (r) =>
    json(r, {
      stats: {
        total_producers: rows.length,
        pending_producers: pendingCount,
        total_users: 3,
        total_group_buys: 0,
        pending_moderation_count: pendingCount,
        pending_kashrut_requests: 0,
      },
      recent_activity: activity,
      monthly_producers: [],
    }),
  );
  await page.route("**/admin/checklist-items", (r) => json(r, []));
  // The decision composer (use-reject-flow.js:61) fetches its radio labels on
  // mount. Found by logging every request: left unstubbed it reached a real
  // backend, 401'd on the fake token, the client tried /auth/refresh, that
  // 401'd too, and _expireSession() bounced the whole page to /login mid-test
  // (api.js:75-140). One unstubbed authenticated GET is enough to end the
  // session — every authed read the page makes must be listed here.
  await page.route("**/admin/producers/rejection-presets", (r) =>
    json(r, [
      { key: "missing_docs", label: "מסמכים חסרים / לא קריאים" },
      { key: "missing_image", label: "תמונה ראשית חסרה" },
      { key: "other", label: "אחר (פירוט חופשי)" },
    ]),
  );
  await page.route("**/admin/producers/*/review-checks", (r) => json(r, { checks: [] }));
  // Anchored on `/api/`: without it the predicate also matches the PAGE
  // document `/he/admin/producers` and fulfils the navigation with JSON — the
  // chunk-11i `**\/group-buys**` trap, one level down.
  await page.route(
    (u) => /\/api\/admin\/producers\/?$/.test(u.pathname),
    (r) => {
      const u = new URL(r.request().url());
      const status = u.searchParams.get("status");
      const search = (u.searchParams.get("search") || "").trim();
      listCalls?.push(status);
      let out = rows;
      if (status) out = out.filter((x) => x.status === status);
      if (search) out = out.filter((x) => String(x.name).includes(search) || String(x.city).includes(search));
      return json(r, out);
    },
  );
}

// ── locators + the control ─────────────────────────────────────────────────

const summary = (page: Page) => page.getByTestId("queue-sla-summary");
const badges = (page: Page) => page.getByTestId("waiting-badge");
const rowOf = (page: Page, name: string) =>
  page.locator("tbody tr").filter({ has: page.getByText(name, { exact: true }) });
const stripLabel = (page: Page) => page.getByText("תמונות", { exact: true });
const thumbs = (page: Page) => page.getByRole("link", { name: /^תמונה \d+ של / });

/**
 * The control every queue test runs first. A stub that never answered, a
 * bounce to /login and a real regression all leave the same blank shell, so
 * every absence below is void unless the page's own heading mounted.
 */
async function openQueue(page: Page): Promise<void> {
  await page.goto("/admin/producers");
  await expect(
    page.getByRole("heading", { name: "בתי עסק", exact: true }),
    "control: the queue page never rendered — every assertion in this test is void",
  ).toBeVisible({ timeout: 15_000 });
}

const TONE = {
  gray: /(^|\s)bg-gray-100(\s|$)/,
  amber: /(^|\s)bg-amber-100(\s|$)/,
  red: /(^|\s)bg-red-100(\s|$)/,
};

// ── MT:MEH-2138-E — the SLA counter above the toolbar ──────────────────────

test.describe("approvals queue — SLA counter", () => {
  // MT:MEH-2138-E:1 — «N ממתינים · הוותיק: X ימי עסקים» renders when something is waiting.
  test("with pending rows the counter reads the count and the oldest wait", async ({ page }) => {
    await stubAdmin(page, { rows: [pending(1, { name: "חלה של שקד" }), pending(3, { name: "גבינות הגליל" }), row({ status: "approved", name: "יקב הכרמל" })] });
    await openQueue(page);
    await expect(summary(page)).toBeVisible();
    await expect(summary(page)).toHaveText("2 ממתינים · הוותיק: 3 ימי עסקים");
    await expect(summary(page)).toHaveAttribute("data-count", "2");
    await expect(summary(page)).toHaveAttribute("data-oldest", "3");
  });

  // MT:MEH-2138-E:2 — only «ממתינה לאישור האדמין» counts; a 40-day draft is neither counted nor "the oldest".
  test("a draft waiting 40 days is on screen and still excluded from the count and the oldest", async ({ page }) => {
    await stubAdmin(page, {
      rows: [
        pending(1, { name: "חלה של שקד" }),
        row({ status: "draft", business_days_waiting: 40, submitted_for_review_at: null, name: "טיוטה ישנה" }),
        row({ status: "approved", name: "יקב הכרמל" }),
      ],
    });
    await openQueue(page);
    // Precondition: the draft's own badge proves the 40 reached the page.
    const draftBadge = rowOf(page, "טיוטה ישנה").getByTestId("waiting-badge");
    await expect(draftBadge, "control: the draft row never rendered its badge").toHaveAttribute("data-days", "40");
    await expect(draftBadge).toHaveClass(TONE.gray);
    await expect(summary(page)).toHaveAttribute("data-count", "1");
    await expect(summary(page)).toHaveAttribute("data-oldest", "1");
  });

  // MT:MEH-2138-E:3 — 0–1 grey · 2 amber · 3+ red, and the counter's tone equals the oldest row's badge tone.
  for (const c of [
    { oldest: 1, tone: "gray" as const },
    { oldest: 2, tone: "amber" as const },
    { oldest: 3, tone: "red" as const },
  ]) {
    test(`oldest ${c.oldest} → ${c.tone}, on the counter and on the oldest row's badge alike`, async ({ page }) => {
      await stubAdmin(page, { rows: [pending(0, { name: "חדש היום" }), pending(c.oldest, { name: "הוותיק" })] });
      await openQueue(page);
      await expect(summary(page)).toHaveAttribute("data-oldest", String(c.oldest));
      await expect(summary(page)).toHaveClass(TONE[c.tone]);
      await expect(rowOf(page, "הוותיק").getByTestId("waiting-badge")).toHaveClass(TONE[c.tone]);
      for (const other of (Object.keys(TONE) as (keyof typeof TONE)[]).filter((k) => k !== c.tone)) {
        await expect(summary(page)).not.toHaveClass(TONE[other]);
      }
    });
  }

  // MT:MEH-2138-E:4 — an empty queue renders NO counter, not «0 ממתינים».
  test("filtering to approved only removes the counter entirely", async ({ page }) => {
    const listCalls: (string | null)[] = [];
    await stubAdmin(page, { rows: [pending(2, { name: "חלה של שקד" }), row({ status: "approved", name: "יקב הכרמל" })], listCalls });
    await openQueue(page);
    await expect(summary(page)).toHaveAttribute("data-count", "1");
    // The toolbar's status <select>, not the pagination's rows-per-page one.
    await page.locator("select").filter({ has: page.locator('option[value="approved"]') }).selectOption("approved");
    await expect.poll(() => listCalls.includes("approved"), { message: "the filter never re-fetched with status=approved" }).toBe(true);
    await expect(rowOf(page, "חלה של שקד")).toHaveCount(0);
    await expect(rowOf(page, "יקב הכרמל")).toHaveCount(1);
    await expect(summary(page)).toHaveCount(0);
    await expect(page.getByText(/0 ממתינים/)).toHaveCount(0);
  });

  // MT:MEH-2138-E:5 — the N is the whole queue, not the page: 30 pending across a 25-row page.
  test("with 30 pending on a 25-row page the counter says 30 while the page shows 25", async ({ page }) => {
    const rows = Array.from({ length: 30 }, (_, i) => pending(1, { id: 500 + i, name: `ממתין ${i + 1}` }));
    await stubAdmin(page, { rows });
    await openQueue(page);
    await expect(badges(page)).toHaveCount(25);
    await expect(page.getByTestId("pagination")).toBeVisible();
    await expect(summary(page)).toHaveAttribute("data-count", "30");
  });

  // MT:MEH-2138-E:6 — narrow viewport: inside the screen, one line.
  test("on the phone project the counter sits inside the viewport on a single line", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the row is a narrow-viewport claim; the desktop project is 1440 wide");
    await stubAdmin(page, { rows: [pending(3, { name: "הוותיק" }), pending(1, { name: "חדש" })] });
    await openQueue(page);
    const box = await summary(page).boundingBox();
    const vw = page.viewportSize()!.width;
    expect(box, "the counter has no box").not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
    // text-sm (20px line) + py-1 (8px): two lines would be ~48px.
    expect(box!.height).toBeLessThan(40);
  });
});

// ── MT:MEH-294 — Hebrew status chips ──────────────────────────────────────

test.describe("approvals queue — status chips", () => {
  const classTokens = (cls: string) => cls.split(/\s+/).filter(Boolean);

  // MT:MEH-294:1 · MT:MEH-294:2 · MT:MEH-294:3 · MT:MEH-294:4 · MT:MEH-294:5 — one chip per status, label + colour from lib/producer-status.js.
  for (const status of ["draft", "pending", "approved", "rejected", "inactive"] as const) {
    test(`the ${status} chip reads «${PRODUCER_STATUS_LABELS[status]}» in its own colour, never the raw code`, async ({ page }) => {
      const name = `עסק ${status}`;
      await stubAdmin(page, { rows: [row({ status, name, business_days_waiting: 1 })] });
      await openQueue(page);
      const chip = rowOf(page, name).getByText(PRODUCER_STATUS_LABELS[status], { exact: true });
      await expect(chip).toBeVisible();
      for (const token of classTokens(PRODUCER_STATUS_COLORS[status])) {
        await expect(chip).toHaveClass(new RegExp(`(^|\\s)${token.replace("/", "\\/")}(\\s|$)`));
      }
      await expect(rowOf(page, name).getByText(status, { exact: true })).toHaveCount(0);
    });
  }

  // MT:MEH-294:1 (second half) — the draft chip is not the same grey as «לא פעילה» (MEH-2126).
  test("draft and inactive are two different greys", async ({ page }) => {
    // Row names must not equal a chip label, or the name span and the chip
    // both match the text locator (strict-mode violation on the first run).
    await stubAdmin(page, { rows: [row({ status: "draft", name: "עסק בטיוטה" }), row({ status: "inactive", name: "מושבת" })] });
    await openQueue(page);
    const draft = rowOf(page, "עסק בטיוטה").getByText("טיוטה", { exact: true });
    await expect(draft).toHaveClass(/bg-slate-100/);
    await expect(draft).not.toHaveClass(/bg-gray-200/);
    await expect(rowOf(page, "מושבת").getByText("לא פעילה", { exact: true })).toHaveClass(/bg-gray-200/);
  });

  // MT:MEH-294:6 — the /admin activity feed shows «(label)», not the code.
  test("the /admin activity feed brackets the translated label next to the business name", async ({ page }) => {
    await stubAdmin(page, {
      rows: [],
      activity: [{ type: "producer_added", id: "77", name: "גבינות הגליל", status: "pending", created_at: "2026-09-01T08:00:00Z" }],
    });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "פעילות אחרונה" }), "control: the dashboard never rendered").toBeVisible({ timeout: 15_000 });
    const item = page.getByRole("listitem").filter({ hasText: "גבינות הגליל" });
    await expect(item).toContainText("נוסף בית עסק:");
    await expect(item).toContainText("(ממתינה לאישור האדמין)");
    await expect(item.getByText("(pending)")).toHaveCount(0);
  });

  // MT:MEH-294:8 — a status the map does not know renders its raw code, in the fallback colour, without crashing.
  test("an unknown status falls back to the raw code in the neutral colour", async ({ page }) => {
    await stubAdmin(page, { rows: [row({ status: "frozen_x", name: "מקרה קצה" }), pending(1, { name: "רגיל" })] });
    await openQueue(page);
    const chip = rowOf(page, "מקרה קצה").getByText("frozen_x", { exact: true });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveClass(new RegExp(`(^|\\s)${UNKNOWN_STATUS_COLOR}(\\s|$)`));
    await expect(rowOf(page, "מקרה קצה").getByText("undefined")).toHaveCount(0);
    await expect(rowOf(page, "רגיל")).toHaveCount(1);
  });
});

// ── MT:MEH-1232 — photo thumbnails on pending rows ────────────────────────

test.describe("approvals queue — pending photo strip", () => {
  // MT:MEH-1232:1 — a pending row with images carries a strip: up to 4 thumbs + «+N».
  test("a pending row with six images shows four thumbnails and a «+2» overflow box", async ({ page }) => {
    await stubAdmin(page, { rows: [pending(1, { name: "חלה של שקד", images: [1, 2, 3, 4, 5, 6].map(IMG) })] });
    await openQueue(page);
    await expect(stripLabel(page)).toBeVisible();
    await expect(thumbs(page)).toHaveCount(4);
    const more = page.getByLabel("עוד 2 תמונות");
    await expect(more).toBeVisible();
    await expect(more).toHaveText("+2");
  });

  // MT:MEH-1232:2 — a URL that does not load becomes a red ⚠ marker, not an empty box.
  test("a broken image URL is replaced by the «תמונה שבורה» marker", async ({ page }) => {
    await page.route((u) => u.hostname === "bread.jpg", (r) => r.abort("failed"));
    await stubAdmin(page, { rows: [pending(1, { name: "חלה של שקד", images: [BROKEN_IMG, IMG(1)] })] });
    await openQueue(page);
    const broken = page.getByRole("img", { name: "תמונה שבורה — לא נטענה" });
    await expect(broken).toHaveCount(1);
    await expect(broken).toBeVisible();
    await expect(broken).toHaveClass(/text-red-600/);
    // Both anchors are still there (each carries the «תמונה N של …» title), but
    // only the good one is a thumbnail by accessible name — the broken one's
    // name is now the ⚠ marker's label, which is exactly the swap the row asks for.
    await expect(page.locator('a[title^="תמונה "]')).toHaveCount(2);
    await expect(thumbs(page)).toHaveCount(1);
  });

  // MT:MEH-1232:3 — a click opens the ORIGINAL (untransformed) URL in a new tab.
  test("clicking a thumbnail opens the original URL in a new tab", async ({ page, context }) => {
    const original = IMG(9);
    await context.route(original, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>img</title>" }));
    await stubAdmin(page, { rows: [pending(1, { name: "חלה של שקד", images: [original] })] });
    await openQueue(page);
    const link = thumbs(page).first();
    await expect(link).toHaveAttribute("href", original);
    await expect(link).toHaveAttribute("target", "_blank");
    const [popup] = await Promise.all([page.waitForEvent("popup"), link.click()]);
    await popup.waitForLoadState("domcontentloaded");
    expect(popup.url()).toBe(original);
    await popup.close();
  });

  // MT:MEH-1232:4 — approved rows never carry the strip, images or not.
  test("an approved row with images has no strip", async ({ page }) => {
    await stubAdmin(page, { rows: [row({ status: "approved", name: "יקב הכרמל", images: [IMG(1), IMG(2)] })] });
    await openQueue(page);
    await expect(rowOf(page, "יקב הכרמל"), "control: the approved row never rendered").toHaveCount(1);
    await expect(stripLabel(page)).toHaveCount(0);
    await expect(thumbs(page)).toHaveCount(0);
  });

  // MT:MEH-1232:5 — a pending row WITHOUT images has no empty strip.
  test("a pending row without images has no strip at all", async ({ page }) => {
    await stubAdmin(page, { rows: [pending(1, { name: "חלה של שקד", images: [] })] });
    await openQueue(page);
    await expect(rowOf(page, "חלה של שקד").getByTestId("waiting-badge"), "control: the pending row never rendered").toBeVisible();
    await expect(stripLabel(page)).toHaveCount(0);
    await expect(thumbs(page)).toHaveCount(0);
  });
});

// ── MT:MEH-669 — admin lockout from producer registration ─────────────────

test.describe("admin lockout", () => {
  const gateAdmin = (page: Page) => page.getByTestId("register-producer-gate-admin");
  const gateProducer = (page: Page) => page.getByTestId("register-producer-gate");
  const hero = (page: Page) => page.getByTestId("register-hero-heading");

  // MT:MEH-669:2 — an admin never sees the form. ⚠️ STALE on the mechanism: an in-place gate, not a redirect (D1).
  test("an admin on /register/producer gets the terminal gate and no form, on the same URL", async ({ page }) => {
    await stubAdmin(page, { user: ADMIN });
    await page.goto("/register/producer");
    await expect(gateAdmin(page)).toBeVisible({ timeout: 15_000 });
    await expect(gateAdmin(page)).toContainText("חשבון ניהול לא יכול להירשם כבית עסק");
    await expect(hero(page)).toHaveCount(0);
    // Scoped to the page's main landmark: the Footer's newsletter field is a
    // textbox on every page and is not the registration form.
    await expect(page.locator("#main-content").getByRole("textbox")).toHaveCount(0);
    expect(new URL(page.url()).pathname.endsWith("/register/producer")).toBe(true);
  });

  // MT:MEH-669:7 — a consumer is NOT gated: the pre-flight renders, no redirect.
  test("a consumer on /register/producer sees the pre-flight, not a gate", async ({ page }) => {
    await stubAdmin(page, { user: CONSUMER });
    await page.goto("/register/producer");
    await expect(hero(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "לפני שמתחילים" })).toBeVisible();
    await expect(gateAdmin(page)).toHaveCount(0);
    await expect(gateProducer(page)).toHaveCount(0);
    expect(new URL(page.url()).pathname.endsWith("/register/producer")).toBe(true);
  });

  // MT:MEH-669:12 · MT:MEH-669:13 — the one surface that still role-gates the add-business CTA is the mobile AccountSheet (D2).
  for (const c of [
    { who: "admin", user: ADMIN, cta: 0, adminRow: 1 },
    { who: "consumer", user: CONSUMER, cta: 1, adminRow: 0 },
  ]) {
    test(`the account sheet ${c.cta ? "offers" : "hides"} «יש לך בית עסק?» for a ${c.who}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "mobile", "the AccountSheet is md:hidden — a mobile-only surface");
      await stubAdmin(page, { user: c.user });
      await page.goto("/about");
      const trigger = page.getByTestId("bottom-nav").getByRole("button", { name: new RegExp(c.user.name) });
      await expect(trigger, "control: the account tab never rendered the signed-in name").toBeVisible({ timeout: 15_000 });
      await trigger.click();
      const sheet = page.getByRole("dialog", { name: "חשבון" });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("link", { name: "יש לך בית עסק?" })).toHaveCount(c.cta);
      // The role reached the sheet: the admin row is the registry's other audience-gated entry.
      await expect(sheet.getByRole("link", { name: "ממשק אדמין" })).toHaveCount(c.adminRow);
    });
  }
});
