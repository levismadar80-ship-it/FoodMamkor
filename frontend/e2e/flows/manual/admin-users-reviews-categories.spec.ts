import { test, expect, type Page } from "../_cloudinary-stub";
import type { Locator, Route } from "@playwright/test";

/**
 * Spec:     manual/admin-users-reviews-categories — MEH-1249 chunk 12e
 * Purpose:  Convert the CONVERT-verdict rows of four sub-sections of the
 *           licence card (card 530) that live on three admin pages:
 *             MT:MEH-530:11-15    /admin/users client-side pagination (1046)
 *             MT:MEH-530:17-21    /admin/reviews delete dialog (1040)
 *             MT:MEH-530:22-28    /admin/content category delete dialog +
 *                                 producer_count (1023 chunk B, 1034)
 *             MT:MEH-530:44-50    /admin/users role kebab (1023 chunk A)
 * Touches:  NO backend. Users, reviews and categories live in per-test stores
 *           the pages read; block / role / DELETE mutate the store and the
 *           page's own reload reads it back. Session via addInitScript — the
 *           chunk-11/12 pattern. Default CI target, no DEMO_* fixture, no
 *           storageState.
 * Does NOT: send anything to a server. Promoting a real user, deleting a real
 *           review or a real category (FK cascade over producer_categories) —
 *           each a write against the RAILWAY STAGING backend the storageState
 *           specs share (.github/workflows/e2e.yml:229-233), forbidden by the
 *           13/07 ruling.
 * Related:  app/[locale]/admin/users/page.js · app/[locale]/admin/reviews/page.jsx ·
 *           app/[locale]/admin/content/page.js · components/admin/AdminRowMenu.jsx ·
 *           manual/admin-recipes-kebab.spec.ts (12d — the queue's kebab) ·
 *           manual/admin-settings-licence-actions.spec.ts (12c — users «חסום»).
 * History:  MEH-1249 chunk 12e.
 *
 * ─── The route interception, against the MEH-1968 three conditions ────────
 *
 *   1. No backend BEHAVIOUR is asserted — not that a role really changes, not
 *      that the FK cascade detaches producers, not what the count query
 *      returns. Every test asks which request left the browser with which body,
 *      what the page rendered from a fixed answer, and which page it stayed on.
 *   2. The contracts are pinned: UserAdminOut / UserRoleUpdate
 *      (schemas.py:4156-4172), AdminReviewOut (:4114), CategoryOut with the
 *      MEH-1034 `producer_count` (:1125-1158); routers admin_extra.py
 *      (/admin/users, /admin/categories), reviews.py (/admin/reviews,
 *      DELETE /reviews/{id}).
 *   3. The unmocked alternative mutates real rows on shared staging, and the
 *      pagination rows need 60 users — no read-only path reaches any of it.
 *
 * Every /api/* request the stubs do not answer is recorded and answered 404, so
 * a missing stub shows up in the control test by name instead of as a 401 →
 * /auth/refresh → /login bounce mid-test (the chunk-12a lesson).
 *
 * The Cloudinary import is the suite-wide STUB (MEH-1925), not part of this.
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 *
 * D1 · MT:MEH-530:49 expects "no «הסירי הרשאות» in the menu" on the admin's own
 *      row. Measured: an admin row offers no promote either, so `items` is
 *      empty and AdminRowMenu renders NOTHING (`if (items.length === 0) return
 *      null`) — there is no ⋮ on the own row at all, same as the super-admin
 *      row (:48). Asserted as measured.
 * D2 · MT:MEH-530:45 says the menu "opens toward the start (right in RTL)".
 *      The panel is portaled and `fixed`, its end edge pinned to the trigger's
 *      end edge (insetInlineEnd) — asserted by geometry: the panel's LEFT edge
 *      sits at the trigger's left edge and the panel extends to the right.
 * D3 · The users role-confirm modal (:46-47), unlike the reviews and categories
 *      dialogs whose code comments say they MIRROR it, carries no role="dialog" /
 *      aria-modal and does not close on Escape — reached here by its copy, not
 *      by role. Opened as MEH-2268, not fixed here.
 * D4 · MT:MEH-530:50 says the menu items are "reachable by Tab". Measured then:
 *      the panel is portaled to the end of <body> and nothing moved focus into
 *      it, so Tab from the open ⋮ landed on the NEXT ROW's favorites button
 *      (probe: document.activeElement after Tab, both projects). CLOSED by
 *      MEH-2267, and the fix does not make the original assertion pass — it
 *      makes it obsolete. Under the WAI-ARIA APG menu-button pattern the item
 *      list is reached by the OPEN itself (focus moves to the first item), and
 *      Tab is the key that LEAVES the menu. So a spec asserting "Tab reaches
 *      the first item" would now be asserting non-APG behaviour. The test below
 *      asserts the contract that satisfies the MT row's intent — the items are
 *      keyboard-reachable without tabbing the rest of the page — plus the two
 *      halves the old shape could not cover: Arrow navigation, and Tab
 *      returning focus to the trigger. Divergence from the card's "the fix
 *      turns it into an unexpected pass" flagged on MEH-2267 rather than
 *      resolved silently.
 * D5 · MT:MEH-530:23 + :28 expect «מחיקת '<שם>' — N בתי עסק משויכים». The count
 *      renders; the NAME does not — `'{name}'` in he.json is an ICU quoted
 *      literal, so the dialog reads «מחיקת {name} — 3 בתי עסק משויכים». Already
 *      on MEH-2261 (found by chunk 11f on the locations card, which lists this
 *      very key); asserted correctly under test.fail() citing it.
 *
 * ─── Rows this chunk does NOT convert ──────────────────────────────────────
 *
 * 530:16 and :51 are mobile / real-device rows. 530:29 (the API shape of
 * GET /admin/categories vs the public GET /categories) is a backend-tests row.
 * 530:1-10 and :58-62 (registration + owner API) are chunk 12f.
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = { id: uuid(1), email: "admin@example.com", name: "מנהלת", role: "admin" };
const SUPER_ADMIN_EMAIL = "levismadar80@gmail.com"; // admin/users/page.js:13

type User = { id: string; email: string; name: string; city: string | null; phone: string | null; role: string; is_blocked: boolean; producer_id: string | null; favorites_count: number; created_at: string };
const user = (n: number, over: Partial<User> = {}): User => ({
  id: uuid(100 + n),
  email: `user${n}@example.com`,
  name: `משתמשת ${n}`,
  city: n % 2 ? "חיפה" : null,
  phone: null,
  role: n % 3 === 0 ? "producer" : "consumer",
  is_blocked: false,
  producer_id: null,
  favorites_count: n % 4,
  created_at: "2026-08-01T08:00:00Z",
  ...over,
});
/** 60 rows, the three special ones first — the store is the server order. */
const SIXTY: User[] = [
  { ...user(1), id: ADMIN.id, email: ADMIN.email, name: ADMIN.name, role: "admin" },
  user(2, { name: "רונית אדמין", role: "admin" }),
  user(3, { name: "סמדר", email: SUPER_ADMIN_EMAIL, role: "admin" }),
  ...Array.from({ length: 57 }, (_, i) => user(i + 4)),
];

type Review = { id: string; producer_id: string; producer_name: string; user_id: string; user_name: string; user_email: string; stars: number; body: string | null; is_hidden: boolean; created_at: string };
const review = (n: number, over: Partial<Review> = {}): Review => ({
  id: uuid(200 + n),
  producer_id: uuid(300),
  producer_name: "מאפיית שקד",
  user_id: uuid(100 + n),
  user_name: `משתמשת ${n}`,
  user_email: `user${n}@example.com`,
  stars: 4,
  body: "לחם נהדר, שירות מהיר.",
  is_hidden: false,
  created_at: "2026-09-01T08:00:00Z",
  ...over,
});
const REVIEWS: Review[] = [review(1, { user_name: "דנה כהן" }), review(2, { producer_name: "גבינות הגליל", stars: 2 })];

type Category = { id: number; name: string; slug: string; is_system: boolean; producer_count: number };
const CATEGORIES: Category[] = [
  { id: 1, name: "לחמים ואפייה", slug: "bakery", is_system: false, producer_count: 3 },
  { id: 3, name: "פירות וירקות", slug: "produce", is_system: false, producer_count: 0 },
  { id: 5, name: "דבש ומרקחות", slug: "honey", is_system: false, producer_count: 1 },
];

type Rec = { method: string; url: string; body: unknown };
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
/** Records the write and returns its parsed body, so a handler reads it once. */
const rec = (r: Route, writes?: Rec[]): unknown => {
  const req = r.request();
  let body: unknown = null;
  try { body = req.postDataJSON(); } catch { body = req.postData(); }
  // Strip the proxy prefix up to the FIRST "/api" — a greedy `.*\/api` would eat a
  // later "/api" segment too. Nothing before it is asserted on.
  const pathname = new URL(req.url()).pathname;
  const at = pathname.indexOf("/api");
  if (at < 0) throw new Error(`rec(): no /api segment in ${pathname}`);
  writes?.push({ method: req.method(), url: pathname.slice(at + "/api".length), body });
  return body;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type StubOpts = {
  users?: User[];
  reviews?: Review[];
  categories?: Category[];
  /** Status the DELETE handlers answer with (reviews and categories). */
  deleteStatus?: number;
  /** Delay before a DELETE answers — the in-flight window. */
  delayMs?: number;
  writes?: Rec[];
  /** Every GET /admin/users, with its query params — the filter → reload trail. */
  listCalls?: Record<string, string>[];
};

type Stub = { unstubbed: string[] };

async function stubAdmin(page: Page, opts: StubOpts = {}): Promise<Stub> {
  let users: User[] = opts.users ?? SIXTY;
  let reviews: Review[] = opts.reviews ?? REVIEWS;
  let categories: Category[] = opts.categories ?? CATEGORIES;
  const { deleteStatus = 200, delayMs = 0, writes, listCalls } = opts;
  const unstubbed: string[] = [];

  await page.addInitScript(() => {
    localStorage.setItem("token", "e2e-token");
    // The cookie banner is z-[1100] and sits over the lower rows on the Pixel 5;
    // a menu item under it is "intercepted" on click. Consent is incidental here.
    localStorage.setItem("cookieConsent", "essential");
  });
  // Registered FIRST so every later route outranks it: whatever reaches it is a
  // read this inventory missed. 404, not 401 — a 401 would bounce the session.
  await page.route((u) => /\/api\//.test(u.pathname), (r) => {
    unstubbed.push(`${r.request().method()} ${new URL(r.request().url()).pathname}`);
    return json(r, { detail: "unstubbed" }, 404);
  });
  await page.route("**/auth/me", (r) => json(r, ADMIN));
  await page.route("**/users/me/favorites", (r) => json(r, []));
  // Public, and incidental: the admin nav badge counter. Answered so the 404 catch-all stays a clean instrument.
  await page.route("**/experiences/count", (r) => json(r, { count: 0 }));
  await page.route("**/categories", (r) => json(r, categories.map(({ producer_count: _c, ...c }) => ({ ...c, producer_count: null }))));
  await page.route("**/admin/dashboard", (r) =>
    json(r, {
      stats: { total_producers: 4, pending_producers: 0, total_users: users.length, total_group_buys: 0, pending_moderation_count: 0, pending_kashrut_requests: 0 },
      recent_activity: [],
      monthly_producers: [],
    }),
  );

  // /admin/users — the search/role filters are SERVER-side (page.js:45-56), so
  // the stub applies them; pagination is the page's own slice of the answer.
  await page.route((u) => /\/api\/admin\/users\/?$/.test(u.pathname), (r) => {
    const params = Object.fromEntries(new URL(r.request().url()).searchParams.entries());
    listCalls?.push(params);
    let out = users;
    if (params.role) out = out.filter((x) => x.role === params.role);
    if (params.search) out = out.filter((x) => x.name.includes(params.search) || x.email.includes(params.search));
    return json(r, out);
  });
  await page.route(/\/api\/admin\/users\/([^/]+)\/block$/, (r) => {
    rec(r, writes);
    const id = new URL(r.request().url()).pathname.match(/users\/([^/]+)\/block$/)![1];
    users = users.map((x) => (x.id === id ? { ...x, is_blocked: !x.is_blocked } : x));
    return json(r, { ok: true });
  });
  await page.route(/\/api\/admin\/users\/([^/]+)\/role$/, (r) => {
    const body = rec(r, writes) as { role: string };
    const id = new URL(r.request().url()).pathname.match(/users\/([^/]+)\/role$/)![1];
    users = users.map((x) => (x.id === id ? { ...x, role: body.role } : x));
    return json(r, { ok: true });
  });

  // /admin/reviews + DELETE /reviews/{id}
  await page.route((u) => /\/api\/admin\/reviews\/?$/.test(u.pathname), (r) => json(r, reviews));
  await page.route(/\/api\/reviews\/([^/]+)$/, async (r) => {
    if (r.request().method() !== "DELETE") return r.fallback();
    rec(r, writes);
    const id = new URL(r.request().url()).pathname.match(/reviews\/([^/]+)$/)![1];
    await sleep(delayMs);
    if (deleteStatus === 200) reviews = reviews.filter((x) => x.id !== id);
    return json(r, deleteStatus === 200 ? { ok: true } : { detail: "boom" }, deleteStatus);
  });

  // /admin/categories (+ DELETE /admin/categories/{id})
  await page.route((u) => /\/api\/admin\/categories\/?$/.test(u.pathname), (r) => {
    if (r.request().method() === "GET") { listCalls?.push({ categories: "get" }); return json(r, categories); }
    return r.fallback();
  });
  await page.route(/\/api\/admin\/categories\/(\d+)$/, async (r) => {
    if (r.request().method() !== "DELETE") return r.fallback();
    rec(r, writes);
    const id = Number(new URL(r.request().url()).pathname.match(/categories\/(\d+)$/)![1]);
    await sleep(delayMs);
    if (deleteStatus === 200) categories = categories.filter((x) => x.id !== id);
    return json(r, deleteStatus === 200 ? { ok: true } : { detail: "boom" }, deleteStatus);
  });

  return { unstubbed };
}

// ── helpers ────────────────────────────────────────────────────────────────

const userRows = (page: Page) => page.getByRole("table").locator("tbody > tr");
/** Escape a literal for use inside a RegExp — fixture names are Hebrew + digits today, but the helper must not silently mis-match on `.`, `(`, `*` if reused. */
const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const userRow = (page: Page, name: string) => page.getByRole("row", { name: new RegExp(`(^|\\s)${reEscape(name)}(\\s|$)`) });
const kebab = (row: Locator) => row.getByRole("button", { name: "פעולות נוספות" });
const menu = (page: Page) => page.getByRole("menu");

/** The chunk-12b/12d open: scroll first, let the reflow settle, then click —
 *  AdminRowMenu closes on ANY scroll, and a bare click on the Pixel 5 profile
 *  scrolls the row into view AFTER the menu opened. */
async function openKebab(row: Locator): Promise<Locator> {
  const btn = kebab(row);
  await btn.scrollIntoViewIfNeeded();
  await btn.page().evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  return btn;
}

async function openUsers(page: Page): Promise<void> {
  await page.goto("/he/admin/users");
  await expect(page.getByRole("heading", { name: "משתמשים" }), "control: the users page never rendered").toBeVisible({ timeout: 15_000 });
  await expect(userRows(page).first()).toBeVisible();
}

/** Inverted bounded wait — proves a write did NOT leave the browser. */
async function expectNoWrite(writes: Rec[], method: string, why: string, ms = 2_500): Promise<void> {
  const start = writes.filter((w) => w.method === method).length;
  await sleep(ms);
  expect(writes.filter((w) => w.method === method).length, why).toBe(start);
}

/** A native confirm() must never fire — any browser dialog is recorded and dismissed. */
function trapNativeDialogs(page: Page): string[] {
  const fired: string[] = [];
  page.on("dialog", (d) => { fired.push(d.type()); void d.dismiss(); });
  return fired;
}

// ── MT:MEH-530:11-15 — /admin/users pagination (1046) ─────────────────────

test.describe("/admin/users — pagination", () => {
  test("control: every read the page makes is stubbed", async ({ page }) => {
    const stub = await stubAdmin(page);
    await openUsers(page);
    await expect(userRows(page)).toHaveCount(25);
    expect(stub.unstubbed, "an /api/* read reached the 404 catch-all — a stub is missing").toEqual([]);
  });

  // MT:MEH-530:11 — 60 users → 25 rows, «עמוד 1 מתוך 3», «הקודם» disabled, the header counts all 60.
  test("the first page shows 25 of 60, names page 1 of 3, and the header still counts the whole set", async ({ page }) => {
    await stubAdmin(page);
    await openUsers(page);
    await expect(userRows(page)).toHaveCount(25);
    await expect(page.getByText("עמוד 1 מתוך 3")).toBeVisible();
    await expect(page.getByRole("button", { name: "הקודם" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "הבא" })).toBeEnabled();
    await expect(page.getByText("60 משתמשים")).toBeVisible();
    await expect(userRow(page, "משתמשת 25")).toBeVisible();
    await expect(userRow(page, "משתמשת 26")).toHaveCount(0);
  });

  // MT:MEH-530:12 — «הבא» advances by 25; on the last page it is disabled.
  test("«הבא» walks to the next 25 and is disabled on the last page", async ({ page }) => {
    await stubAdmin(page);
    await openUsers(page);
    const next = page.getByRole("button", { name: "הבא" });
    await next.click();
    await expect(page.getByText("עמוד 2 מתוך 3")).toBeVisible();
    await expect(userRows(page)).toHaveCount(25);
    await expect(userRow(page, "משתמשת 26")).toBeVisible();
    await expect(userRow(page, "משתמשת 25")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "הקודם" })).toBeEnabled();
    await next.click();
    await expect(page.getByText("עמוד 3 מתוך 3")).toBeVisible();
    await expect(userRows(page)).toHaveCount(10);
    await expect(next).toBeDisabled();
  });

  // MT:MEH-530:13 — the page-size select changes the row count and returns to page 1.
  test("changing the page size re-slices and returns to page 1", async ({ page }) => {
    await stubAdmin(page);
    await openUsers(page);
    await page.getByRole("button", { name: "הבא" }).click();
    await expect(page.getByText("עמוד 2 מתוך 3")).toBeVisible();
    await page.getByLabel("שורות בעמוד").selectOption("50");
    await expect(userRows(page)).toHaveCount(50);
    await expect(page.getByText("עמוד 1 מתוך 2")).toBeVisible();
    await expect(userRow(page, ADMIN.name), "page 1 again — the first row is back").toBeVisible();
    await page.getByLabel("שורות בעמוד").selectOption("100");
    await expect(userRows(page)).toHaveCount(60);
    await expect(page.getByText("עמוד 1 מתוך 1")).toBeVisible();
  });

  // MT:MEH-530:14 — a role filter or a search resets to page 1 with the filtered set.
  test("a role filter or a search from page 2 lands on page 1 of the filtered result", async ({ page }) => {
    const listCalls: Record<string, string>[] = [];
    await stubAdmin(page, { listCalls });
    await openUsers(page);
    await page.getByRole("button", { name: "הבא" }).click();
    await expect(page.getByText("עמוד 2 מתוך 3")).toBeVisible();
    const roleSelect = page.locator("select").filter({ has: page.locator('option[value="producer"]') });
    await roleSelect.selectOption("producer");
    await expect.poll(() => listCalls.at(-1)?.role, "the filter is server-side: the reload carries role=producer").toBe("producer");
    const producers = SIXTY.filter((u) => u.role === "producer").length;
    await expect(page.getByText(`${producers} משתמשים`)).toBeVisible();
    await expect(page.getByText("עמוד 1 מתוך 1")).toBeVisible();
    await expect(userRows(page)).toHaveCount(producers);
    // Back to all, forward to page 2, then a search — same reset.
    await roleSelect.selectOption("all");
    await expect(page.getByText("עמוד 1 מתוך 3")).toBeVisible();
    await page.getByRole("button", { name: "הבא" }).click();
    await expect(page.getByText("עמוד 2 מתוך 3")).toBeVisible();
    await page.getByPlaceholder("חיפוש לפי אימייל או שם...").fill("משתמשת 4");
    await page.keyboard.press("Enter");
    await expect.poll(() => listCalls.at(-1)?.search).toBe("משתמשת 4");
    await expect(page.getByText("עמוד 1 מתוך 1")).toBeVisible();
    // «משתמשת 4» + 40-49: eleven names contain the string.
    await expect(userRows(page)).toHaveCount(11);
  });

  // MT:MEH-530:15 — row actions on page 2 work and a block does not yank the admin back to page 1.
  test("blocking a user on page 2 keeps page 2, and the kebab there opens its dialog", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes });
    await openUsers(page);
    await page.getByRole("button", { name: "הבא" }).click();
    await expect(page.getByText("עמוד 2 מתוך 3")).toBeVisible();
    const row = userRow(page, "משתמשת 30");
    await row.getByRole("button", { name: "חסום", exact: true }).click();
    await expect.poll(() => writes.map((w) => `${w.method} ${w.url}`)).toEqual([`POST /admin/users/${uuid(130)}/block`]);
    await expect(row.getByRole("button", { name: "שחרר חסימה" }), "the reload shows the blocked state").toBeVisible();
    await expect(row).toHaveClass(/bg-red-50/);
    await expect(page.getByText("עמוד 2 מתוך 3"), "still on page 2 after the reload").toBeVisible();
    await openKebab(row);
    await menu(page).getByRole("menuitem", { name: "העלי לאדמין" }).click();
    await expect(page.getByText("את בטוחה שברצונך להעניק הרשאות אדמין למשתמשת 30?")).toBeVisible();
    await page.getByRole("button", { name: "ביטול" }).click();
    await expect(page.getByText(/את בטוחה שברצונך/)).toHaveCount(0);
    await expect(page.getByText("עמוד 2 מתוך 3")).toBeVisible();
  });
});

// ── MT:MEH-530:44-50 — /admin/users role kebab (1023 chunk A) ──────────────

test.describe("/admin/users — the role kebab", () => {
  // MT:MEH-530:44 — «חסום» stays inline; promote / demote live only in the ⋮ menu.
  test("the actions cell holds an inline «חסום» and a ⋮, and no inline promote/demote", async ({ page }) => {
    await stubAdmin(page);
    await openUsers(page);
    const row = userRow(page, "משתמשת 4");
    await expect(row.getByRole("button", { name: "חסום", exact: true })).toBeVisible();
    await expect(kebab(row)).toBeVisible();
    await expect(kebab(row)).toHaveAttribute("aria-haspopup", "menu");
    await expect(page.getByRole("button", { name: "העלי לאדמין" }), "promote is not an inline button on any row").toHaveCount(0);
    await expect(page.getByRole("button", { name: "הסירי הרשאות" })).toHaveCount(0);
    await openKebab(row);
    await expect(menu(page).getByRole("menuitem", { name: "העלי לאדמין" })).toBeVisible();
  });

  // MT:MEH-530:45 — opens toward the start; second click / outside click / Escape close it; Escape restores focus.
  test("the menu opens toward the start and closes on a second click, an outside click, and Escape", async ({ page }) => {
    await stubAdmin(page);
    await openUsers(page);
    const row = userRow(page, "משתמשת 4");
    const btn = await openKebab(row);
    const m = menu(page);
    await expect(m).toBeVisible();
    // D2 — geometry: end edge pinned to the trigger's end edge (left in RTL), body extends to the right.
    const [mb, tb] = await Promise.all([m.boundingBox(), btn.boundingBox()]);
    expect(Math.abs(mb!.x - tb!.x), "the panel's left edge sits at the trigger's left edge").toBeLessThan(3);
    expect(mb!.x + mb!.width, "the panel extends toward the start (right)").toBeGreaterThan(tb!.x + tb!.width + 40);
    await btn.click();
    await expect(m).toHaveCount(0);
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await openKebab(row);
    await page.getByRole("heading", { name: "משתמשים" }).click();
    await expect(menu(page)).toHaveCount(0);
    await openKebab(row);
    // Focus is moved INTO the menu first (programmatically — Tab cannot reach it, MEH-2267), so
    // "Escape returns focus to ⋮" is a real return and not focus that never left the trigger.
    await menu(page).getByRole("menuitem").first().focus();
    await expect(btn).not.toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
    await expect(btn, "Escape returns focus to the trigger").toBeFocused();
  });

  // MT:MEH-530:46 — promote through the menu → the same confirm dialog → PUT role=admin.
  test("«העלי לאדמין» opens the confirm and «אישור» PUTs role=admin, then the badge reads «אדמין»", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes });
    await openUsers(page);
    const row = userRow(page, "משתמשת 4");
    await expect(row.getByText("צרכן")).toBeVisible();
    await openKebab(row);
    await menu(page).getByRole("menuitem", { name: "העלי לאדמין" }).click();
    await expect(page.getByText("את בטוחה שברצונך להעניק הרשאות אדמין למשתמשת 4?")).toBeVisible();
    await page.getByRole("button", { name: "אישור" }).click();
    await expect.poll(() => writes).toEqual([{ method: "PUT", url: `/admin/users/${uuid(104)}/role`, body: { role: "admin" } }]);
    await expect(page.getByText(/את בטוחה שברצונך/), "the dialog closes on success").toHaveCount(0);
    await expect(row.getByText("אדמין", { exact: true })).toBeVisible();
    await expect(row.getByText("צרכן")).toHaveCount(0);
  });

  // MT:MEH-530:47 — demote on a regular admin: a red item → confirm → PUT role=consumer.
  test("«הסירי הרשאות» is red, confirms, and PUTs role=consumer", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes });
    await openUsers(page);
    const row = userRow(page, "רונית אדמין");
    await openKebab(row);
    const demote = menu(page).getByRole("menuitem", { name: "הסירי הרשאות" });
    await expect(demote).toBeVisible();
    await expect(demote).toHaveClass(/text-red-600/);
    await expect(menu(page).getByRole("menuitem")).toHaveText(["הסירי הרשאות"]);
    await demote.click();
    await expect(page.getByText("את בטוחה שברצונך להסיר הרשאות אדמין מרונית אדמין?")).toBeVisible();
    await page.getByRole("button", { name: "אישור" }).click();
    await expect.poll(() => writes).toEqual([{ method: "PUT", url: `/admin/users/${uuid(102)}/role`, body: { role: "consumer" } }]);
    await expect(row.getByText("צרכן")).toBeVisible();
  });

  // MT:MEH-530:48 — the super-admin row: no ⋮, the «מוגן» badge and the lock tooltip stay.
  test("the super-admin row has no ⋮ and keeps the lock tooltip", async ({ page }) => {
    await stubAdmin(page);
    await openUsers(page);
    const row = userRow(page, "סמדר");
    await expect(row.getByText(SUPER_ADMIN_EMAIL)).toBeVisible();
    await expect(kebab(row)).toHaveCount(0);
    await expect(row.getByText("מוגן")).toBeVisible();
    await expect(row.getByTitle("לא ניתן להסיר הרשאות מהאדמין הראשי")).toBeVisible();
    // Control for the negative above: a plain consumer row on the same page DOES have one.
    await expect(kebab(userRow(page, "משתמשת 4"))).toHaveCount(1);
  });

  // MT:MEH-530:49 — the admin's own row: no demote (isMe). D1 — no ⋮ at all, as measured.
  test("the admin's own row offers no «הסירי הרשאות» — measured: no ⋮ renders at all", async ({ page }) => {
    await stubAdmin(page);
    await openUsers(page);
    const row = userRow(page, ADMIN.name);
    await expect(row.getByText(ADMIN.email)).toBeVisible();
    await expect(row.getByText("אדמין", { exact: true })).toBeVisible();
    await expect(row.getByText("מוגן"), "not the super-admin — no protected badge").toHaveCount(0);
    await expect(kebab(row)).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "הסירי הרשאות" })).toHaveCount(0);
  });

  // MT:MEH-530:50 — keyboard: Enter/Space on ⋮ open, aria-expanded flips, Escape closes and refocuses ⋮.
  // (The row's third clause — the items reachable by Tab — is the next test, under MEH-2267.)
  test("keyboard: Enter and Space open the menu, aria-expanded flips, Escape closes and refocuses ⋮", async ({ page }) => {
    await stubAdmin(page);
    await openUsers(page);
    const row = userRow(page, "משתמשת 4");
    const btn = kebab(row);
    await btn.scrollIntoViewIfNeeded();
    await btn.focus();
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(btn).toHaveAttribute("aria-expanded", "true");
    const m = menu(page);
    await expect(m).toBeVisible();
    await expect(btn).toHaveAttribute("aria-controls", (await m.getAttribute("id"))!);
    await m.getByRole("menuitem").first().focus(); // see the note in the row-45 test
    await expect(btn).not.toBeFocused();
    await page.keyboard.press("Escape");
    await expect(m).toHaveCount(0);
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await expect(btn, "Escape returns focus to the trigger").toBeFocused();
    await page.keyboard.press("Space");
    await expect(btn).toHaveAttribute("aria-expanded", "true");
    await expect(menu(page)).toBeVisible();
  });

  // MT:MEH-530:50 — "פריטי התפריט נגישים ב-Tab" — under the APG menu-button
  // reading D4 records: opening moves focus INTO the list, arrows walk it, and
  // Tab leaves. Before MEH-2267 the first assertion below landed on the NEXT
  // row's favorites button, so this test reds against the pre-fix component
  // without needing test.fail() to say so.
  test("keyboard: opening the ⋮ moves focus to the first item; arrows walk it; Tab leaves and returns focus", async ({ page }) => {
    await stubAdmin(page);
    await openUsers(page);
    const row = userRow(page, "משתמשת 4");
    const btn = kebab(row);
    await btn.scrollIntoViewIfNeeded();
    await btn.focus();
    await page.keyboard.press("Enter");
    await expect(btn).toHaveAttribute("aria-expanded", "true");
    const m = menu(page);
    const promote = m.getByRole("menuitem", { name: "העלי לאדמין" });
    const demote = m.getByRole("menuitem", { name: "הסירי הרשאות" });
    await expect(promote, "APG: the open puts focus on the first item").toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(demote).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(promote, "ArrowDown wraps to the first item").toBeFocused();
    await page.keyboard.press("Tab");
    await expect(m, "APG: Tab closes the menu").toHaveCount(0);
    await expect(btn, "APG: Tab returns focus to the trigger").toBeFocused();
    await expect(btn).toHaveAttribute("aria-expanded", "false");
  });
});

// ── MT:MEH-530:17-21 — /admin/reviews delete dialog (1040) ─────────────────

async function openReviews(page: Page): Promise<void> {
  await page.goto("/he/admin/reviews");
  await expect(page.getByRole("heading", { name: /^ביקורות/ }), "control: the reviews page never rendered").toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("row", { name: /דנה כהן/ })).toBeVisible();
}
const reviewDialog = (page: Page) => page.getByRole("dialog", { name: /^למחוק את הביקורת/ });

test.describe("/admin/reviews — the delete dialog", () => {
  test("control: every read the page makes is stubbed", async ({ page }) => {
    const stub = await stubAdmin(page);
    await openReviews(page);
    await expect(page.getByText("2 מתוך 2")).toBeVisible();
    expect(stub.unstubbed, "an /api/* read reached the 404 catch-all — a stub is missing").toEqual([]);
  });

  // MT:MEH-530:17 · MT:MEH-530:18 — a modal dialog, not a native confirm(); the copy names the user and the business.
  test("«מחקי» opens a modal dialog naming the user and the business — no native confirm()", async ({ page }) => {
    const fired = trapNativeDialogs(page);
    await stubAdmin(page);
    await openReviews(page);
    await page.getByRole("button", { name: "מחקי ביקורת של דנה כהן" }).click();
    const d = reviewDialog(page);
    await expect(d).toBeVisible();
    await expect(d).toHaveAttribute("aria-modal", "true");
    await expect(d).toHaveText(/^למחוק את הביקורת של דנה כהן על מאפיית שקד\?/);
    await expect(d.getByRole("button")).toHaveText(["מחקי", "ביטול"]);
    expect(fired, "no browser dialog fired").toEqual([]);
  });

  // MT:MEH-530:19 — cancel (button or Escape) closes, the row stays, no DELETE.
  test("«ביטול» and Escape close the dialog without a DELETE", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes });
    await openReviews(page);
    const del = page.getByRole("button", { name: "מחקי ביקורת של דנה כהן" });
    await del.click();
    await reviewDialog(page).getByRole("button", { name: "ביטול" }).click();
    await expect(reviewDialog(page)).toHaveCount(0);
    await del.click();
    await expect(reviewDialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(reviewDialog(page)).toHaveCount(0);
    await expect(page.getByRole("row", { name: /דנה כהן/ })).toBeVisible();
    await expectNoWrite(writes, "DELETE", "a cancelled dialog sends nothing");
  });

  // MT:MEH-530:20 — confirm: DELETE /reviews/{id}, both buttons disabled + «במחיקה...» in flight, row gone, success toast.
  test("«מחקי» in the dialog DELETEs, disables both buttons while it flies, removes the row and toasts", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes, delayMs: 1_500 });
    await openReviews(page);
    await page.getByRole("button", { name: "מחקי ביקורת של דנה כהן" }).click();
    const d = reviewDialog(page);
    await d.getByRole("button", { name: "מחקי" }).click();
    await expect(d.getByRole("button", { name: "במחיקה..." })).toBeDisabled();
    await expect(d.getByRole("button", { name: "ביטול" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(d, "Escape is gated while the DELETE flies").toBeVisible();
    await expect(d).toHaveCount(0, { timeout: 10_000 });
    expect(writes).toEqual([{ method: "DELETE", url: `/reviews/${uuid(201)}`, body: null }]);
    await expect(page.getByRole("row", { name: /דנה כהן/ })).toHaveCount(0);
    await expect(page.getByRole("status").getByText("הביקורת נמחקה")).toBeVisible();
    await expect(page.getByText("1 מתוך 1")).toBeVisible();
  });

  // MT:MEH-530:21 — a failed DELETE: error toast, dialog stays open.
  test("a failed DELETE toasts the generic error and leaves the dialog open", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes, deleteStatus: 500 });
    await openReviews(page);
    await page.getByRole("button", { name: "מחקי ביקורת של דנה כהן" }).click();
    const d = reviewDialog(page);
    await d.getByRole("button", { name: "מחקי" }).click();
    await expect(page.getByRole("status").getByText("משהו השתבש, נסו שוב")).toBeVisible();
    await expect.poll(() => writes.length).toBe(1);
    await expect(d, "the dialog stays open for a retry").toBeVisible();
    await expect(d.getByRole("button", { name: "מחקי" })).toBeEnabled();
    await expect(page.getByRole("row", { name: /דנה כהן/ })).toBeVisible();
  });
});

// ── MT:MEH-530:22-28 — /admin/content categories: delete dialog + producer_count ──

// React reflects a controlled input's value into the attribute, so the row is found by it.
const categoryInput = (page: Page, name: string) => page.locator(`input[value="${name}"]`);
/** The categories <ul> — the admin nav is a list too, so `listitem` must be scoped. */
const categoryList = (page: Page) => page.getByRole("list").filter({ has: page.locator("input[value]") });
const categoryRow = (page: Page, name: string) => categoryList(page).getByRole("listitem").filter({ has: categoryInput(page, name) });
async function openCategories(page: Page): Promise<void> {
  await page.goto("/he/admin/content");
  await expect(page.getByRole("heading", { name: "תוכן" }), "control: the content page never rendered").toBeVisible({ timeout: 15_000 });
  await expect(categoryInput(page, "לחמים ואפייה")).toBeVisible();
}
const categoryDialog = (page: Page) => page.getByRole("dialog", { name: /^מחיקת/ });

test.describe("/admin/content — categories", () => {
  test("control: every read the page makes is stubbed", async ({ page }) => {
    const stub = await stubAdmin(page);
    await openCategories(page);
    await expect(page.getByRole("button", { name: "קטגוריות" })).toHaveClass(/bg-primary/);
    await expect(categoryList(page).getByRole("listitem")).toHaveCount(3);
    expect(stub.unstubbed, "an /api/* read reached the 404 catch-all — a stub is missing").toEqual([]);
  });

  // MT:MEH-530:22 · MT:MEH-530:28 — a modal dialog (no native confirm) whose copy carries the producer count.
  test("«מחקו» opens a modal dialog carrying the producer count — no native confirm()", async ({ page }) => {
    const fired = trapNativeDialogs(page);
    await stubAdmin(page);
    await openCategories(page);
    await categoryRow(page, "לחמים ואפייה").getByRole("button", { name: "מחקו" }).click();
    const d = categoryDialog(page);
    await expect(d).toBeVisible();
    await expect(d).toHaveAttribute("aria-modal", "true");
    await expect(d).toContainText("— 3 בתי עסק משויכים");
    await expect(d.getByRole("button")).toHaveText(["מחקו", "ביטול"]);
    expect(fired, "no browser dialog fired").toEqual([]);
  });

  // MT:MEH-530:23 — the dialog names the category. D5 / MEH-2261: `content.categories.confirm_delete`
  // wraps its placeholder in single quotes ('{name}'), which ICU MessageFormat reads as a quoted
  // literal — the dialog renders «מחיקת {name} — 3 בתי עסק משויכים». Measured here, the same
  // defect chunk 11f found on the locations card. This asserts the CORRECT copy and is expected to
  // fail until the card lands; the fix turns it into an unexpected pass.
  test("the dialog names the category: «מחיקת 'לחמים ואפייה' — 3 בתי עסק משויכים»", async ({ page }) => {
    test.fail(true, "MEH-2261 — '{name}' in he.json is an ICU quoted literal; the dialog shows the placeholder");
    await stubAdmin(page);
    await openCategories(page);
    await categoryRow(page, "לחמים ואפייה").getByRole("button", { name: "מחקו" }).click();
    await expect(categoryDialog(page)).toHaveText(/^מחיקת 'לחמים ואפייה' — 3 בתי עסק משויכים/);
  });

  // MT:MEH-530:24 — cancel closes, the category stays, no DELETE.
  test("«ביטול» closes the dialog, the category stays, nothing is sent", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes });
    await openCategories(page);
    await categoryRow(page, "לחמים ואפייה").getByRole("button", { name: "מחקו" }).click();
    await categoryDialog(page).getByRole("button", { name: "ביטול" }).click();
    await expect(categoryDialog(page)).toHaveCount(0);
    await expect(categoryRow(page, "לחמים ואפייה")).toBeVisible();
    await expect(categoryList(page).getByRole("listitem")).toHaveCount(3);
    await expectNoWrite(writes, "DELETE", "a cancelled dialog sends nothing");
  });

  // MT:MEH-530:25 · MT:MEH-530:26 — confirm: DELETE /admin/categories/{id}, «מוחקים…» disabled in flight, list re-read without it.
  test("«מחקו» in the dialog DELETEs, reads «מוחקים…» while it flies, and the list re-reads without the category", async ({ page }) => {
    const writes: Rec[] = [];
    const listCalls: Record<string, string>[] = [];
    await stubAdmin(page, { writes, listCalls, delayMs: 1_500 });
    await openCategories(page);
    const before = listCalls.length;
    await categoryRow(page, "דבש ומרקחות").getByRole("button", { name: "מחקו" }).click();
    const d = categoryDialog(page);
    await d.getByRole("button", { name: "מחקו" }).click();
    await expect(d.getByRole("button", { name: "מוחקים…" })).toBeDisabled();
    await expect(d.getByRole("button", { name: "ביטול" })).toBeDisabled();
    await expect(d).toHaveCount(0, { timeout: 10_000 });
    expect(writes).toEqual([{ method: "DELETE", url: "/admin/categories/5", body: null }]);
    expect(listCalls.length, "the list was re-read after the delete").toBe(before + 1);
    await expect(categoryRow(page, "דבש ומרקחות")).toHaveCount(0);
    await expect(categoryList(page).getByRole("listitem")).toHaveCount(2);
  });

  // MT:MEH-530:27 — every row carries «N בתי עסק», 0 for an empty category.
  test("every category row shows its producer count, 0 included", async ({ page }) => {
    await stubAdmin(page);
    await openCategories(page);
    await expect(categoryRow(page, "לחמים ואפייה").getByText("3 בתי עסק")).toBeVisible();
    await expect(categoryRow(page, "פירות וירקות").getByText("0 בתי עסק")).toBeVisible();
    // «1 בתי עסק» is what the page renders today — the plural for a count of 1, not correct Hebrew.
    // Asserted as measured (the row's claim is "N בתי עסק on every row"); a copy fix that adds the
    // singular («1 בית עסק») moves this line, not the app. Recorded on card 2261, never fixed inline.
    await expect(categoryRow(page, "דבש ומרקחות").getByText("1 בתי עסק")).toBeVisible();
  });

  // The failure path is not a numbered row here (it is for reviews, :21) — the same
  // contract is asserted so the two dialogs cannot drift apart on it.
  test("a failed category DELETE toasts «מחיקת הקטגוריה נכשלה. נסו שוב.» and leaves the dialog open", async ({ page }) => {
    await stubAdmin(page, { deleteStatus: 500 });
    await openCategories(page);
    await categoryRow(page, "לחמים ואפייה").getByRole("button", { name: "מחקו" }).click();
    const d = categoryDialog(page);
    await d.getByRole("button", { name: "מחקו" }).click();
    await expect(page.getByRole("status").getByText("מחיקת הקטגוריה נכשלה. נסו שוב.")).toBeVisible();
    await expect(d).toBeVisible();
    await expect(categoryList(page).getByRole("listitem")).toHaveCount(3);
  });
});

