import { test, expect, type Page } from "../_cloudinary-stub";
import type { Route } from "@playwright/test";
// The seven Phase-1 items, imported so the stub serves the labels and hints the
// checklist ships with rather than a second copy. Plain-JS module, no .d.ts.
// @ts-expect-error TS7016 — untyped JS module
import { ADMIN_REVIEW_CHECKLIST } from "../../../lib/admin-review-checklist.js";

/**
 * Spec:     manual/admin-producers-decisions — MEH-1249 chunk 12b
 * Purpose:  Convert the CONVERT-verdict rows of the four MANUAL_TESTING
 *           sections about the DECISION the admin takes on a pending business:
 *             MT:MEH-226    reject with a reason (the decision modal)
 *             MT:MEH-1396   the pre-approval checklist, Phase 1 (soft gate)
 *             MT:MEH-1399   the same checklist as data + the evidence dossier
 *             MT:MEH-228    double-submit protection on the approve button
 * Touches:  NO backend. Every read AND every write the queue makes is
 *           route-stubbed — the approve / reject / request-changes POSTs are
 *           captured and answered, the review-checks PUT is held in a per-test
 *           map so a GET after a reload answers from it. The session token is
 *           seeded via addInitScript (the chunk-11/12a pattern). Runs on the
 *           DEFAULT CI E2E target with no DEMO_* fixture and no storageState.
 * Does NOT: send anything to a server. That is the point: the real
 *           storageState specs would make these writes against the RAILWAY
 *           STAGING backend (.github/workflows/e2e.yml:229-233), and an
 *           approve / reject there emails a real business owner — forbidden by
 *           Sapir's 13/07 ruling. What is asserted is the CLIENT's half of each
 *           decision: which body leaves the browser, when, and how many times.
 * Related:  app/[locale]/admin/producers/{ProducerDecisionModal.jsx,
 *           use-reject-flow.js,use-review-checklist.js,AdminReviewChecklist.jsx,
 *           ReviewEvidence.jsx,page.js} · lib/use-admin-action.js ·
 *           lib/admin-review-checklist.js · producer/dashboard/RejectedBanner.jsx ·
 *           manual/admin-producers-queue.spec.ts (chunk 12a — the reads).
 * History:  MEH-1249 chunk 12b.
 *
 * ─── The route interception, against the MEH-1968 three conditions ────────
 *
 *   1. No backend BEHAVIOUR is asserted. Whether the reason lands in the DB,
 *      whether the mail goes out, whether `checked_at` is preserved on a
 *      re-tick — all server-side, all left to tests/. Every test here asks
 *      what the CLIENT does: which radio is preselected on a 422, whether a
 *      second click fires a second POST, what the counter reads before the
 *      ticks are fetched.
 *   2. The contracts are pinned: RejectionPresetOut, AdminChecklistItemOut,
 *      ProducerReviewChecksOut (schemas.py) and the approve gate's 422 detail
 *      strings (routers/admin.py:239-251) are read verbatim by the client.
 *   3. The unmocked alternative is a WRITE against shared staging that emails a
 *      real person. There is no non-mocking way to assert a reject.
 *
 * The Cloudinary import is the suite-wide STUB (MEH-1925), not part of this.
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 *
 * D1 · MT:MEH-226:2 says the modal shows FIVE radios with the five server
 *      labels. Since card 2209 the composer is ONE modal with TWO groups
 *      («בקשת השלמה» / «דחייה»); the four real presets are split across them
 *      by key, and the server's fifth, «אחר (פירוט חופשי)», is filtered out
 *      and replaced by an «אחר» radio in EACH group (ProducerDecisionModal.jsx,
 *      partitionPresets). So: four server labels + two «אחר» = six radios.
 *      Asserted as measured. STALE on the count and the fifth label.
 * D2 · MT:MEH-1396:1 says the closed header reads «(0/7)». Since card 1399 the
 *      ticks are server state fetched on expand, and the closed header reads
 *      «(?/7)» until then — deliberately (AdminReviewChecklist.jsx: "a
 *      confident 0/0 on a business somebody already reviewed"). MT:MEH-1399:12
 *      is the row that documents the new behaviour; both are asserted, the
 *      1396 row as STALE.
 * D3 · MT:MEH-1396:3 says the ticks RESET on collapse (session-local). Card
 *      1399 inverted that on purpose — ticks persist, and MT:MEH-1399:17 says
 *      so. Asserted as persistence; the 1396 row is STALE.
 * D4 · MT:MEH-1396:1 also names «ממתינה לאימות WhatsApp». That status was
 *      removed in card 2124 (sla-statuses.js); only `pending` remains.
 *
 * ─── Rows this chunk does NOT convert ──────────────────────────────────────
 *
 * 226:5 (the DB row), :7 (the mail), :8 (a real save by the rejected owner —
 * the server's permission, not the client's), :9 (restoring status on the edit
 * page — a write to a real producer). 1399:1-9 are /admin/settings (chunk 12c),
 * :16 is `checked_at` preservation (server). 228:1-3 are three other admin
 * pages (chunk 12c).
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const ADMIN = { id: 1, email: "admin@example.com", name: "מנהלת", role: "admin" };

type Row = Record<string, unknown> & { id: number; name: string; status: string };

let seq = 200;
function row(over: Partial<Row> = {}): Row {
  const id = (over.id as number) ?? ++seq;
  return {
    id,
    name: `עסק ${id}`,
    city: "חיפה",
    status: "pending",
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
    website: null,
    slug: null,
    requested_changes: null,
    changes_requested_at: null,
    risk_score: null,
    risk_reasoning: null,
    verification_tier: null,
    license_pending: false,
    producer_license_number: null,
    license_expires_at: null,
    kashrut_badges: [],
    referral_source: null,
    ...over,
  };
}

/** The five server presets, exactly as routers/admin.py:1080-1084 spells them. */
const PRESETS = [
  { key: "missing_docs", label: "מסמכים חסרים / לא קריאים" },
  { key: "missing_image", label: "תמונה ראשית חסרה" },
  { key: "incomplete_info", label: "מידע עסקי לא מלא (כתובת / טלפון / תיאור)" },
  { key: "not_eligible", label: "עסק לא עומד בתנאי הפלטפורמה" },
  { key: "other", label: "אחר (פירוט חופשי)" },
];

type Item = { id: string; position: number; label: string; hint: string | null; active: boolean };
/** The seven Phase-1 items as AdminChecklistItemOut rows. */
const ITEMS: Item[] = (ADMIN_REVIEW_CHECKLIST as { id: string; label: string; hint?: string }[]).map((it, i) => ({
  id: `11111111-1111-4111-8111-00000000000${i + 1}`,
  position: i + 1,
  label: it.label,
  hint: it.hint ?? null,
  active: true,
}));

/** The two approve-gate 422 details, verbatim from routers/admin.py:240 and :251. */
const GATE = {
  photo: "לא ניתן לאשר בית עסק ללא תמונה. בקשי מבעלת העסק להעלות תמונה אחת לפחות.",
  license: "לא ניתן לאשר בית עסק בקטגוריה הדורשת רישיון יצרן ללא מספר רישיון. אמתי את הרישיון, או אשרי עם דריסה מפורשת.",
};

type Rec = { method: string; url: string; body: unknown };
type Answer = { status: number; body?: unknown; delayMs?: number; abort?: boolean };

type StubOpts = {
  rows?: Row[];
  items?: Item[];
  /** producerId → item ids already recorded server-side. */
  checks?: Record<number, string[]>;
  approve?: Answer;
  writes?: Rec[];
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** Records the write and returns its parsed body, so a handler reads it once. */
const rec = (r: Route, writes?: Rec[]): unknown => {
  const req = r.request();
  let body: unknown = null;
  try { body = req.postDataJSON(); } catch { body = req.postData(); }
  writes?.push({ method: req.method(), url: new URL(req.url()).pathname.replace(/^.*\/api/, ""), body });
  return body;
};

/**
 * Seeds an admin session, every read the queue makes (the 12a inventory) and
 * every write this chunk exercises. The review-checks store is per call, so a
 * reload inside one test reads back what that test wrote.
 */
async function stubAdmin(page: Page, opts: StubOpts = {}): Promise<void> {
  const { rows = [], items = ITEMS, approve = { status: 200, body: { ok: true } }, writes } = opts;
  const checks = new Map<string, Set<string>>(Object.entries(opts.checks ?? {}).map(([k, v]) => [k, new Set(v)]));
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) => json(r, ADMIN));
  await page.route("**/users/me/favorites", (r) => json(r, []));
  await page.route("**/admin/dashboard", (r) =>
    json(r, {
      stats: { total_producers: rows.length, pending_producers: pendingCount, total_users: 3, total_group_buys: 0, pending_moderation_count: pendingCount, pending_kashrut_requests: 0 },
      recent_activity: [],
      monthly_producers: [],
    }),
  );
  await page.route("**/admin/checklist-items", (r) => json(r, items));
  await page.route("**/admin/producers/rejection-presets", (r) => json(r, PRESETS));
  await page.route("**/admin/producers/*/review-checks", (r) => {
    const id = new URL(r.request().url()).pathname.match(/producers\/([^/]+)\/review-checks/)![1];
    if (r.request().method() === "PUT") {
      const ids = (rec(r, writes) as { item_ids?: string[] }).item_ids ?? [];
      checks.set(id, new Set(ids));
    }
    const set = checks.get(id) ?? new Set<string>();
    return json(r, {
      producer_id: id,
      checks: [...set].map((item_id) => ({ item_id, label_snapshot: items.find((i) => i.id === item_id)?.label ?? "", checked_by_name: "מנהלת", checked_at: "2026-09-04T09:00:00Z" })),
    });
  });
  await page.route("**/admin/producers/*/approve", async (r) => {
    rec(r, writes);
    if (approve.abort) return r.abort("failed");
    if (approve.delayMs) await new Promise((res) => setTimeout(res, approve.delayMs));
    return json(r, approve.body ?? { ok: true }, approve.status);
  });
  await page.route("**/admin/producers/*/reject", (r) => { rec(r, writes); return json(r, { ok: true }); });
  await page.route("**/admin/producers/*/request-changes", (r) => { rec(r, writes); return json(r, { ok: true }); });
  // Anchored on /api/ — the page document is /he/admin/producers (chunk 12a).
  await page.route((u) => /\/api\/admin\/producers\/?$/.test(u.pathname), (r) => {
    const status = new URL(r.request().url()).searchParams.get("status");
    return json(r, status ? rows.filter((x) => x.status === status) : rows);
  });
}

/** The rejected owner's dashboard — the one non-admin surface in this chunk (226:6). */
async function stubRejectedOwner(page: Page, reason: string, code: string): Promise<void> {
  const profile = {
    id: 7, name: "מאפיית שקד", city: "חיפה", status: "rejected", rejection_reason_code: code, resubmission_count: 0,
    phone: "050-1234567", categories: [{ id: 2, name: "לחמים ואפייה" }], images: [], locations: [], products: [],
    has_physical_location: true, offers_delivery: false, delivery_areas: [], short_description: "מאפייה שכונתית",
  };
  await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) => json(r, { id: 42, email: "owner@example.com", name: "שקד", role: "producer", producer_id: 7, producer_rejection_reason: reason, producer_rejection_reason_code: code, producer_resubmission_count: 0 }));
  await page.route("**/users/me/favorites", (r) => json(r, []));
  await page.route("**/producers/me/dashboard", (r) => json(r, { producer: { id: 7, name: "מאפיית שקד", slug: null, status: "rejected", availability_state: "accepting_orders", vacation_until: null }, stats: {} }));
  await page.route("**/producers/me/analytics**", (r) => json(r, { profile_views: { total: 0, last_7d: 0 }, whatsapp_clicks: { total: 0, last_7d: 0 }, contact_clicks: { total: 0, last_7d: 0 }, average_rating: null, total_reviews: 0, rank_in_city: null, conversion_rate: "0%", profile_strength: 10, top_cities: [], follower_count: 0, new_followers_this_week: 0 }));
  await page.route("**/producers/me", (r) => json(r, profile));
}

// ── locators + the control ─────────────────────────────────────────────────

const rowOf = (page: Page, name: string) => page.locator("tbody tr").filter({ has: page.getByText(name, { exact: true }) });
const kebab = (page: Page, name: string) => rowOf(page, name).getByRole("button", { name: "פעולות נוספות" });
const approveBtn = (page: Page, name: string) => rowOf(page, name).getByRole("button", { name: "✓ אשר" });
const modal = (page: Page) => page.getByTestId("decision-modal");
const checklistToggle = (page: Page) => page.getByRole("button", { name: /^רשימת בדיקה לפני אישור/ });
const itemBox = (page: Page, label: string) => page.getByRole("checkbox", { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });
const approveDialog = (page: Page) => page.getByRole("dialog", { name: /סעיפים לא מסומנים|רשימת הבדיקה לא נטענה/ });
const posts = (writes: Rec[], tail: string) => writes.filter((w) => w.method === "POST" && w.url.endsWith(tail));

async function openQueue(page: Page): Promise<void> {
  await page.goto("/admin/producers");
  await expect(
    page.getByRole("heading", { name: "בתי עסק", exact: true }),
    "control: the queue page never rendered — every assertion in this test is void",
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Opens a row's kebab. Scrolls first and lets a frame pass: AdminRowMenu closes
 * itself on any window `scroll` (its reflow guard), and on the phone project a
 * bare `click()` scrolls the row into view as part of the click — that scroll
 * event is delivered AFTER the menu opens and shuts it again. Measured on the
 * Pixel 5 profile: click → `aria-expanded="false"`, tap → `"true"`.
 */
async function openKebab(page: Page, name: string): Promise<void> {
  const btn = kebab(page, name);
  await btn.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
}

/** Opens the kebab and clicks «דחייה»; returns once the modal is up. */
async function openReject(page: Page, name: string): Promise<void> {
  await openKebab(page, name);
  await page.getByRole("menuitem", { name: "דחייה" }).click();
  await expect(modal(page)).toBeVisible();
}

/** The «items loaded» precondition — approve before it reads a different dialog. */
async function waitForItems(page: Page, total: number): Promise<void> {
  await expect(checklistToggle(page), "control: the checklist header never reported its item count").toContainText(`/${total})`);
}

/** Proves a POST did NOT leave the browser: waits for one and requires the wait to time out. */
async function expectNoPost(writes: Rec[], tail: string, why: string): Promise<void> {
  const fired = await expect.poll(() => posts(writes, tail).length, { timeout: 1_500 }).toBeGreaterThan(0).then(() => true).catch(() => false);
  expect(fired, why).toBe(false);
}

// ── MT:MEH-226 — reject with a reason ─────────────────────────────────────

test.describe("decision modal — reject", () => {
  // MT:MEH-226:1 — «דחייה» sits in the kebab of a pending row only, in the danger tone.
  test("the kebab offers «דחייה» on a pending row and not on an approved one", async ({ page }) => {
    await stubAdmin(page, { rows: [row({ name: "ממתין לבדיקה" }), row({ status: "approved", name: "כבר מאושר", slug: "kvar" })] });
    await openQueue(page);
    await openKebab(page, "ממתין לבדיקה");
    const reject = page.getByRole("menuitem", { name: "דחייה" });
    await expect(reject).toBeVisible();
    await expect(reject).toHaveClass(/text-red/);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await openKebab(page, "כבר מאושר");
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "דחייה" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "מחקו" }), "control: the approved row's menu did open").toBeVisible();
  });

  // MT:MEH-226:2 — the reasons come from the server. ⚠️ STALE on the layout (D1): four labels across two groups + «אחר» in each.
  test("the modal renders the four server reasons across its two groups, plus an «אחר» in each", async ({ page }) => {
    await stubAdmin(page, { rows: [row({ name: "ממתין לבדיקה" })] });
    await openQueue(page);
    await openReject(page, "ממתין לבדיקה");
    await expect(modal(page).getByRole("heading", { name: 'החלטה על הבקשה של "ממתין לבדיקה"' })).toBeVisible();
    for (const p of PRESETS.filter((x) => x.key !== "other")) await expect(modal(page).getByRole("radio", { name: p.label })).toBeVisible();
    await expect(modal(page).getByRole("radio", { name: "אחר", exact: true })).toHaveCount(2);
    await expect(modal(page).getByRole("radio")).toHaveCount(6);
    await expect(modal(page).getByText("אחר (פירוט חופשי)")).toHaveCount(0);
    await expect(modal(page).getByRole("group", { name: "דחייה" }).getByRole("radio", { name: "עסק לא עומד בתנאי הפלטפורמה" })).toBeVisible();
    await expect(modal(page).getByRole("group", { name: "בקשת השלמה" }).getByRole("radio")).toHaveCount(4);
  });

  // MT:MEH-226:3 — «אחר» needs free text before the submit lights up.
  test("«אחר» disables the submit until the free text is filled, and says the field is required", async ({ page }) => {
    await stubAdmin(page, { rows: [row({ name: "ממתין לבדיקה" })] });
    await openQueue(page);
    await openReject(page, "ממתין לבדיקה");
    const submit = modal(page).getByTestId("decision-submit");
    await expect(submit, "control: nothing chosen yet — the submit must already be disabled").toBeDisabled();
    await modal(page).getByRole("group", { name: "דחייה" }).getByRole("radio", { name: "אחר", exact: true }).check();
    await expect(submit).toBeDisabled();
    await expect(modal(page).getByText("פירוט לבעלת העסק (חובה)")).toBeVisible();
    await modal(page).getByRole("textbox").fill("העסק סגור מזה חודשיים");
    await expect(submit).toBeEnabled();
    await expect(submit).toHaveText("דחייה ושליחת מייל");
  });

  // MT:MEH-226:4 — no mail without the confirm step; «ביטול» returns to the form; confirming is what POSTs.
  test("the reject asks «להמשיך?» first, sends nothing until confirmed, and «ביטול» returns to the form", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { rows: [row({ id: 301, name: "ממתין לבדיקה" })], writes });
    await openQueue(page);
    await openReject(page, "ממתין לבדיקה");
    await modal(page).getByRole("radio", { name: "עסק לא עומד בתנאי הפלטפורמה" }).check();
    await modal(page).getByTestId("decision-submit").click();
    await expect(modal(page).getByTestId("decision-confirm-message")).toHaveText("פעולה זו תשלח מייל לבית העסק. להמשיך?");
    await expectNoPost(writes, "/reject", "the confirm step must not have sent anything yet");
    await modal(page).getByRole("button", { name: "ביטול" }).click();
    await expect(modal(page).getByRole("radio", { name: "עסק לא עומד בתנאי הפלטפורמה" }), "cancel must return to the form with the choice intact").toBeChecked();
    await expect(modal(page).getByTestId("decision-confirm-message")).toHaveCount(0);
    await modal(page).getByTestId("decision-submit").click();
    await modal(page).getByTestId("decision-confirm-submit").click();
    await expect.poll(() => posts(writes, "/reject").length, { message: "the confirmed reject never left the browser" }).toBe(1);
    expect(posts(writes, "/reject")[0]).toMatchObject({ url: "/admin/producers/301/reject", body: { preset_key: "not_eligible", reason: "" } });
    await expect(page.getByText("הבקשה נדחתה והמייל נשלח.")).toBeVisible();
    await expect(modal(page)).toHaveCount(0);
  });

  // MT:MEH-226:6 — the rejected owner's dashboard shows the full reason, not just «נדחה».
  test("the rejected owner sees the full reason on her dashboard banner", async ({ page }) => {
    const reason = "מסמכים חסרים / לא קריאים — התעודה שצורפה מטושטשת ולא ניתן לקרוא את המספר";
    await stubRejectedOwner(page, reason, "missing_docs");
    await page.goto("/producer/dashboard");
    const banner = page.getByTestId("status-rejected-banner");
    await expect(banner, "control: the rejected banner never rendered").toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText("הבקשה לא אושרה — אפשר לתקן ולשלוח שוב");
    await expect(page.getByTestId("status-rejected-reason")).toHaveText(reason);
    await expect(banner).toHaveAttribute("data-reason-code", "missing_docs");
    await expect(page.getByTestId("status-rejected-resubmit")).toBeVisible();
  });
});

// ── MT:MEH-1396 + MT:MEH-1399 — the pre-approval checklist ────────────────

test.describe("review checklist", () => {
  // MT:MEH-1396:1 (⚠️ STALE on «(0/7)» and on the WhatsApp status — D2, D4) · MT:MEH-1399:10 · MT:MEH-1399:11 · MT:MEH-1399:12
  test("a pending row carries the collapsed checklist reading «(?/7)»; an approved row carries none", async ({ page }) => {
    await stubAdmin(page, { rows: [row({ name: "ממתין לבדיקה" }), row({ status: "approved", name: "כבר מאושר" })] });
    await openQueue(page);
    await expect(rowOf(page, "כבר מאושר"), "control: the approved row never rendered").toHaveCount(1);
    await expect(checklistToggle(page)).toHaveCount(1);
    await expect(checklistToggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(checklistToggle(page)).toContainText("(?/7)");
    await expect(page.getByRole("checkbox")).toHaveCount(0);
  });

  // MT:MEH-1396:2 — open → seven items with their hints; open again → closed.
  test("expanding shows the seven items with their hints, and the counter becomes a real number", async ({ page }) => {
    await stubAdmin(page, { rows: [row({ name: "ממתין לבדיקה" })] });
    await openQueue(page);
    await checklistToggle(page).click();
    await expect(checklistToggle(page)).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("checkbox")).toHaveCount(7);
    for (const it of ITEMS) await expect(itemBox(page, it.label)).toBeVisible();
    await expect(page.getByText("חשד לתמונת סטוק — בדקי חיפוש הפוך")).toBeVisible();
    await expect(checklistToggle(page)).toContainText("(0/7)");
    await checklistToggle(page).click();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(checklistToggle(page)).toHaveAttribute("aria-expanded", "false");
  });

  // MT:MEH-1399:13 — ticks recorded earlier come back pre-checked on expand.
  test("items already recorded on the server arrive pre-checked, and the counter says so", async ({ page }) => {
    await stubAdmin(page, { rows: [row({ id: 302, name: "ממתין לבדיקה" })], checks: { 302: [ITEMS[0].id, ITEMS[3].id] } });
    await openQueue(page);
    await expect(checklistToggle(page)).toContainText("(?/7)");
    await checklistToggle(page).click();
    await expect(itemBox(page, ITEMS[0].label)).toBeChecked();
    await expect(itemBox(page, ITEMS[3].label)).toBeChecked();
    await expect(itemBox(page, ITEMS[1].label)).not.toBeChecked();
    await expect(checklistToggle(page)).toContainText("(2/7)");
  });

  // MT:MEH-1396:3 (⚠️ STALE — ticks persist, D3) · MT:MEH-1399:17 · MT:MEH-1399:14 · MT:MEH-1399:15
  test("a tick is PUT, survives collapse and a full reload, and an untick removes it", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { rows: [row({ id: 303, name: "ממתין לבדיקה" })], writes });
    await openQueue(page);
    await checklistToggle(page).click();
    const photos = itemBox(page, ITEMS[1].label);
    await photos.check();
    await expect.poll(() => writes.filter((w) => w.method === "PUT").length, { message: "the tick never reached the server" }).toBe(1);
    expect(writes[0]).toMatchObject({ url: "/admin/producers/303/review-checks", body: { item_ids: [ITEMS[1].id] } });
    await expect(rowOf(page, "ממתין לבדיקה").locator("..").getByText(ITEMS[1].label, { exact: true })).toHaveClass(/line-through/);
    await expect(checklistToggle(page)).toContainText("(1/7)");
    // Collapse and reopen — nothing resets (1396:3 inverted by 1399).
    await checklistToggle(page).click();
    await checklistToggle(page).click();
    await expect(photos).toBeChecked();
    // Full reload — the GET answers from what was PUT.
    await page.reload();
    await openQueue(page);
    await checklistToggle(page).click();
    await expect(photos).toBeChecked();
    await expect(checklistToggle(page)).toContainText("(1/7)");
    // Untick → the PUT carries an empty set, and a reload shows it unchecked.
    await photos.uncheck();
    await expect.poll(() => writes.filter((w) => w.method === "PUT").length).toBe(2);
    expect(writes[1].body).toEqual({ item_ids: [] });
    await page.reload();
    await openQueue(page);
    await checklistToggle(page).click();
    await expect(photos).not.toBeChecked();
    await expect(checklistToggle(page)).toContainText("(0/7)");
  });

  // MT:MEH-1396:4 · MT:MEH-1399:18 — the soft gate: a dialog with the count; «חזרה לבדיקה» and Esc keep the POST in; «אשרי בכל זאת» sends it.
  test("approving with unchecked items asks first, with the count; back and Esc send nothing; «אשרי בכל זאת» approves", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { rows: [row({ id: 304, name: "ממתין לבדיקה" })], checks: { 304: [ITEMS[0].id, ITEMS[1].id] }, writes });
    await openQueue(page);
    await waitForItems(page, 7);
    // Expand so the recorded ticks are known: 2 of 7 → 5 remaining.
    await checklistToggle(page).click();
    await expect(checklistToggle(page)).toContainText("(2/7)");
    await approveBtn(page, "ממתין לבדיקה").click();
    const dialog = approveDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("נשארו 5 סעיפים לא מסומנים ברשימת הבדיקה. לאשר בכל זאת?");
    await dialog.getByRole("button", { name: "חזרה לבדיקה" }).click();
    await expect(dialog).toHaveCount(0);
    await expectNoPost(writes, "/approve", "«חזרה לבדיקה» must not approve");
    await approveBtn(page, "ממתין לבדיקה").click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expectNoPost(writes, "/approve", "Escape must not approve");
    await approveBtn(page, "ממתין לבדיקה").click();
    await dialog.getByRole("button", { name: "אשרי בכל זאת" }).click();
    await expect.poll(() => posts(writes, "/approve").length, { message: "«אשרי בכל זאת» never approved" }).toBe(1);
    expect(posts(writes, "/approve")[0].url).toBe("/admin/producers/304/approve");
    await expect(page.getByText("העסק אושר")).toBeVisible();
  });

  // MT:MEH-1399:18 — zero ticks is not a block: the dialog names all seven and the approve still goes through.
  test("with zero ticks the dialog counts all seven and approval still goes through", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { rows: [row({ id: 305, name: "ממתין לבדיקה" })], writes });
    await openQueue(page);
    await waitForItems(page, 7);
    await approveBtn(page, "ממתין לבדיקה").click();
    await expect(approveDialog(page)).toContainText("נשארו 7 סעיפים לא מסומנים");
    await approveDialog(page).getByRole("button", { name: "אשרי בכל זאת" }).click();
    await expect.poll(() => posts(writes, "/approve").length).toBe(1);
    await expect(page.getByText("העסק אושר")).toBeVisible();
  });

  // MT:MEH-1396:5 — all seven ticked → no dialog, the approve fires directly.
  test("with every item ticked the approve fires with no dialog", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { rows: [row({ id: 306, name: "ממתין לבדיקה" })], checks: { 306: ITEMS.map((i) => i.id) }, writes });
    await openQueue(page);
    await waitForItems(page, 7);
    await checklistToggle(page).click();
    await expect(checklistToggle(page)).toContainText("(7/7)");
    await approveBtn(page, "ממתין לבדיקה").click();
    await expect.poll(() => posts(writes, "/approve").length, { message: "the approve never fired" }).toBe(1);
    await expect(approveDialog(page)).toHaveCount(0);
    await expect(page.getByText("העסק אושר")).toBeVisible();
  });

  // MT:MEH-1396:6 — the hard 422 gates are untouched: the decision modal opens with the matching chip preselected.
  for (const c of [
    { gate: "photo" as const, radio: "תמונה ראשית חסרה", text: "חסרה תמונה — יש להעלות לפחות תמונה אחת" },
    { gate: "license" as const, radio: "מסמכים חסרים / לא קריאים", text: "חסר מספר רישיון יצרן" },
  ]) {
    test(`a 422 from the ${c.gate} gate opens the decision modal with «${c.radio}» preselected and the chip text prefilled`, async ({ page }) => {
      const writes: Rec[] = [];
      await stubAdmin(page, { rows: [row({ id: 307, name: "ממתין לבדיקה" })], checks: { 307: ITEMS.map((i) => i.id) }, approve: { status: 422, body: { detail: GATE[c.gate] } }, writes });
      await openQueue(page);
      await waitForItems(page, 7);
      await checklistToggle(page).click();
      await expect(checklistToggle(page)).toContainText("(7/7)");
      await approveBtn(page, "ממתין לבדיקה").click();
      await expect.poll(() => posts(writes, "/approve").length).toBe(1);
      await expect(modal(page)).toBeVisible();
      await expect(modal(page).getByRole("radio", { name: c.radio })).toBeChecked();
      await expect(modal(page).getByRole("textbox")).toHaveValue(c.text);
      await expect(modal(page).getByTestId("decision-submit")).toHaveText("שליחת בקשת השלמה");
      await expect(page.getByText("לא ניתן לאשר עדיין — פתחנו עבורכם בקשת השלמה עם הפרט החסר. אפשר לערוך ולשלוח.")).toBeVisible();
      // And the composer routes it to request-changes, prefixing the fetched label.
      await modal(page).getByTestId("decision-submit").click();
      await expect.poll(() => posts(writes, "/request-changes").length, { message: "the completion request never left the browser" }).toBe(1);
      expect(posts(writes, "/request-changes")[0].body).toEqual({ feedback: `${c.radio}: ${c.text}` });
    });
  }

  // MT:MEH-1399:19 — no active items: a sentence, not an empty list; and the approve needs no dialog.
  test("with no active items the open list says so, and the approve needs no dialog", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { rows: [row({ id: 308, name: "ממתין לבדיקה" })], items: [], writes });
    await openQueue(page);
    await waitForItems(page, 0);
    await checklistToggle(page).click();
    await expect(page.getByText("אין סעיפים פעילים. אפשר להוסיף בהגדרות.")).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await approveBtn(page, "ממתין לבדיקה").click();
    await expect.poll(() => posts(writes, "/approve").length).toBe(1);
    await expect(approveDialog(page)).toHaveCount(0);
  });
});

// ── MT:MEH-1399:20-25 — the evidence dossier ──────────────────────────────

test.describe("review checklist — evidence dossier", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  const dossier = (page: Page) => page.locator("div").filter({ has: page.getByText("תיק בדיקה", { exact: true }) }).last();

  // MT:MEH-1399:20 · MT:MEH-1399:22 — the licence section: registry link, copy button, number, expiry; every external link opens a new tab.
  test("the dossier lists the registry link, the copy button, the licence number and its expiry, and every external link opens a new tab", async ({ page }) => {
    await stubAdmin(page, { rows: [row({ name: "ממתין לבדיקה", producer_license_number: "12-345678", license_expires_at: "2027-01-31", website: "https://shaked.example", instagram: "shaked_bakery", images: ["https://res.cloudinary.com/demo/image/upload/e1.jpg"] })] });
    await openQueue(page);
    await checklistToggle(page).click();
    const d = dossier(page);
    await expect(d.getByRole("link", { name: "מאגר משרד הבריאות" })).toBeVisible();
    await expect(d.getByRole("button", { name: "העתקת שם העסק" })).toBeVisible();
    await expect(d.getByText("מספר: 12-345678")).toBeVisible();
    await expect(d.getByText("תוקף: 2027-01-31")).toBeVisible();
    await expect(d.getByRole("link", { name: "אתר" })).toHaveAttribute("href", "https://shaked.example");
    await expect(d.getByRole("link", { name: "אינסטגרם" })).toBeVisible();
    const links = d.getByRole("link");
    const n = await links.count();
    expect(n, "control: the dossier rendered no links at all").toBeGreaterThanOrEqual(4);
    for (let i = 0; i < n; i++) {
      await expect(links.nth(i)).toHaveAttribute("target", "_blank");
      await expect(links.nth(i)).toHaveAttribute("rel", /noopener/);
    }
    expect(new URL(page.url()).pathname.endsWith("/admin/producers")).toBe(true);
  });

  // MT:MEH-1399:21 — «העתקת שם העסק» copies the exact name and reads «הועתק ✓» for two seconds.
  test("copying the name puts the exact name on the clipboard and flashes «הועתק ✓»", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are a Chromium grant");
    await stubAdmin(page, { rows: [row({ name: "מאפיית שקד ובניו" })] });
    await openQueue(page);
    await checklistToggle(page).click();
    const copy = dossier(page).getByRole("button", { name: "העתקת שם העסק" });
    await copy.click();
    await expect(dossier(page).getByRole("button", { name: "הועתק ✓" })).toBeVisible();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toBe("מאפיית שקד ובניו");
    await expect(dossier(page).getByRole("button", { name: "העתקת שם העסק" })).toBeVisible({ timeout: 4_000 });
  });

  // MT:MEH-1399:23 · MT:MEH-1399:24 — the two empty states are sentences, not blank rows.
  test("no website or Instagram, and no images, each read as a sentence", async ({ page }) => {
    await stubAdmin(page, { rows: [row({ name: "ממתין לבדיקה", website: null, instagram: null, images: [] })] });
    await openQueue(page);
    await checklistToggle(page).click();
    const d = dossier(page);
    await expect(d.getByText("אין אתר או אינסטגרם")).toBeVisible();
    await expect(d.getByText("אין תמונות")).toBeVisible();
    await expect(d.getByRole("link", { name: "אתר" })).toHaveCount(0);
    await expect(d.getByRole("link", { name: "אינסטגרם" })).toHaveCount(0);
    await expect(d.getByRole("link", { name: "חיפוש בגוגל" }), "control: the Google link is unconditional and must still be there").toBeVisible();
  });

  // MT:MEH-1399:25 — narrow viewport: number and expiry readable without a horizontal scroll.
  test("on the phone project «מספר:» and «תוקף:» sit inside the viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "a narrow-viewport claim");
    await stubAdmin(page, { rows: [row({ name: "ממתין לבדיקה", producer_license_number: "12-345678", license_expires_at: "2027-01-31" })] });
    await openQueue(page);
    await checklistToggle(page).click();
    const vw = page.viewportSize()!.width;
    for (const text of ["מספר: 12-345678", "תוקף: 2027-01-31"]) {
      const el = dossier(page).getByText(text);
      await expect(el).toBeVisible();
      const box = (await el.boundingBox())!;
      expect(box.x, `${text} starts off-screen`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${text} runs off-screen`).toBeLessThanOrEqual(vw);
    }
  });
});

// ── MT:MEH-228:4-5 — double-submit protection on approve ──────────────────

test.describe("approve — double-submit protection", () => {
  // MT:MEH-228:4 — a rapid double click sends ONE approve; the button is disabled while it is in flight.
  test("a double click on «✓ אשר» fires one POST and disables the button while it flies", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { rows: [row({ id: 309, name: "ממתין לבדיקה" })], items: [], approve: { status: 200, delayMs: 1_200 }, writes });
    await openQueue(page);
    await waitForItems(page, 0);
    const btn = approveBtn(page, "ממתין לבדיקה");
    await btn.dblclick();
    await expect(btn).toBeDisabled();
    await expect.poll(() => posts(writes, "/approve").length).toBe(1);
    // The second click had 1.2 s of in-flight window to sneak a second POST in.
    const second = await expect.poll(() => posts(writes, "/approve").length, { timeout: 1_500 }).toBeGreaterThan(1).then(() => true).catch(() => false);
    expect(second, "the second click must not fire a second approve").toBe(false);
    await expect(page.getByText("העסק אושר")).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  // MT:MEH-228:5 — a network failure surfaces as a Hebrew toast, never silently.
  test("a network failure on approve shows the Hebrew connection toast", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { rows: [row({ id: 310, name: "ממתין לבדיקה" })], items: [], approve: { status: 0, abort: true }, writes });
    await openQueue(page);
    await waitForItems(page, 0);
    await approveBtn(page, "ממתין לבדיקה").click();
    await expect.poll(() => posts(writes, "/approve").length).toBe(1);
    await expect(page.getByText("לא הצלחתי להתחבר לשרת. נסו שוב בעוד רגע.")).toBeVisible();
    await expect(approveBtn(page, "ממתין לבדיקה"), "the button must come back after the failure").toBeEnabled();
  });
});
