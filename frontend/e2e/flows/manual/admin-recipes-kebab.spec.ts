import { test, expect, type Page } from "../_cloudinary-stub";
import type { Route } from "@playwright/test";

/**
 * Spec:     manual/admin-recipes-kebab — MEH-1249 chunk 12d
 * Purpose:  Convert the CONVERT-verdict rows of two admin surfaces:
 *             MT:MEH-997          the recipes moderation page (/admin/recipes)
 *             MT:MEH-530:30-42    the queue's overflow menu + delete dialog
 *                                 (the 1027 A/B sub-sections of the licence card)
 *             MT:MEH-530:52-55    the request-changes entry point (1011 chunk 2)
 * Touches:  NO backend. Recipes live in a per-test store the five tabs read
 *           from and the three actions move rows through; the queue's DELETE,
 *           set-ambassador, request-changes and approve are captured and
 *           answered, and the row list re-reads the mutated store. Session via
 *           addInitScript — the chunk-11/12 pattern. Default CI target, no
 *           DEMO_* fixture, no storageState.
 * Does NOT: send anything to a server. Approving a real recipe publishes it,
 *           deleting a real business is irreversible, and an ambassador toggle
 *           changes a public trust tier — every one a write against the RAILWAY
 *           STAGING backend the storageState specs share
 *           (.github/workflows/e2e.yml:229-233), forbidden by the 13/07 ruling.
 * Related:  app/[locale]/admin/recipes/page.js · components/admin/AdminRowMenu.jsx ·
 *           app/[locale]/admin/producers/{page.js,AdminProducersTable.jsx,
 *           use-admin-producers.js,use-reject-flow.js} · components/StoryCardCanvas.jsx ·
 *           flows/20-admin-recipes-queue (the seeded tab-switch counterpart) ·
 *           manual/admin-producers-decisions.spec.ts (12b — the 422 auto-open).
 * History:  MEH-1249 chunk 12d.
 *
 * ─── The route interception, against the MEH-1968 three conditions ────────
 *
 *   1. No backend BEHAVIOUR is asserted — not that the recipe reaches the
 *      public page, not that the owner sees the note, not that the FK detaches
 *      on delete. Every test asks which body left the browser, which tab a row
 *      appears under after the stub moved it, which items a menu offers.
 *   2. The contracts are pinned: routers/admin_recipes.py (prefix
 *      /admin/recipes, `moderation_status`), ProducerAdminOut, the queue's
 *      action endpoints (use-admin-producers.js:101-166).
 *   3. The unmocked alternative publishes, deletes and re-tiers real rows on
 *      shared staging. Nothing here can be reached read-only.
 *
 * The Cloudinary import is the suite-wide STUB (MEH-1925), not part of this.
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 *
 * D1 · MT:MEH-997:1 places «מתכונים» "between «חוויות» and «משתמשים»". Card
 *      1016 grouped the nav: recipes sits in the CONTENT section after
 *      experiences, while users is in CORE (admin/layout.js NAV_SECTIONS).
 *      The link, its target and its icon are asserted; the neighbour is not.
 * D2 · MT:MEH-530:37 says a pending row's kebab holds "only «מחקו»". Card 226
 *      added «דחייה» to it (AdminProducersTable.jsx, `tone: "danger"`). Two
 *      items now; asserted as measured.
 * D3 · MT:MEH-530:52-53 describe a «בקשת השלמה» modal with CHIPS that fill a
 *      textarea and a «שלחו בקשה» button. Card 2209 replaced it with the one
 *      decision modal («החלטה על הבקשה של…»): the reasons are RADIOS in a
 *      «בקשת השלמה» group, the button reads «שליחת בקשת השלמה», and there is
 *      NO success toast on the completion path (use-reject-flow.js
 *      submitChanges closes and reloads, nothing else). Asserted as measured.
 * D4 · MT:MEH-530:57 ("empty feedback → toast") is unreachable in the new
 *      modal: the submit is disabled until a reason is chosen, and a chosen
 *      preset IS the feedback. Not converted; STALE.
 * D5 · MT:MEH-530:54 (the 422 auto-open) is 12b's «a 422 from the photo /
 *      license gate…» test. Pointed there, not duplicated.
 *
 * ─── Rows this chunk does NOT convert ──────────────────────────────────────
 *
 * 997:9 is a stray /map row appended to the wrong section. 530:35 and :43 are
 * real-device rows. 530:56 is the WhatsApp template (backend). 530:44-51
 * (/admin/users kebab), :11-16 (users pagination), :17-29 (reviews / categories
 * dialogs) are chunk 12e. 530:1-10 and :58-62 (registration + owner API) are
 * chunk 12f.
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const ADMIN = { id: 1, email: "admin@example.com", name: "מנהלת", role: "admin" };

type Recipe = { id: string; title: string; description: string; ingredients: string; instructions: string; created_at: string; published: boolean; moderation_status: string; moderation_notes: string | null };
const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: "r-1",
  title: "חלה מתוקה של שבת",
  description: "המתכון של סבתא, בגרסה ביתית.",
  ingredients: "קמח, שמרים, דבש, ביצים",
  instructions: "לשים, להתפיח שעה, לקלוע ולאפות 25 דקות.",
  created_at: "2026-09-01T08:00:00Z",
  published: false,
  moderation_status: "pending",
  moderation_notes: null,
  ...over,
});

type Row = Record<string, unknown> & { id: number; name: string; status: string };
function row(over: Partial<Row> = {}): Row {
  return {
    id: 501,
    name: "עסק לבדיקה",
    city: "חיפה",
    status: "pending",
    slug: null,
    ambassador: false,
    business_days_waiting: 1,
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
    requested_changes: null,
    changes_requested_at: null,
    risk_score: null,
    verification_tier: null,
    license_pending: false,
    referral_source: null,
    ...over,
  };
}
const approvedRow = (over: Partial<Row> = {}) => row({ id: 502, name: "עסק מאושר", status: "approved", slug: "esek-meushar", business_days_waiting: 0, ...over });

type Rec = { method: string; url: string; body: unknown };
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const rec = (r: Route, writes?: Rec[]) => {
  const req = r.request();
  let body: unknown = null;
  try { body = req.postDataJSON(); } catch { body = req.postData(); }
  writes?.push({ method: req.method(), url: new URL(req.url()).pathname.replace(/^.*\/api/, ""), body });
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type StubOpts = {
  recipes?: Recipe[];
  rows?: Row[];
  pendingModeration?: number;
  deleteStatus?: number;
  /** Delay before DELETE / set-ambassador answer — the in-flight window. */
  delayMs?: number;
  writes?: Rec[];
};

async function stubAdmin(page: Page, opts: StubOpts = {}): Promise<void> {
  let recipes: Recipe[] = opts.recipes ?? [];
  let rows: Row[] = opts.rows ?? [];
  const { pendingModeration = rows.filter((r) => r.status === "pending").length, deleteStatus = 200, delayMs = 0, writes } = opts;

  await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) => json(r, ADMIN));
  await page.route("**/users/me/favorites", (r) => json(r, []));
  await page.route("**/admin/dashboard", (r) =>
    json(r, { stats: { total_producers: rows.length, pending_producers: rows.filter((x) => x.status === "pending").length, total_users: 3, total_group_buys: 0, pending_moderation_count: pendingModeration, pending_kashrut_requests: 0 }, recent_activity: [], monthly_producers: [] }),
  );

  // Recipes: the list reads the store by moderation_status; the three actions move a row.
  await page.route((u) => /\/api\/admin\/recipes\/?$/.test(u.pathname), (r) => {
    const status = new URL(r.request().url()).searchParams.get("moderation_status");
    return json(r, !status || status === "all" ? recipes : recipes.filter((x) => x.moderation_status === status));
  });
  await page.route(/\/api\/admin\/recipes\/([^/]+)\/(approve|request-changes|reject)$/, (r) => {
    rec(r, writes);
    const [, id, action] = new URL(r.request().url()).pathname.match(/\/api\/admin\/recipes\/([^/]+)\/(approve|request-changes|reject)$/)!;
    const body = (() => { try { return r.request().postDataJSON() as { feedback?: string }; } catch { return {}; } })();
    recipes = recipes.map((x) =>
      x.id !== id ? x
        : action === "approve" ? { ...x, moderation_status: "approved", published: true }
        : action === "request-changes" ? { ...x, moderation_status: "needs_revision", moderation_notes: body.feedback ?? null }
        : { ...x, moderation_status: "rejected", moderation_notes: body.feedback ?? null },
    );
    return json(r, { ok: true });
  });

  // The queue's reads (the 12a/12b inventory) and the actions this chunk exercises.
  await page.route("**/admin/checklist-items", (r) => json(r, []));
  await page.route("**/admin/producers/*/review-checks", (r) => json(r, { checks: [] }));
  await page.route("**/admin/producers/*/approve", (r) => {
    rec(r, writes);
    const id = Number(new URL(r.request().url()).pathname.match(/producers\/(\d+)\/approve/)![1]);
    rows = rows.map((x) => (x.id === id ? { ...x, requested_changes: null, changes_requested_at: null } : x));
    return json(r, { ok: true });
  });
  await page.route("**/admin/producers/*/request-changes", (r) => {
    rec(r, writes);
    const id = Number(new URL(r.request().url()).pathname.match(/producers\/(\d+)\/request-changes/)![1]);
    const feedback = (r.request().postDataJSON() as { feedback: string }).feedback;
    rows = rows.map((x) => (x.id === id ? { ...x, requested_changes: feedback, changes_requested_at: "2026-09-05T10:00:00Z" } : x));
    return json(r, { ok: true });
  });
  await page.route("**/admin/producers/*/set-ambassador", async (r) => {
    rec(r, writes);
    const id = Number(new URL(r.request().url()).pathname.match(/producers\/(\d+)\/set-ambassador/)![1]);
    const { ambassador } = r.request().postDataJSON() as { ambassador: boolean };
    await sleep(delayMs);
    rows = rows.map((x) => (x.id === id ? { ...x, ambassador } : x));
    return json(r, { ok: true });
  });
  // DELETE /admin/producers/{id}. Registered BEFORE the presets route so the
  // latter (a GET on the same one-segment shape) takes priority; anything not
  // a DELETE falls through.
  await page.route("**/admin/producers/*", async (r) => {
    if (r.request().method() !== "DELETE") return r.fallback();
    rec(r, writes);
    const id = Number(new URL(r.request().url()).pathname.match(/producers\/(\d+)$/)![1]);
    await sleep(delayMs);
    if (deleteStatus === 200) rows = rows.filter((x) => x.id !== id);
    return json(r, deleteStatus === 200 ? { ok: true } : { detail: "boom" }, deleteStatus);
  });
  await page.route("**/admin/producers/rejection-presets", (r) =>
    json(r, [
      { key: "missing_docs", label: "מסמכים חסרים / לא קריאים" },
      { key: "missing_image", label: "תמונה ראשית חסרה" },
      { key: "incomplete_info", label: "מידע עסקי לא מלא (כתובת / טלפון / תיאור)" },
      { key: "not_eligible", label: "עסק לא עומד בתנאי הפלטפורמה" },
      { key: "other", label: "אחר (פירוט חופשי)" },
    ]),
  );
  await page.route((u) => /\/api\/admin\/producers\/?$/.test(u.pathname), (r) => {
    const status = new URL(r.request().url()).searchParams.get("status");
    return json(r, status ? rows.filter((x) => x.status === status) : rows);
  });
}

// ── locators + controls ────────────────────────────────────────────────────

const recipeRows = (page: Page) => page.getByTestId("admin-recipes-row");
const tab = (page: Page, v: string) => page.getByTestId(`admin-recipes-tab-${v}`);
const recipeModal = (page: Page) => page.locator("div.fixed").filter({ has: page.getByRole("heading", { name: /בקשי שינויים|דחי מתכון/ }) });
const posts = (writes: Rec[], tail: string) => writes.filter((w) => w.method === "POST" && w.url.endsWith(tail));

async function openRecipes(page: Page): Promise<void> {
  await page.goto("/admin/recipes");
  await expect(page.getByTestId("admin-recipes-title"), "control: the recipes page never rendered").toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("בטעינה...", { exact: true })).toHaveCount(0);
}

const rowOf = (page: Page, name: string) => page.locator("tbody tr").filter({ has: page.getByText(name, { exact: true }) });
const kebab = (page: Page, name: string) => rowOf(page, name).getByRole("button", { name: "פעולות נוספות" });
const menu = (page: Page) => page.getByRole("menu");
const item = (page: Page, name: string) => page.getByRole("menuitem", { name, exact: true });
const deleteDialog = (page: Page) => page.getByRole("dialog", { name: /^למחוק את/ });
const decisionModal = (page: Page) => page.getByTestId("decision-modal");

async function openQueue(page: Page): Promise<void> {
  await page.goto("/admin/producers");
  await expect(page.getByRole("heading", { name: "בתי עסק", exact: true }), "control: the queue never rendered").toBeVisible({ timeout: 15_000 });
}

/** Scroll, settle a frame, click, assert open — AdminRowMenu shuts on the scroll a bare click() causes (12b). */
async function openKebab(page: Page, name: string): Promise<void> {
  const btn = kebab(page, name);
  await btn.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
}

// ── MT:MEH-997 — /admin/recipes ───────────────────────────────────────────

test.describe("recipes moderation — /admin/recipes", () => {
  // MT:MEH-997:1 — the sidebar link. (D1: its neighbours moved; the link, target and page are asserted.)
  test("the admin nav links «מתכונים» to /admin/recipes", async ({ page }) => {
    await stubAdmin(page, { recipes: [recipe()] });
    await page.goto("/admin");
    const link = page.getByRole("link", { name: "מתכונים" });
    await expect(link, "control: the admin nav never rendered its recipes link").toBeVisible({ timeout: 15_000 });
    await expect(link).toHaveAttribute("href", /\/admin\/recipes$/);
    await link.click();
    await expect(page.getByTestId("admin-recipes-title")).toHaveText("מתכונים של בתי עסק");
    expect(new URL(page.url()).pathname.endsWith("/admin/recipes")).toBe(true);
  });

  // MT:MEH-997:2 — a submitted recipe sits in «ממתינים» as «ממתין» / «לא פורסם».
  test("a pending recipe shows under «ממתינים» as «ממתין» and «לא פורסם»", async ({ page }) => {
    await stubAdmin(page, { recipes: [recipe()] });
    await openRecipes(page);
    await expect(tab(page, "pending")).toHaveClass(/bg-primary/);
    await expect(recipeRows(page)).toHaveCount(1);
    const r = recipeRows(page).first();
    await expect(r).toContainText("חלה מתוקה של שבת");
    await expect(r.getByText("ממתין", { exact: true })).toBeVisible();
    await expect(r.getByText("לא פורסם", { exact: true })).toBeVisible();
    // Expanding shows the ingredients and instructions the moderator judges by.
    await r.getByRole("button", { name: "חלה מתוקה של שבת" }).click();
    await expect(page.getByText("מרכיבים:")).toBeVisible();
    await expect(page.getByText("קמח, שמרים, דבש, ביצים")).toBeVisible();
  });

  // MT:MEH-997:3 — the sidebar badge next to «לוח מחוונים» shows the moderation count the dashboard reports.
  test("the dashboard badge renders the pending-moderation count", async ({ page }) => {
    await stubAdmin(page, { recipes: [recipe()], pendingModeration: 3 });
    await openRecipes(page);
    // Two navs carry the badge (sidebar + the phone's horizontal nav); only the
    // one for the current project is visible, so filter on visibility.
    const badge = page.locator('[aria-label="3 פריטים לאישור"]:visible');
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveText("3");
    await expect(page.getByRole("link", { name: /^לוח מחוונים/ }).filter({ has: badge })).toHaveCount(1);
  });

  // MT:MEH-997:4 — «אשרי» → toast, out of pending, into «מאושרים» as published.
  test("«אשרי» approves: toast, gone from pending, present under «מאושרים» as «פורסם»", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { recipes: [recipe()], writes });
    await openRecipes(page);
    await recipeRows(page).first().getByRole("button", { name: "אשרי" }).click();
    await expect(page.getByText("המתכון אושר ופורסם")).toBeVisible();
    expect(posts(writes, "/approve").map((w) => w.url)).toEqual(["/admin/recipes/r-1/approve"]);
    await expect(page.getByTestId("admin-recipes-empty")).toHaveText("אין מתכונים בסטטוס הזה");
    await tab(page, "approved").click();
    await expect(recipeRows(page)).toHaveCount(1);
    await expect(recipeRows(page).first().getByText("מאושר", { exact: true })).toBeVisible();
    await expect(recipeRows(page).first().getByText("פורסם", { exact: true })).toBeVisible();
    await expect(recipeRows(page).first().getByRole("button", { name: "אשרי" })).toHaveCount(0);
  });

  // MT:MEH-997:5 — «שינויים»: blocked without a note, moves to «דרוש תיקון» with one.
  test("«שינויים» refuses an empty note, then moves the recipe to «דרוש תיקון» with the note", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { recipes: [recipe()], writes });
    await openRecipes(page);
    await recipeRows(page).first().getByRole("button", { name: "שינויים" }).click();
    const m = recipeModal(page);
    await expect(m.getByRole("heading", { name: "בקשי שינויים" })).toBeVisible();
    await expect(m.getByText('"חלה מתוקה של שבת"')).toBeVisible();
    await m.getByRole("button", { name: "אישור" }).click();
    await expect(page.getByText("יש למלא הערה")).toBeVisible();
    expect(posts(writes, "/request-changes")).toHaveLength(0);
    await expect(m).toBeVisible();
    await m.getByRole("textbox").fill("חסרות כמויות מדויקות במרכיבים");
    await m.getByRole("button", { name: "אישור" }).click();
    await expect(page.getByText("נשלחה בקשה לשינויים")).toBeVisible();
    expect(posts(writes, "/request-changes")[0]).toMatchObject({ url: "/admin/recipes/r-1/request-changes", body: { feedback: "חסרות כמויות מדויקות במרכיבים" } });
    await expect(m).toHaveCount(0);
    await tab(page, "needs_revision").click();
    await expect(recipeRows(page)).toHaveCount(1);
    await expect(recipeRows(page).first().getByText("דרוש תיקון", { exact: true })).toBeVisible();
    await recipeRows(page).first().getByRole("button", { name: "חלה מתוקה של שבת" }).click();
    await expect(page.getByText("הערות מודרציה")).toBeVisible();
    await expect(page.getByText("חסרות כמויות מדויקות במרכיבים", { exact: true })).toBeVisible();
  });

  // MT:MEH-997:6 — «דחי» with a reason → «נדחו».
  test("«דחי» with a reason moves the recipe to «נדחו»", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { recipes: [recipe()], writes });
    await openRecipes(page);
    await recipeRows(page).first().getByRole("button", { name: "דחי" }).click();
    const m = recipeModal(page);
    await expect(m.getByRole("heading", { name: "דחי מתכון" })).toBeVisible();
    await m.getByRole("textbox").fill("תוכן לא רלוונטי לפלטפורמה");
    await m.getByRole("button", { name: "אישור" }).click();
    await expect(page.getByText("המתכון נדחה")).toBeVisible();
    expect(posts(writes, "/reject")[0]).toMatchObject({ url: "/admin/recipes/r-1/reject", body: { feedback: "תוכן לא רלוונטי לפלטפורמה" } });
    await expect(page.getByTestId("admin-recipes-empty")).toBeVisible();
    await tab(page, "rejected").click();
    await expect(recipeRows(page)).toHaveCount(1);
    await expect(recipeRows(page).first().getByText("נדחה", { exact: true })).toBeVisible();
    await expect(recipeRows(page).first().getByRole("button", { name: "דחי" })).toHaveCount(0);
  });

  // MT:MEH-997:7 — five tabs, each its own filter, an empty one says so.
  test("the five tabs each request their own status and an empty tab reads «אין מתכונים בסטטוס הזה»", async ({ page }) => {
    const seen: string[] = [];
    await stubAdmin(page, { recipes: [recipe({ id: "r-1", moderation_status: "pending" }), recipe({ id: "r-2", title: "עוגת גבינה", moderation_status: "approved", published: true }), recipe({ id: "r-3", title: "חמוצים", moderation_status: "rejected" })] });
    page.on("request", (rq) => { const u = new URL(rq.url()); if (/\/api\/admin\/recipes\/?$/.test(u.pathname)) seen.push(u.searchParams.get("moderation_status") ?? ""); });
    await openRecipes(page);
    const expected: Record<string, number> = { pending: 1, needs_revision: 0, approved: 1, rejected: 1, all: 3 };
    for (const v of ["pending", "needs_revision", "approved", "rejected", "all"]) {
      await tab(page, v).click();
      await expect(tab(page, v)).toHaveClass(/bg-primary/);
      if (expected[v] === 0) await expect(page.getByTestId("admin-recipes-empty")).toHaveText("אין מתכונים בסטטוס הזה");
      else await expect(recipeRows(page)).toHaveCount(expected[v]);
    }
    expect(new Set(seen)).toEqual(new Set(["pending", "needs_revision", "approved", "rejected", "all"]));
  });

  // MT:MEH-997:8 — phone width: the page itself does not scroll sideways; the table and the tabs scroll inside their boxes.
  test("on the phone project the page has no horizontal scroll of its own", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "a narrow-viewport claim");
    await stubAdmin(page, { recipes: [recipe(), recipe({ id: "r-2", title: "מתכון עם כותרת ארוכה במיוחד שלא נכנסת בשורה אחת" })] });
    await openRecipes(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "the document must not be wider than the viewport").toBeLessThanOrEqual(0);
    await expect(page.locator("div.overflow-x-auto").filter({ has: page.locator("table") })).toHaveCount(1);
    await expect(page.locator("div.overflow-x-auto").filter({ has: tab(page, "all") })).toHaveCount(1);
  });
});

// ── MT:MEH-530:36-42 — the queue's overflow menu (1027 A) ─────────────────

test.describe("approvals queue — overflow menu", () => {
  // MT:MEH-530:36 — the secondary actions live in ⋮, not inline.
  test("suspend / ambassador / story / delete are not inline — only «✓ אשר», «בקשת השלמה», «עריכה» and ⋮ are", async ({ page }) => {
    await stubAdmin(page, { rows: [row(), approvedRow()] });
    await openQueue(page);
    for (const name of ["עסק לבדיקה", "עסק מאושר"]) {
      await expect(rowOf(page, name).getByRole("button", { name: /^(השהה|הפעל|הגדרה כשגרירה|הסרת תפקיד שגרירה|סטורי|מחקו)$/ })).toHaveCount(0);
      await expect(kebab(page, name)).toBeVisible();
    }
    const pending = rowOf(page, "עסק לבדיקה");
    await expect(pending.getByRole("button", { name: "✓ אשר" })).toBeVisible();
    await expect(pending.getByRole("button", { name: "בקשת השלמה" })).toBeVisible();
    await expect(pending.getByRole("link", { name: "עריכה" })).toBeVisible();
  });

  // MT:MEH-530:37 — a pending row's menu. ⚠️ STALE: «דחייה» joined «מחקו» (D2).
  test("a pending row's menu holds «דחייה» and «מחקו» only", async ({ page }) => {
    await stubAdmin(page, { rows: [row()] });
    await openQueue(page);
    await openKebab(page, "עסק לבדיקה");
    await expect(menu(page).getByRole("menuitem")).toHaveText(["דחייה", "מחקו"]);
    await expect(item(page, "מחקו")).toHaveClass(/text-red-600/);
  });

  // MT:MEH-530:38 — an approved row's menu: suspend · ambassador · story · delete (red).
  test("an approved row's menu holds suspend, ambassador, story and a red delete", async ({ page }) => {
    await stubAdmin(page, { rows: [approvedRow()] });
    await openQueue(page);
    await openKebab(page, "עסק מאושר");
    await expect(menu(page).getByRole("menuitem")).toHaveText(["השהה", "הגדרה כשגרירה", "סטורי", "מחקו"]);
    await expect(item(page, "מחקו")).toHaveClass(/text-red-600/);
    await expect(item(page, "השהה")).not.toHaveClass(/text-red-600/);
  });

  // MT:MEH-530:39 — «סטורי» opens the StoryCardCanvas panel under the row, and its close button removes it.
  test("«סטורי» opens the story-card panel under the row; its close button removes it", async ({ page }) => {
    await stubAdmin(page, { rows: [approvedRow()] });
    await openQueue(page);
    await openKebab(page, "עסק מאושר");
    await item(page, "סטורי").click();
    const panel = page.getByText("כרטיס אינסטגרם מוכן");
    await expect(panel).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "הורד" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "סגירת פאנל הסטורי" }).click();
    await expect(panel).toHaveCount(0);
  });

  // MT:MEH-530:40 — «הגדרה כשגרירה» POSTs the toggle; after the reload the item reads the opposite action.
  test("«הגדרה כשגרירה» POSTs ambassador:true and the menu then offers the removal", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { rows: [approvedRow()], writes });
    await openQueue(page);
    await openKebab(page, "עסק מאושר");
    await item(page, "הגדרה כשגרירה").click();
    await expect.poll(() => posts(writes, "/set-ambassador").length).toBe(1);
    expect(posts(writes, "/set-ambassador")[0]).toMatchObject({ url: "/admin/producers/502/set-ambassador", body: { ambassador: true } });
    await expect(menu(page)).toHaveCount(0);
    await openKebab(page, "עסק מאושר");
    await expect(item(page, "הסרת תפקיד שגרירה")).toBeVisible();
    await expect(item(page, "הגדרה כשגרירה")).toHaveCount(0);
  });

  // MT:MEH-530:41 · MT:MEH-530:30 — «מחקו» opens the modal dialog with the name; never window.confirm.
  test("«מחקו» opens a modal dialog naming the business — no browser confirm", async ({ page }) => {
    let nativeDialogs = 0;
    page.on("dialog", (d) => { nativeDialogs++; d.dismiss(); });
    await stubAdmin(page, { rows: [approvedRow()] });
    await openQueue(page);
    await openKebab(page, "עסק מאושר");
    await item(page, "מחקו").click();
    await expect(deleteDialog(page)).toBeVisible();
    await expect(deleteDialog(page)).toContainText('למחוק את "עסק מאושר"? פעולה זו אינה הפיכה.');
    await expect(deleteDialog(page).getByRole("button", { name: "מחקו" })).toBeVisible();
    await expect(deleteDialog(page).getByRole("button", { name: "ביטול" })).toBeVisible();
    expect(nativeDialogs, "a native confirm() must not be used").toBe(0);
  });

  // MT:MEH-530:42 — second click, outside click and Escape all close; Escape returns focus to ⋮.
  test("a second click, a click outside and Escape close the menu; Escape returns focus to ⋮", async ({ page }) => {
    await stubAdmin(page, { rows: [approvedRow()] });
    await openQueue(page);
    const btn = kebab(page, "עסק מאושר");
    await openKebab(page, "עסק מאושר");
    await btn.click();
    await expect(menu(page)).toHaveCount(0);
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await openKebab(page, "עסק מאושר");
    await page.getByRole("heading", { name: "בתי עסק", exact: true }).click();
    await expect(menu(page)).toHaveCount(0);
    await openKebab(page, "עסק מאושר");
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
    await expect(btn).toBeFocused();
  });
});

// ── MT:MEH-530:30-34 — the delete dialog (1027 B) ─────────────────────────

test.describe("approvals queue — delete dialog", () => {
  async function openDelete(page: Page, name: string): Promise<void> {
    await openKebab(page, name);
    await item(page, "מחקו").click();
    await expect(deleteDialog(page)).toBeVisible();
  }

  // MT:MEH-530:31 — «ביטול» and Escape close without a DELETE; Escape is ignored mid-delete.
  test("«ביטול» and Escape close without deleting; Escape mid-delete does nothing", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { rows: [approvedRow()], delayMs: 1_500, writes });
    await openQueue(page);
    await openDelete(page, "עסק מאושר");
    await deleteDialog(page).getByRole("button", { name: "ביטול" }).click();
    await expect(deleteDialog(page)).toHaveCount(0);
    await openDelete(page, "עסק מאושר");
    await page.keyboard.press("Escape");
    await expect(deleteDialog(page)).toHaveCount(0);
    expect(writes.filter((w) => w.method === "DELETE"), "nothing may have been deleted").toHaveLength(0);
    await openDelete(page, "עסק מאושר");
    await deleteDialog(page).getByRole("button", { name: "מחקו" }).click();
    await expect(deleteDialog(page).getByRole("button", { name: "מוחקים…" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(deleteDialog(page), "Escape must not close a dialog whose delete is in flight").toBeVisible();
    await expect(deleteDialog(page)).toHaveCount(0, { timeout: 5_000 });
  });

  // MT:MEH-530:32 — confirm: DELETE fires, «מוחקים…», both buttons locked, dialog closes, list refreshed.
  test("confirming deletes: one DELETE, «מוחקים…» with both buttons locked, then the row is gone", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { rows: [approvedRow(), row()], delayMs: 1_200, writes });
    await openQueue(page);
    await openDelete(page, "עסק מאושר");
    const confirm = deleteDialog(page).getByRole("button", { name: /^(מחקו|מוחקים…)$/ });
    await confirm.click();
    await expect(confirm).toHaveText("מוחקים…");
    await expect(confirm).toBeDisabled();
    await expect(deleteDialog(page).getByRole("button", { name: "ביטול" })).toBeDisabled();
    await expect(deleteDialog(page)).toHaveCount(0, { timeout: 5_000 });
    expect(writes.filter((w) => w.method === "DELETE").map((w) => w.url)).toEqual(["/admin/producers/502"]);
    await expect(rowOf(page, "עסק מאושר")).toHaveCount(0);
    await expect(rowOf(page, "עסק לבדיקה"), "the other row must survive the refresh").toHaveCount(1);
  });

  // MT:MEH-530:33 — a failed DELETE: error toast, dialog stays open.
  test("a failed DELETE shows the error toast and keeps the dialog open", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { rows: [approvedRow()], deleteStatus: 500, writes });
    await openQueue(page);
    await openDelete(page, "עסק מאושר");
    await deleteDialog(page).getByRole("button", { name: "מחקו" }).click();
    await expect(page.getByText("מחיקת בית העסק נכשלה. נסו שוב.")).toBeVisible();
    await expect(deleteDialog(page)).toBeVisible();
    await expect(deleteDialog(page).getByRole("button", { name: "מחקו" })).toBeEnabled();
    expect(writes.filter((w) => w.method === "DELETE")).toHaveLength(1);
    await expect(rowOf(page, "עסק מאושר")).toHaveCount(1);
  });

  // MT:MEH-530:34 — a busy menu item stays focusable and aria-disabled, and its click is a no-op.
  test("a busy menu item is aria-disabled, still focusable, and a click on it fires nothing", async ({ page }) => {
    const writes: Rec[] = [];
    // A long in-flight window: the whole reopen → inspect → click sequence below
    // must land while the first toggle is still pending, or the item is simply
    // enabled again and the click is a real second toggle.
    await stubAdmin(page, { rows: [approvedRow()], delayMs: 8_000, writes });
    await openQueue(page);
    await openKebab(page, "עסק מאושר");
    await item(page, "הגדרה כשגרירה").click();
    await expect.poll(() => posts(writes, "/set-ambassador").length).toBe(1);
    await openKebab(page, "עסק מאושר");
    const busy = item(page, "הגדרה כשגרירה");
    await expect(busy).toHaveAttribute("aria-disabled", "true");
    await expect(busy).not.toHaveAttribute("disabled", /.*/);
    await busy.focus();
    await expect(busy).toBeFocused();
    // force: Playwright's actionability treats aria-disabled as "not enabled"
    // and would WAIT for the item to re-enable — i.e. for the in-flight toggle
    // to finish — and then perform a real second toggle. The row's claim is
    // about a click that lands on the busy item, so the wait is bypassed.
    await busy.click({ force: true });
    await expect(menu(page), "a no-op click must not close the menu either").toBeVisible();
    const second = await expect.poll(() => posts(writes, "/set-ambassador").length, { timeout: 1_500 }).toBeGreaterThan(1).then(() => true).catch(() => false);
    expect(second, "the busy item must not fire a second toggle").toBe(false);
  });
});

// ── MT:MEH-530:52 · MT:MEH-530:53 · MT:MEH-530:55 — request changes (1011 chunk 2) ─

test.describe("approvals queue — request changes", () => {
  // MT:MEH-530:52 — «בקשת השלמה» beside «✓ אשר» opens the decision modal on the completion group. ⚠️ STALE on the modal's shape (D3).
  test("«בקשת השלמה» opens the decision modal with the completion group focused", async ({ page }) => {
    await stubAdmin(page, { rows: [row()] });
    await openQueue(page);
    await rowOf(page, "עסק לבדיקה").getByRole("button", { name: "בקשת השלמה" }).click();
    await expect(decisionModal(page)).toBeVisible();
    await expect(decisionModal(page).getByRole("heading", { name: 'החלטה על הבקשה של "עסק לבדיקה"' })).toBeVisible();
    await expect(decisionModal(page).getByRole("group", { name: "בקשת השלמה" }).getByRole("radio").first()).toBeFocused();
    await expect(decisionModal(page).getByTestId("decision-submit")).toBeDisabled();
  });

  // MT:MEH-530:53 — choose a reason, send: POST with the label as feedback, modal closes, the row gains «ממתין להשלמה». ⚠️ STALE: radios not chips; no success toast (D3).
  test("sending a completion request POSTs the label and the row gains the «ממתין להשלמה» badge", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { rows: [row()], writes });
    await openQueue(page);
    await expect(rowOf(page, "עסק לבדיקה").getByText("ממתין להשלמה")).toHaveCount(0);
    await rowOf(page, "עסק לבדיקה").getByRole("button", { name: "בקשת השלמה" }).click();
    await decisionModal(page).getByRole("radio", { name: "תמונה ראשית חסרה" }).check();
    await expect(decisionModal(page).getByTestId("decision-submit")).toHaveText("שליחת בקשת השלמה");
    await decisionModal(page).getByTestId("decision-submit").click();
    await expect.poll(() => posts(writes, "/request-changes").length).toBe(1);
    expect(posts(writes, "/request-changes")[0]).toMatchObject({ url: "/admin/producers/501/request-changes", body: { feedback: "תמונה ראשית חסרה" } });
    await expect(decisionModal(page)).toHaveCount(0);
    const badge = rowOf(page, "עסק לבדיקה").getByText("ממתין להשלמה");
    await expect(badge).toBeVisible();
    await expect(rowOf(page, "עסק לבדיקה").getByText("ממתינה לאישור האדמין", { exact: true }), "the status chip stays pending").toBeVisible();
  });

  // MT:MEH-530:55 — once approve succeeds the trail badge is gone.
  test("a successful approve clears the «ממתין להשלמה» trail", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { rows: [row({ requested_changes: "תמונה ראשית חסרה", changes_requested_at: "2026-09-04T10:00:00Z" })], writes });
    await openQueue(page);
    await expect(rowOf(page, "עסק לבדיקה").getByText("ממתין להשלמה"), "control: the trail badge never rendered").toBeVisible();
    await expect(page.getByRole("button", { name: /^רשימת בדיקה לפני אישור/ })).toContainText("/0)");
    await rowOf(page, "עסק לבדיקה").getByRole("button", { name: "✓ אשר" }).click();
    await expect.poll(() => posts(writes, "/approve").length).toBe(1);
    await expect(page.getByText("העסק אושר")).toBeVisible();
    await expect(rowOf(page, "עסק לבדיקה").getByText("ממתין להשלמה")).toHaveCount(0);
  });
});
