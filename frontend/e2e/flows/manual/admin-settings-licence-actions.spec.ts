import { test, expect, type Page } from "../_cloudinary-stub";
import type { Route } from "@playwright/test";
// @ts-expect-error TS7016 — untyped JS module (the seven Phase-1 items, served by the stub)
import { ADMIN_REVIEW_CHECKLIST } from "../../../lib/admin-review-checklist.js";

/**
 * Spec:     manual/admin-settings-licence-actions — MEH-1249 chunk 12c
 * Purpose:  Convert the CONVERT-verdict rows of three admin sections that live
 *           OFF the approvals queue:
 *             MT:MEH-1399:1-9   the checklist EDITOR on /admin/settings
 *             MT:MEH-2072:1-6   the licence expiry field on the admin edit form
 *             MT:MEH-228:1-2    double-submit protection on /admin/reports and /admin/users
 * Touches:  NO backend. Every read and write is route-stubbed. The checklist
 *           items live in a per-test STORE that both `/admin/checklist-items`
 *           shapes answer from — the editor's `?include_inactive=true` read and
 *           the review flow's active-only read — so "add here, appears there"
 *           and "deactivate here, vanishes there" are asserted across two pages
 *           without a server. The producer's licence expiry is held the same
 *           way, so a save followed by a fresh load reads back what was sent.
 * Does NOT: send anything to a server. The real storageState specs would make
 *           these writes against the RAILWAY STAGING backend
 *           (.github/workflows/e2e.yml:229-233) — rewriting the live checklist,
 *           suspending a real business, blocking a real user — forbidden by
 *           Sapir's 13/07 ruling.
 * Related:  app/[locale]/admin/settings/ChecklistSettings.jsx ·
 *           components/admin/ProducerForm.jsx (ProducerLicenseField) ·
 *           app/[locale]/admin/producers/[id]/edit/page.js · admin/reports/page.js ·
 *           admin/users/page.js · lib/use-admin-action.js ·
 *           manual/admin-producers-decisions.spec.ts (12b — the same registry on approve).
 * History:  MEH-1249 chunk 12c.
 *
 * ─── The route interception, against the MEH-1968 three conditions ────────
 *
 *   1. No backend BEHAVIOUR is asserted. Whether the PUT persists, whether the
 *      FK RESTRICT holds, whether the reminders query filters right — server
 *      rows, listed as not converted. Every test asks what the CLIENT sends and
 *      renders: the PUT body's order, the `null` on a cleared date, one POST
 *      per double-click, the dimmed row after a deactivate.
 *   2. The contracts are pinned: AdminChecklistItemOut / the checklist PUT body
 *      (routers/admin_checklist.py), ProducerAdminOut + the admin PUT payload
 *      (ProducerForm.jsx:445-480), /admin/reports (routers/reports.py:81).
 *   3. The unmocked alternative rewrites the shared checklist every admin sees,
 *      suspends a real business and blocks a real user — writes against shared
 *      staging, and the first one is not even self-cancelling.
 *
 * The Cloudinary import is the suite-wide STUB (MEH-1925), not part of this.
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 *
 * D1 · MT:MEH-1399:6 quotes «לכל סעיף חייב להיות טקסט.». The editor's message
 *      is «תווית קצרה מדי — לפחות 3 אותיות» (ChecklistSettings.jsx,
 *      LABEL_TOO_SHORT), and the rule is ≥ 3 letters, not non-empty. Asserted
 *      as measured; STALE on the copy and on the threshold.
 * D2 · MT:MEH-228:1 names four buttons on /admin/reports — «השעה» / «אשר» /
 *      «הסר» / «שחזר». Card 1406 removed the AI-flagged and auto-hidden
 *      home-product tabs with the home-products feature (reports/page.js:33-35);
 *      only the producer-reports queue remains, with «השהה עסק» and «התעלם».
 *      Those two are asserted; the row is STALE on the other three.
 * D3 · MT:MEH-228:3 is about hidden home products on /admin/content. That
 *      surface no longer exists anywhere (same card 1406). Not converted.
 * D4 · MT:MEH-2072:1 says the field sits "next to" the licence number. It sits
 *      BELOW it, in the same block (ProducerForm.jsx: `mt-3`). Position is not
 *      asserted; presence and the hint sentence are.
 *
 * ─── Rows this chunk does NOT convert ──────────────────────────────────────
 *
 * 2072:7-12 — `GET /admin/license-expiry-reminders` has no frontend consumer
 * (grep across app/, components/, lib/: none); those six rows are backend rows.
 * 228:3 — see D3. 228:4-5 are chunk 12b.
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const ADMIN = { id: 1, email: "admin@example.com", name: "מנהלת", role: "admin" };
const PRODUCER_ID = 77;

type Item = { id: string | null; position: number; label: string; hint: string | null; active: boolean };
const seed = (): Item[] =>
  (ADMIN_REVIEW_CHECKLIST as { id: string; label: string; hint?: string }[]).map((it, i) => ({
    id: `11111111-1111-4111-8111-00000000000${i + 1}`,
    position: i + 1,
    label: it.label,
    hint: it.hint ?? null,
    active: true,
  }));

/** A ProducerAdminOut-shaped profile the admin form can hydrate. */
function producer(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PRODUCER_ID,
    name: "מאפיית שקד",
    city: "חיפה",
    status: "approved",
    slug: "maafiat-shaked",
    phone: "050-1234567",
    categories: [{ id: 1, name: "לחמים ואפייה" }],
    images: ["https://res.cloudinary.com/demo/image/upload/p1.jpg"],
    has_physical_location: true,
    offers_delivery: false,
    delivery_nationwide: false,
    delivery_areas: [],
    delivery_excluded_cities: [],
    locations: [],
    producer_license_number: null,
    license_expires_at: null,
    address: null,
    referral_source: null,
    short_description: "מאפייה שכונתית",
    description: "לחם מחמצת, כל יום.",
    admin_notes: "",
    availability_state: "accepting_orders",
    vacation_until: null,
    business_days_waiting: 0,
    ...over,
  };
}

// «לחמים ואפייה» is licence-REQUIRED (lib/license-required-categories.js:18), so
// the licence block is always open for it; the no-licence cases below use
// «פירות וירקות», which is not on that list.
const CATEGORIES = [
  { id: 1, name: "לחמים ואפייה", slug: "bakery" },
  { id: 2, name: "גבינות ומחלבה", slug: "dairy" },
  { id: 3, name: "פירות וירקות", slug: "produce" },
];
const NO_LICENCE_CATEGORY = [{ id: 3, name: "פירות וירקות" }];

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
  items?: Item[];
  profile?: Record<string, unknown>;
  reports?: unknown[];
  users?: unknown[];
  /** Delay before every mutating POST answers — the in-flight window a double click lands in. */
  postDelayMs?: number;
  writes?: Rec[];
};

/**
 * Seeds an admin session and every read the four pages make. The checklist
 * store and the producer profile are closures, so writes in a test are read
 * back by the same test after a reload.
 */
async function stubAdmin(page: Page, opts: StubOpts = {}): Promise<{ items: () => Item[] }> {
  let items: Item[] = opts.items ?? seed();
  let profile = opts.profile ?? producer();
  const { reports = [], users = [], postDelayMs = 0, writes } = opts;
  let nextId = 900;

  await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) => json(r, ADMIN));
  await page.route("**/users/me/favorites", (r) => json(r, []));
  await page.route("**/admin/dashboard", (r) =>
    json(r, { stats: { total_producers: 1, pending_producers: 1, total_users: users.length, total_group_buys: 0, pending_moderation_count: 1, pending_kashrut_requests: 0 }, recent_activity: [], monthly_producers: [] }),
  );
  // /admin/settings and its vacation state — the other blocks on the page.
  await page.route((u) => /\/api\/admin\/settings\/?$/.test(u.pathname), (r) =>
    r.request().method() === "GET"
      ? json(r, { holiday_override_enabled: "false", holiday_override_key: "", friday_mode_override: "false", vacation_mode_active: "false", vacation_return_date: "" })
      : (rec(r, writes), json(r, { ok: true })),
  );
  await page.route("**/admin/settings/vacation", (r) => json(r, { active: false, return_date: null }));
  // The checklist store — two reads, one write.
  await page.route((u) => /\/api\/admin\/checklist-items\/?$/.test(u.pathname), (r) => {
    const req = r.request();
    if (req.method() === "PUT") {
      rec(r, writes);
      const body = req.postDataJSON() as { items: { id: string | null; label: string; hint: string | null; active: boolean }[] };
      items = body.items.map((it, i) => ({ id: it.id ?? `22222222-2222-4222-8222-${String(++nextId).padStart(12, "0")}`, position: i + 1, label: it.label, hint: it.hint, active: it.active }));
      return json(r, items);
    }
    const all = new URL(req.url()).searchParams.get("include_inactive") === "true";
    return json(r, all ? items : items.filter((i) => i.active));
  });
  // The review flow's other reads (12a/12b inventory).
  await page.route("**/admin/producers/rejection-presets", (r) => json(r, [{ key: "other", label: "אחר (פירוט חופשי)" }]));
  await page.route("**/admin/producers/*/review-checks", (r) => json(r, { producer_id: String(PRODUCER_ID), checks: [] }));
  await page.route((u) => /\/api\/admin\/producers\/?$/.test(u.pathname), (r) =>
    json(r, [{ ...profile, id: 501, name: "ממתין לבדיקה", status: "pending", business_days_waiting: 1, submitted_for_review_at: "2026-09-01T08:00:00Z", created_at: "2026-08-30T08:00:00Z", images: [] }]),
  );
  // The single-producer admin read + write behind the edit form.
  await page.route((u) => new RegExp(`/api/admin/producers/${PRODUCER_ID}/?$`).test(u.pathname), (r) => {
    if (r.request().method() === "PUT") {
      rec(r, writes);
      const body = r.request().postDataJSON() as Record<string, unknown>;
      profile = { ...profile, producer_license_number: body.producer_license_number ?? null, license_expires_at: body.license_expires_at ?? null };
      return json(r, profile);
    }
    return json(r, profile);
  });
  await page.route("**/categories", (r) => json(r, CATEGORIES));
  await page.route("**/categories?**", (r) => json(r, CATEGORIES));
  // /admin/reports + its two actions; /admin/users + block.
  await page.route((u) => /\/api\/admin\/reports\/?$/.test(u.pathname), (r) => json(r, reports));
  await page.route("**/admin/reports/*/dismiss", async (r) => { rec(r, writes); await sleep(postDelayMs); return json(r, { detail: "Report closed", status: "dismissed" }); });
  await page.route("**/admin/producers/*/toggle-status", async (r) => { rec(r, writes); await sleep(postDelayMs); return json(r, { ok: true }); });
  await page.route((u) => /\/api\/admin\/users\/?$/.test(u.pathname), (r) => json(r, users));
  await page.route("**/admin/users/*/block", async (r) => { rec(r, writes); await sleep(postDelayMs); return json(r, { ok: true }); });

  return { items: () => items };
}

// ── locators + controls ────────────────────────────────────────────────────

const block = (page: Page) => page.locator("div").filter({ has: page.getByRole("heading", { name: "רשימת בדיקה לפני אישור", exact: true }) }).last();
const labelInputs = (page: Page) => block(page).getByLabel("סעיף", { exact: true });
const hintInputs = (page: Page) => block(page).getByLabel("הסבר (אופציונלי)", { exact: true });
const saveBtn = (page: Page) => block(page).getByRole("button", { name: /^(שמירת הרשימה|שומרת…)$/ });
const savedMark = (page: Page) => block(page).getByText("נשמר ✓", { exact: true });
const addBtn = (page: Page) => block(page).getByRole("button", { name: "הוספת סעיף" });
const puts = (writes: Rec[], tail: string) => writes.filter((w) => w.method === "PUT" && w.url.endsWith(tail));
const posts = (writes: Rec[], tail: string) => writes.filter((w) => w.method === "POST" && w.url.endsWith(tail));

async function openSettings(page: Page): Promise<void> {
  await page.goto("/admin/settings");
  await expect(block(page).getByRole("heading", { name: "רשימת בדיקה לפני אישור", exact: true }), "control: the checklist block never rendered").toBeVisible({ timeout: 15_000 });
  await expect(labelInputs(page).first(), "control: the items never loaded").toBeVisible();
}

async function openEdit(page: Page): Promise<void> {
  await page.goto(`/admin/producers/${PRODUCER_ID}/edit`);
  await expect(page.getByRole("heading", { name: "עריכה: מאפיית שקד" }), "control: the edit form never rendered").toBeVisible({ timeout: 15_000 });
}

const checklistToggle = (page: Page) => page.getByRole("button", { name: /^רשימת בדיקה לפני אישור/ });

async function openQueueChecklist(page: Page): Promise<void> {
  await page.goto("/admin/producers");
  await expect(page.getByRole("heading", { name: "בתי עסק", exact: true }), "control: the queue never rendered").toBeVisible({ timeout: 15_000 });
  await checklistToggle(page).click();
  await expect(checklistToggle(page)).toHaveAttribute("aria-expanded", "true");
}

// ── MT:MEH-1399:1-9 — the checklist editor ────────────────────────────────

test.describe("checklist editor — /admin/settings", () => {
  // MT:MEH-1399:1 — the block, with the seven items, each with a label field and a hint field.
  test("the block lists the seven items, each with a «סעיף» field and an «הסבר» field", async ({ page }) => {
    await stubAdmin(page);
    await openSettings(page);
    await expect(labelInputs(page)).toHaveCount(7);
    await expect(hintInputs(page)).toHaveCount(7);
    const labels = seed().map((i) => i.label);
    for (let i = 0; i < labels.length; i++) await expect(labelInputs(page).nth(i)).toHaveValue(labels[i]);
    await expect(hintInputs(page).nth(1)).toHaveValue("חשד לתמונת סטוק — בדקי חיפוש הפוך");
  });

  // MT:MEH-1399:2 — rewording + save + reload reads the new wording back.
  test("a reworded item is PUT and comes back after a reload", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes });
    await openSettings(page);
    await labelInputs(page).first().fill("פרטים בסיסיים תקינים — כולל תיאור");
    await saveBtn(page).click();
    await expect(savedMark(page)).toBeVisible();
    expect(puts(writes, "/admin/checklist-items")).toHaveLength(1);
    const sent = (puts(writes, "/admin/checklist-items")[0].body as { items: { label: string }[] }).items;
    expect(sent[0].label).toBe("פרטים בסיסיים תקינים — כולל תיאור");
    expect(sent).toHaveLength(7);
    await page.reload();
    await openSettings(page);
    await expect(labelInputs(page).first()).toHaveValue("פרטים בסיסיים תקינים — כולל תיאור");
  });

  // MT:MEH-1399:3 — «נשמר ✓» disappears the moment any field changes.
  test("«נשמר ✓» disappears the moment a field is typed into", async ({ page }) => {
    await stubAdmin(page);
    await openSettings(page);
    await saveBtn(page).click();
    await expect(savedMark(page)).toBeVisible();
    await hintInputs(page).nth(3).fill("א");
    await expect(savedMark(page)).toHaveCount(0);
    await saveBtn(page).click();
    await expect(savedMark(page)).toBeVisible();
    await labelInputs(page).nth(5).pressSequentially("!");
    await expect(savedMark(page)).toHaveCount(0);
  });

  // MT:MEH-1399:4 — the same for the order arrows and for «הוספת סעיף».
  test("«נשמר ✓» also disappears on an arrow and on «הוספת סעיף»", async ({ page }) => {
    await stubAdmin(page);
    await openSettings(page);
    await saveBtn(page).click();
    await expect(savedMark(page)).toBeVisible();
    await block(page).getByRole("button", { name: `הורידי את «${seed()[0].label}»` }).click();
    await expect(savedMark(page)).toHaveCount(0);
    await saveBtn(page).click();
    await expect(savedMark(page)).toBeVisible();
    await addBtn(page).click();
    await expect(savedMark(page)).toHaveCount(0);
  });

  // MT:MEH-1399:5 — ↑/↓ reorder, save, reload: the new order holds.
  test("the arrows reorder, the PUT carries the new order, and a reload keeps it", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes });
    await openSettings(page);
    const [first, second] = seed().map((i) => i.label);
    await expect(block(page).getByRole("button", { name: `העלי את «${first}»` }), "the first item's ↑ must be disabled").toBeDisabled();
    await block(page).getByRole("button", { name: `הורידי את «${first}»` }).click();
    await expect(labelInputs(page).nth(0)).toHaveValue(second);
    await expect(labelInputs(page).nth(1)).toHaveValue(first);
    await saveBtn(page).click();
    await expect(savedMark(page)).toBeVisible();
    const sent = (puts(writes, "/admin/checklist-items")[0].body as { items: { label: string }[] }).items.map((i) => i.label);
    expect(sent.slice(0, 2)).toEqual([second, first]);
    await page.reload();
    await openSettings(page);
    await expect(labelInputs(page).nth(0)).toHaveValue(second);
    await expect(labelInputs(page).nth(1)).toHaveValue(first);
  });

  // MT:MEH-1399:6 — an emptied label disables the save and says why. ⚠️ STALE on the copy and the threshold (D1).
  test("an emptied label disables the save and shows the too-short message", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes });
    await openSettings(page);
    await expect(saveBtn(page), "control: the save must start enabled").toBeEnabled();
    await labelInputs(page).nth(2).fill("");
    await expect(saveBtn(page)).toBeDisabled();
    await expect(block(page).getByText("תווית קצרה מדי — לפחות 3 אותיות")).toBeVisible();
    // Two letters is still short; three lights it back up.
    await labelInputs(page).nth(2).fill("אב");
    await expect(saveBtn(page)).toBeDisabled();
    await labelInputs(page).nth(2).fill("אבג");
    await expect(saveBtn(page)).toBeEnabled();
    await expect(block(page).getByText("תווית קצרה מדי — לפחות 3 אותיות")).toHaveCount(0);
    expect(puts(writes, "/admin/checklist-items"), "nothing may have been PUT while the list was invalid").toHaveLength(0);
  });

  // MT:MEH-1399:7 — a new item lands last here AND in the review flow.
  test("«הוספת סעיף» + save appends the item, and the review flow shows it", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes });
    await openSettings(page);
    await addBtn(page).click();
    await expect(labelInputs(page)).toHaveCount(8);
    await labelInputs(page).nth(7).fill("שיחת וידאו קצרה עם בעלת העסק");
    await saveBtn(page).click();
    await expect(savedMark(page)).toBeVisible();
    const sent = (puts(writes, "/admin/checklist-items")[0].body as { items: { id: string | null; label: string }[] }).items;
    expect(sent).toHaveLength(8);
    expect(sent[7]).toMatchObject({ id: null, label: "שיחת וידאו קצרה עם בעלת העסק" });
    await page.reload();
    await openSettings(page);
    await expect(labelInputs(page)).toHaveCount(8);
    await expect(labelInputs(page).nth(7)).toHaveValue("שיחת וידאו קצרה עם בעלת העסק");
    // …and on the queue, the eighth checkbox is that item.
    await openQueueChecklist(page);
    await expect(page.getByRole("checkbox")).toHaveCount(8);
    await expect(page.getByRole("checkbox", { name: /^שיחת וידאו קצרה עם בעלת העסק/ })).toBeVisible();
    await expect(checklistToggle(page)).toContainText("/8)");
  });

  // MT:MEH-1399:8 — no delete anywhere; the only per-item switch is «בשימוש».
  test("there is no delete control — only a «בשימוש» checkbox per item", async ({ page }) => {
    await stubAdmin(page);
    await openSettings(page);
    await expect(block(page).getByRole("button", { name: /מחק|מחיקה|הסר/ })).toHaveCount(0);
    await expect(block(page).getByRole("checkbox")).toHaveCount(7);
    await expect(block(page).getByText("בשימוש", { exact: true })).toHaveCount(7);
    await expect(block(page).getByText("הופסק השימוש", { exact: true })).toHaveCount(0);
  });

  // MT:MEH-1399:9 — deactivating keeps the item visible (dimmed) here and drops it from the review flow.
  test("a deactivated item stays here dimmed as «הופסק השימוש» and leaves the review flow", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes });
    await openSettings(page);
    const gone = seed()[1].label;
    await block(page).getByRole("checkbox").nth(1).uncheck();
    await expect(block(page).getByText("הופסק השימוש", { exact: true })).toHaveCount(1);
    await saveBtn(page).click();
    await expect(savedMark(page)).toBeVisible();
    const sent = (puts(writes, "/admin/checklist-items")[0].body as { items: { label: string; active: boolean }[] }).items;
    expect(sent[1]).toMatchObject({ label: gone, active: false });
    await page.reload();
    await openSettings(page);
    await expect(labelInputs(page)).toHaveCount(7);
    await expect(labelInputs(page).nth(1)).toHaveValue(gone);
    await expect(block(page).getByRole("listitem").nth(1)).toHaveClass(/opacity-60/);
    await expect(block(page).getByText("הופסק השימוש", { exact: true })).toHaveCount(1);
    await openQueueChecklist(page);
    await expect(page.getByRole("checkbox")).toHaveCount(6);
    await expect(page.getByRole("checkbox", { name: new RegExp(`^${gone}`) })).toHaveCount(0);
    await expect(checklistToggle(page)).toContainText("/6)");
  });
});

// ── MT:MEH-2072:1-6 — the licence expiry on the admin edit form ───────────

test.describe("licence expiry — /admin/producers/[id]/edit", () => {
  const expiry = (page: Page) => page.getByLabel("תוקף רישיון (מהמסמך)");
  const number = (page: Page) => page.locator("#admin-producer-license");
  const toggle = (page: Page) => page.getByRole("button", { name: "יש לי רישיון יצרן ↓" });
  const save = (page: Page) => page.getByRole("button", { name: "שמרו שינויים" });

  // MT:MEH-2072:1 — with a licence number the date field renders, with its hint. (D4: below, not beside.)
  test("a licensed business shows the expiry date field with its hint sentence", async ({ page }) => {
    await stubAdmin(page, { profile: producer({ producer_license_number: "1234567", license_expires_at: "2027-01-31" }) });
    await openEdit(page);
    await expect(expiry(page)).toBeVisible();
    await expect(expiry(page)).toHaveAttribute("type", "date");
    await expect(expiry(page)).toHaveValue("2027-01-31");
    await expect(number(page)).toHaveValue("1234567");
    await expect(page.getByText("התאריך שמופיע על מסמך הרישיון. עסקים שהרישיון שלהם פג בתוך 30 יום מופיעים ברשימת התזכורות.")).toBeVisible();
    await expect(toggle(page)).toHaveCount(0);
  });

  // MT:MEH-2072:2 — no number and no date: both hide behind the toggle, and the toggle reveals both.
  test("with neither number nor date the fields hide behind «יש לי רישיון יצרן ↓», which reveals both", async ({ page }) => {
    await stubAdmin(page, { profile: producer({ categories: NO_LICENCE_CATEGORY }) });
    await openEdit(page);
    await expect(toggle(page)).toBeVisible();
    await expect(expiry(page)).toHaveCount(0);
    await expect(number(page)).toHaveCount(0);
    await toggle(page).click();
    await expect(number(page)).toBeVisible();
    await expect(expiry(page)).toBeVisible();
    await expect(toggle(page)).toHaveCount(0);
  });

  // MT:MEH-2072:3 — a date with no number opens the block by itself.
  test("a date with no number opens the block without a click", async ({ page }) => {
    await stubAdmin(page, { profile: producer({ categories: NO_LICENCE_CATEGORY, producer_license_number: null, license_expires_at: "2026-11-30" }) });
    await openEdit(page);
    await expect(toggle(page)).toHaveCount(0);
    await expect(expiry(page)).toBeVisible();
    await expect(expiry(page)).toHaveValue("2026-11-30");
    await expect(number(page)).toHaveValue("");
  });

  // MT:MEH-2072:4 — set a date, save, load again: the date is back.
  test("a saved date is sent on the PUT and read back on the next load", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { profile: producer({ producer_license_number: "1234567" }), writes });
    await openEdit(page);
    await expiry(page).fill("2027-03-15");
    await save(page).click();
    await expect.poll(() => puts(writes, `/admin/producers/${PRODUCER_ID}`).length, { message: "the save never left the browser" }).toBe(1);
    expect((puts(writes, `/admin/producers/${PRODUCER_ID}`)[0].body as Record<string, unknown>).license_expires_at).toBe("2027-03-15");
    await page.waitForURL(/\/admin(\?|$)/);
    await openEdit(page);
    await expect(expiry(page)).toHaveValue("2027-03-15");
  });

  // MT:MEH-2072:5 — clearing the date sends `null`, not the old value.
  test("clearing the date sends null", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { profile: producer({ producer_license_number: "1234567", license_expires_at: "2027-01-31" }), writes });
    await openEdit(page);
    await expect(expiry(page)).toHaveValue("2027-01-31");
    await expiry(page).fill("");
    await save(page).click();
    await expect.poll(() => puts(writes, `/admin/producers/${PRODUCER_ID}`).length).toBe(1);
    expect((puts(writes, `/admin/producers/${PRODUCER_ID}`)[0].body as Record<string, unknown>).license_expires_at).toBeNull();
  });

  // MT:MEH-2072:6 — a past date is legitimate input and saves.
  test("a date in the past saves — the form does not block it", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { profile: producer({ producer_license_number: "1234567" }), writes });
    await openEdit(page);
    await expect(expiry(page)).not.toHaveAttribute("min", /.+/);
    await expiry(page).fill("2024-01-15");
    await save(page).click();
    await expect.poll(() => puts(writes, `/admin/producers/${PRODUCER_ID}`).length).toBe(1);
    expect((puts(writes, `/admin/producers/${PRODUCER_ID}`)[0].body as Record<string, unknown>).license_expires_at).toBe("2024-01-15");
    await page.waitForURL(/\/admin(\?|$)/);
    // The save-error toast copy (producers.form.errors.save) must not appear.
    await expect(page.getByText("שגיאה בשמירה")).toHaveCount(0);
  });
});

// ── MT:MEH-228:1-2 — double-submit protection off the queue ───────────────

test.describe("double-submit protection — reports and users", () => {
  const REPORTS = [
    {
      producer_id: "601", producer_name: "עסק מדווח", report_count: 2, auto_flagged: false,
      reports: [
        { id: "r-1", reason: "מוצר לא הגיע", created_at: "2026-09-01T08:00:00Z" },
        { id: "r-2", reason: "מחיר שונה מהמפורסם", created_at: "2026-09-02T08:00:00Z" },
      ],
    },
  ];
  const USERS = [
    { id: "u-1", email: "dana@example.com", name: "דנה לוי", city: "חיפה", phone: null, role: "consumer", is_blocked: false, producer_id: null, favorites_count: 2, created_at: "2026-08-01T08:00:00Z" },
  ];

  /** Fires a double click and requires exactly ONE request, with the button disabled while it flies. */
  async function expectSingleFire(page: Page, btn: ReturnType<Page["getByRole"]>, count: () => number, expected: number, why: string): Promise<void> {
    await btn.dblclick();
    await expect(btn).toBeDisabled();
    await expect.poll(count).toBe(expected);
    const extra = await expect.poll(count, { timeout: 1_500 }).toBeGreaterThan(expected).then(() => true).catch(() => false);
    expect(extra, why).toBe(false);
    await expect(btn).toBeEnabled();
  }

  // MT:MEH-228:1 — /admin/reports: «השהה עסק» once per double click. ⚠️ STALE on «אשר»/«הסר»/«שחזר» (D2).
  test("/admin/reports — a double click on «השהה עסק» fires one toggle-status", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { reports: REPORTS, postDelayMs: 1_200, writes });
    await page.goto("/admin/reports");
    await expect(page.getByRole("heading", { name: "דיווחים ובעיות" }), "control: the reports page never rendered").toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("עסק מדווח")).toBeVisible();
    await expectSingleFire(page, page.getByRole("button", { name: "השהה עסק" }), () => posts(writes, "/toggle-status").length, 1, "the second click must not suspend twice");
    expect(posts(writes, "/toggle-status")[0].url).toBe("/admin/producers/601/toggle-status");
  });

  // MT:MEH-228:1 (second action) — «התעלם» confirms, then dismisses each report once, with the confirm disabled in flight.
  test("/admin/reports — a double click on the dismiss confirm sends one dismiss per report", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { reports: REPORTS, postDelayMs: 1_200, writes });
    await page.goto("/admin/reports");
    await expect(page.getByText("עסק מדווח"), "control: the reports page never rendered").toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "התעלם" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("להתעלם מכל הדיווחים על עסק מדווח?");
    const confirm = dialog.getByRole("button", { name: /^(התעלם|מתעלמת…)$/ });
    await confirm.dblclick();
    await expect(confirm).toBeDisabled();
    await expect(confirm).toHaveText("מתעלמת…");
    await expect.poll(() => posts(writes, "/dismiss").length).toBe(2);
    const extra = await expect.poll(() => posts(writes, "/dismiss").length, { timeout: 1_500 }).toBeGreaterThan(2).then(() => true).catch(() => false);
    expect(extra, "two reports, two dismisses — never four").toBe(false);
    expect(posts(writes, "/dismiss").map((w) => w.url).sort()).toEqual(["/admin/reports/r-1/dismiss", "/admin/reports/r-2/dismiss"]);
    await expect(dialog).toHaveCount(0);
  });

  // MT:MEH-228:2 — /admin/users: «חסום» once per double click.
  test("/admin/users — a double click on «חסום» fires one block", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { users: USERS, postDelayMs: 1_200, writes });
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "משתמשים" }), "control: the users page never rendered").toBeVisible({ timeout: 15_000 });
    const row = page.locator("tbody tr").filter({ has: page.getByText("דנה לוי", { exact: true }) });
    await expect(row).toHaveCount(1);
    await expectSingleFire(page, row.getByRole("button", { name: "חסום", exact: true }), () => posts(writes, "/block").length, 1, "the second click must not block twice");
    expect(posts(writes, "/block")[0].url).toBe("/admin/users/u-1/block");
  });
});
