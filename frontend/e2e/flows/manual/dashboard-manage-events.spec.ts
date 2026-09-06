import { test, expect, type Page } from "../_cloudinary-stub";
import type { Route } from "@playwright/test";

/**
 * Spec:     manual/dashboard-manage-events
 * Purpose:  MEH-1249 chunk 11l — MANUAL_TESTING «MEH-1405 — ניהול אירועים
 *           וחוויות בדשבורד»: the owner's "my events" and "my experiences"
 *           lists — tags, edit round-trip, cancel/reactivate, delete-with-confirm,
 *           the experience status tags, the live moderation check on edit, and
 *           the single-label address field in both forms.
 * Touches:  no backend. GET /events/mine and /experiences/mine are STATEFUL
 *           arrays: PUT merges into the row, DELETE removes it, so the list a
 *           save returns to reflects what the client sent. POST
 *           /experiences/validate answers APPROVED. The address autocomplete
 *           providers (nominatim.openstreetmap.org, places.googleapis.com) are
 *           fulfilled empty — AddressSearch queries them on mount for any
 *           prefilled value ≥3 chars (AddressSearch.jsx:82-100), and a CI
 *           runner must never depend on either. Default CI target.
 * Does NOT: assert the public /events feed (row 3's "check it is gone from
 *           /events" is the /events page group's), nor the create forms
 *           (/new), nor a real moderation verdict — backend/tests own those.
 * Related:  app/[locale]/producer/dashboard/{events,experiences}/page.js,
 *           …/[id]/edit/page.js, components/EventForm.jsx,
 *           components/ExperienceForm.jsx, components/AddressSearch.jsx.
 * History:  MEH-1249 chunk 11l (creation).
 *
 * ON MOCKING INSIDE flows/ — the three conditions in frontend/e2e/CLAUDE.md
 * (MEH-1968), stated rather than assumed:
 *   1. No assertion is about backend BEHAVIOUR — which rows render, what the
 *      browser sends on each action, how the list reflects a fixed response.
 *   2. The contracts are pinned: EventOut / ExperienceDetailOut (schemas.py),
 *      the validate endpoint's {status, reason, suggestion} verdict.
 *   3. Unmocked, every action here is a WRITE against the shared staging
 *      backend CI points at (e2e.yml:229-233) — Sapir's 13/07 ruling forbids it.
 *
 * MEH-1619 — shown discriminating (table in the PR body): three surgical
 * breaks, each red exactly one test here, the rest green.
 */

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const EV_A = "11111111-1111-4111-8111-111111111111";
const EV_B = "22222222-2222-4222-8222-222222222222";
const EX = {
  approved: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  pending: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  rejected: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  changes: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};

/** EventOut (schemas.py) — the shape /events/mine and /events/{id} return. */
const eventRow = (over: Record<string, unknown>) => ({
  id: EV_A, producer_id: "77777777-7777-4777-8777-777777777777", producer_name: "מאפיית שקד",
  title: "יום פתוח במאפייה", description: "בואו לראות איך נאפה הלחם, עם טעימות לכל המשפחה.",
  event_date: future(14), event_time: "18:00:00", location: "בחווה שלנו", city: "חיפה", lat: null, lng: null,
  image_url: null, category: "market", price: 0, max_participants: 20, registration_url: null, is_active: true,
  created_at: "2026-09-01T10:00:00Z", ...over,
});

/** ExperienceDetailOut (schemas.py). */
const experienceRow = (over: Record<string, unknown>) => ({
  id: EX.approved, title: "סדנת מחמצת ביתית", description: "שלוש שעות של לישה, קיפול ואפייה — חוזרים הביתה עם מחמצת חיה.",
  image_url: null, category: "cooking", event_date: future(21), event_time: "10:00:00", duration_minutes: 180,
  location_type: "home", city: "חיפה", max_participants: 8, participants_count: 0, spots_left: 8, price_per_person: 120,
  is_recurring: false, recurring_schedule: null, status: "approved", host: null, created_at: "2026-09-01T10:00:00Z",
  address: "רחוב הגפן 3", requirements: null, lat: null, lng: null, is_active: true,
  moderation_status: null, moderation_reason: null, moderation_suggestion: null, admin_feedback: null, rejection_reason: null, ...over,
});

type Rec = { method: string; url: string; body: unknown };
type Row = Record<string, unknown> & { id: string };

/**
 * Seeds a producer session and both manage lists. `events` / `experiences` are
 * the "server's" tables: PUT merges, DELETE removes, GET answers from them.
 */
async function stubManage(page: Page, events: Row[], experiences: Row[], writes: Rec[] = []) {
  const json = (r: Route, s: number, b: unknown) =>
    r.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
  await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) => json(r, 200, { id: 42, email: "owner@example.com", name: "שקד", role: "producer", producer_id: 7 }));
  await page.route("**/favorites**", (r) => json(r, 200, []));
  // The tools page renders its quick links only after this read (tools/page.js:55-58).
  await page.route("**/producers/me/dashboard", (r) =>
    json(r, 200, { producer: { id: 7, name: "מאפיית שקד", slug: "shaked", status: "approved", availability_state: "accepting_orders", vacation_until: null }, stats: {} }));
  // The address providers — never reached from a test.
  await page.route("https://nominatim.openstreetmap.org/**", (r) => json(r, 200, []));
  await page.route("https://places.googleapis.com/**", (r) => json(r, 200, {}));

  const table = (kind: "events" | "experiences", rows: Row[]) => async () => {
    await page.route(`**/${kind}/mine`, (r) => json(r, 200, rows));
    for (const row of [...rows]) {
      await page.route(`**/${kind}/${row.id}`, (r: Route) => {
        const m = r.request().method();
        const i = rows.findIndex((x) => x.id === row.id);
        if (m === "GET") return i >= 0 ? json(r, 200, rows[i]) : json(r, 404, { detail: "not found" });
        const body = m === "DELETE" ? null : (r.request().postDataJSON() as Record<string, unknown>);
        writes.push({ method: m, url: `/${kind}/${row.id}`, body });
        if (m === "PUT") { rows[i] = { ...rows[i], ...body }; return json(r, 200, rows[i]); }
        if (m === "DELETE") { rows.splice(i, 1); return r.fulfill({ status: 204, body: "" }); }
        return r.continue();
      });
    }
  };
  await table("events", events)();
  await table("experiences", experiences)();
  await page.route("**/experiences/validate", (r: Route) => {
    writes.push({ method: "POST", url: "/experiences/validate", body: r.request().postDataJSON() });
    return json(r, 200, { status: "APPROVED", reason: null, suggestion: null });
  });
}

const row = (page: Page, title: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 2, name: title }) });

// ── MT:MEH-1405:1-4 — my events ─────────────────────────────────────────────

test.describe("my events", () => {
  const A = () => eventRow({});
  const B = () => eventRow({ id: EV_B, title: "סדנת מחמצת", category: "tasting", is_active: false });

  // MT:MEH-1405:1 — reachable from the tools card; cancelled events stay listed, tagged.
  test("the tools card leads to «האירועים שלי», and the list shows active and cancelled events with their tags", async ({ page }) => {
    await stubManage(page, [A(), B()], []);
    await page.goto("/producer/dashboard/tools");
    await page.getByRole("link", { name: /האירועים שלי/ }).click();
    await expect(page).toHaveURL(/\/producer\/dashboard\/events$/);
    await expect(page.getByRole("heading", { level: 1, name: "האירועים שלי" })).toBeVisible();
    await expect(row(page, "יום פתוח במאפייה")).toBeVisible();
    await expect(row(page, "יום פתוח במאפייה").getByText("פעיל", { exact: true })).toBeVisible();
    await expect(row(page, "סדנת מחמצת")).toBeVisible();
    await expect(row(page, "סדנת מחמצת").getByText("מבוטל", { exact: true })).toBeVisible();
  });

  // MT:MEH-1405:2 — edit: same form, prefilled; a title change saves and shows on the list.
  test("editing an event opens the form prefilled, and saving a new title returns to the list showing it", async ({ page }) => {
    const writes: Rec[] = [];
    await stubManage(page, [A()], [], writes);
    await page.goto("/producer/dashboard/events");
    await row(page, "יום פתוח במאפייה").getByRole("link", { name: "עריכה" }).click();
    await expect(page).toHaveURL(new RegExp(`/producer/dashboard/events/${EV_A}/edit$`));
    await expect(page.getByRole("heading", { level: 1, name: "עריכת אירוע" })).toBeVisible();
    await expect(page.getByLabel(/^כותרת/)).toHaveValue("יום פתוח במאפייה");
    await expect(page.getByLabel(/^תיאור/)).toHaveValue("בואו לראות איך נאפה הלחם, עם טעימות לכל המשפחה.");
    await expect(page.getByLabel(/^תאריך/)).toHaveValue(A().event_date as string);
    await expect(page.getByLabel(/^שעה/)).toHaveValue("18:00");
    await expect(page.getByLabel("מיקום ספציפי")).toHaveValue("בחווה שלנו");
    await expect(page.getByLabel(/^עיר/)).toHaveValue("חיפה");
    // The category field shows the Hebrew label, not the key (events.categories.market).
    await expect(page.getByLabel(/^קטגוריה/)).toHaveValue("שוק");
    await expect(page.getByLabel(/^מחיר/)).toHaveValue("0");
    await expect(page.getByLabel(/^מקסימום משתתפ/)).toHaveValue("20");

    await page.getByLabel(/^כותרת/).fill("יום פתוח במאפייה — מהדורת חורף");
    await page.getByRole("button", { name: "שמירה" }).click();
    await expect(page).toHaveURL(/\/producer\/dashboard\/events$/);
    await expect(row(page, "יום פתוח במאפייה — מהדורת חורף")).toBeVisible();
    const put = writes.find((w) => w.method === "PUT");
    expect(put?.url).toBe(`/events/${EV_A}`);
    expect((put?.body as Record<string, unknown>).title).toBe("יום פתוח במאפייה — מהדורת חורף");
  });

  // MT:MEH-1405:3 — cancel flips tag + button at once; reactivate flips back. Each is one PUT of is_active.
  test("cancelling flips the tag to «מבוטל» and the button to «הפעלה», and reactivating flips both back", async ({ page }) => {
    const writes: Rec[] = [];
    await stubManage(page, [A()], [], writes);
    await page.goto("/producer/dashboard/events");
    const r = row(page, "יום פתוח במאפייה");
    await r.getByRole("button", { name: "ביטול" }).click();
    await expect(r.getByText("מבוטל", { exact: true })).toBeVisible();
    await expect(r.getByRole("button", { name: "הפעלה" })).toBeVisible();
    await expect(r.getByRole("button", { name: "ביטול" })).toHaveCount(0);
    await r.getByRole("button", { name: "הפעלה" }).click();
    await expect(r.getByText("פעיל", { exact: true })).toBeVisible();
    await expect(r.getByRole("button", { name: "ביטול" })).toBeVisible();
    expect(writes.map((w) => [w.method, w.body])).toEqual([["PUT", { is_active: false }], ["PUT", { is_active: true }]]);
  });

  // MT:MEH-1405:4 — delete asks first; dismiss keeps the row and sends nothing; accept removes it.
  test("delete asks first — dismissing keeps the row and sends nothing; accepting removes it and DELETEs", async ({ page }) => {
    const writes: Rec[] = [];
    await stubManage(page, [A(), B()], [], writes);
    await page.goto("/producer/dashboard/events");
    const r = row(page, "סדנת מחמצת");
    await expect(r).toBeVisible();

    const dismissed = page.waitForEvent("dialog").then((d) => { const msg = d.message(); d.dismiss(); return msg; });
    await r.getByRole("button", { name: "מחיקה" }).click();
    expect(await dismissed).toContain("סדנת מחמצת");
    await expect(r).toBeVisible();
    expect(writes, "dismissing the confirm must send nothing").toHaveLength(0);

    const accepted = page.waitForEvent("dialog").then((d) => d.accept());
    await r.getByRole("button", { name: "מחיקה" }).click();
    await accepted;
    await expect(r).toHaveCount(0);
    await expect(row(page, "יום פתוח במאפייה")).toBeVisible();
    expect(writes.map((w) => [w.method, w.url])).toEqual([["DELETE", `/events/${EV_B}`]]);
  });
});

// ── MT:MEH-1405:5-6 — my experiences ────────────────────────────────────────

test.describe("my experiences", () => {
  const four = () => [
    experienceRow({}),
    experienceRow({ id: EX.pending, title: "סיור שוק בשישי", status: "pending" }),
    experienceRow({ id: EX.rejected, title: "ערב יין וגבינות", status: "rejected" }),
    experienceRow({ id: EX.changes, title: "קטיף זיתים משפחתי", status: "changes_requested" }),
  ];

  // MT:MEH-1405:5 — four status tags; edit + delete on every row. Live drift: APPROVED rows DO carry the cancel toggle (MEH-1419).
  test("the experiences list shows the four status tags with edit + delete on every row — and a cancel toggle only on the approved one", async ({ page }) => {
    await stubManage(page, [], four());
    await page.goto("/producer/dashboard/experiences");
    await expect(page.getByRole("heading", { level: 1, name: "החוויות שלי" })).toBeVisible();
    for (const [title, tag] of [["סדנת מחמצת ביתית", "מאושרת"], ["סיור שוק בשישי", "בבדיקה"], ["ערב יין וגבינות", "נדחתה"], ["קטיף זיתים משפחתי", "נדרשים תיקונים"]] as const) {
      const r = row(page, title);
      await expect(r.getByText(tag, { exact: true })).toBeVisible();
      await expect(r.getByRole("link", { name: "עריכה" })).toBeVisible();
      await expect(r.getByRole("button", { name: "מחיקה" })).toBeVisible();
    }
    // The doc says "no cancel toggle"; the code offers it on APPROVED rows only (experiences/page.js:167).
    await expect(page.getByRole("button", { name: "ביטול" })).toHaveCount(1);
    await expect(row(page, "סדנת מחמצת ביתית").getByRole("button", { name: "ביטול" })).toBeVisible();
  });

  // MT:MEH-1405:6 — edit: prefilled incl. the address; the live moderation check fires; save returns to the list.
  test("editing an experience opens the form prefilled including the address, the live moderation check fires, and saving returns to the list", async ({ page }) => {
    const writes: Rec[] = [];
    await stubManage(page, [], four(), writes);
    await page.goto("/producer/dashboard/experiences");
    await row(page, "סדנת מחמצת ביתית").getByRole("link", { name: "עריכה" }).click();
    await expect(page).toHaveURL(new RegExp(`/producer/dashboard/experiences/${EX.approved}/edit$`));
    await expect(page.getByRole("heading", { level: 1, name: "עריכת חוויה" })).toBeVisible();
    await expect(page.getByLabel(/^כותרת החוויה/)).toHaveValue("סדנת מחמצת ביתית");
    await expect(page.getByLabel(/^כתובת/)).toHaveValue("רחוב הגפן 3");
    await expect(page.getByLabel(/^עיר/)).toHaveValue("חיפה");
    // The debounced check (1.5 s) re-validates the prefilled content.
    await expect.poll(() => writes.filter((w) => w.url === "/experiences/validate").length, { timeout: 8_000, message: "the live moderation check never fired" }).toBeGreaterThan(0);

    await page.getByLabel(/^כותרת החוויה/).fill("סדנת מחמצת ביתית — סבב חורף");
    await page.getByRole("button", { name: "שמירה" }).click();
    await expect(page.getByText("החוויה נשלחה לאישור")).toBeVisible();
    await expect(page).toHaveURL(/\/producer\/dashboard\/experiences$/);
    await expect(row(page, "סדנת מחמצת ביתית — סבב חורף")).toBeVisible();
    const put = writes.find((w) => w.method === "PUT");
    expect(put?.url).toBe(`/experiences/${EX.approved}`);
    expect((put?.body as Record<string, unknown>).address).toBe("רחוב הגפן 3");
  });
});

// ── MT:MEH-1405:7 — one label for the address field, in both forms ──────────

test("the address field carries exactly one label in both forms — one accessible name, no sr-only twin", async ({ page }) => {
  await stubManage(page, [eventRow({})], [experienceRow({})]);
  await page.goto(`/producer/dashboard/events/${EV_A}/edit`);
  const evField = page.getByRole("combobox", { name: "מיקום ספציפי" });
  await expect(evField).toHaveCount(1);
  await expect(page.getByText("מיקום ספציפי", { exact: true })).toHaveCount(1);
  // The name must be EXACTLY the visible label — a second (sr-only) label would concatenate into it.
  expect(await evField.evaluate((el) => (el as HTMLInputElement).labels?.length)).toBe(1);

  await page.goto(`/producer/dashboard/experiences/${EX.approved}/edit`);
  const exField = page.getByRole("combobox", { name: /^כתובת \(פרטית/ });
  await expect(exField).toHaveCount(1);
  await expect(page.getByText(/^כתובת \(פרטית/)).toHaveCount(1);
  expect(await exField.evaluate((el) => (el as HTMLInputElement).labels?.length)).toBe(1);
});
