import { test, expect, type Page } from "../_cloudinary-stub";
import type { Route } from "@playwright/test";

/**
 * Spec:     manual/dashboard-images-contact — MEH-1249 chunk 11h of 12
 * Purpose:  Convert the CONVERT-verdict rows of the remaining edit-tab cards
 *           and the two rows of the 16/07 sweep that live in the edit tab:
 *             MT:MEH-1099        images: drag-over state, type filter, click,
 *                                the three tips
 *             MT:MEH-1439:2-4    diet helper under the product diet chips;
 *                                the conditional kosher hint
 *             MT:MEH-1537:4-5    contact channels: what the client puts on the
 *                                wire (empty email → null; the payload shape)
 *             MT:MEH-SWEEP1607:1,3,5 — the 16/07 sweep (heading has no card
 *                                id; SWEEP1607 is its marker name): upload saves
 *                                without «שמור», the banner names several cards,
 *                                the product form's guidance
 *             MT:MEH-1884:1-3    hours as a completeness step (Overview)
 * Touches:  NO real backend. Reads route-fulfilled as chunks 11a–11g do; the
 *           GET answers with the last captured PUT merged in. POST /upload/image
 *           and PUT /producers/me are captured and fulfilled. No byte reaches a
 *           server. Drops are synthesised with a DataTransfer built in-page.
 * Does NOT: cover the mobile rows, the public badge tooltip (MT:MEH-1439:1 —
 *           /producer/[id]), the server-side validation messages of
 *           MT:MEH-1537:1-3 (the client only trims; the 422 text is the
 *           server's — see D1), the admin rows of MT:MEH-1884 (4-5), or the
 *           sweep's «סיימתי להשלים» (row 2 — the draft/changes-requested banner
 *           belongs to flows/34), the address search (row 6 — external key) and
 *           row 4 (covered by dashboard-edit-cards.spec.ts «products: zero is a
 *           todo, one is done»).
 * Related:  app/[locale]/producer/dashboard/edit/cards.jsx (ImagesCard :237,
 *           KashrutCard :1288) · components/ProductsSection.jsx ·
 *           app/[locale]/producer/dashboard/edit/page.js (ContactChannelsCard,
 *           DIRTY_CARD_NAMES) · components/ProfileCompletenessCard.jsx
 * History:  MEH-1249 chunk 11h.
 *
 * ─── MEH-1968 three conditions, stated because the rule requires it ────────
 *   1. No backend BEHAVIOUR is asserted — what renders, what the client sends,
 *      what it refuses to send.
 *   2. Every intercepted endpoint has a Pydantic model; the upload answer is
 *      the `{url}` shape ImagesCard reads (cards.jsx:265).
 *   3. Uploading real files and PUTting images/contact fields against the
 *      shared staging backend is a destructive write — forbidden (13/07).
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 * D1 · MT:MEH-1537:1-3 describe inline validation messages for a bad email /
 *      phone / group link. ContactChannelsCard does NO client-side validation
 *      (page.js ~1519-1525: every field is `.trim() || null`); the messages are
 *      the server's 422 surfaced through detailToMessage. Rows 1-3 are
 *      therefore backend rows; only rows 4-5 (payload shape) are converted.
 *      Row 5's "saved without hyphens" is likewise server-side: the client
 *      sends "050-123-4567" as typed.
 * D2 · MT:MEH-1884:3 says "the ring percentage does not move" when hours are
 *      filled and "the step list stays at 4". Since MEH-1895 `hours` is a
 *      counted SIXTH step (ProfileCompletenessCard.jsx buildSteps; chunk 11c
 *      D1), so filling hours moves 83% → 100% and collapses the card. The row
 *      is STALE; the measured behaviour is asserted.
 * D3 · MT:MEH-1099:1 says the frame "turns green". The drag-over state is a
 *      className change + the «שחררו כאן להעלאה» text; the text is asserted,
 *      the colour is not (VRT territory).
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const IMG = "https://res.cloudinary.com/demo/image/upload/p.jpg";
const IMG2 = "https://res.cloudinary.com/demo/image/upload/q.jpg";
const LOC_WITH_HOURS = { id: 1, kind: "branch", is_primary: true, lat: 32.08, lng: 34.78, opening_hours: "א-ה 09:00-17:00" };
const LOC_NO_HOURS = { ...LOC_WITH_HOURS, opening_hours: null };

const BASE = {
  id: 7, name: "מאפיית שקד", city: "חיפה", phone: "050-1234567", primary_contact_method: "whatsapp", whatsapp: "050-1234567",
  contact_email: "owner@example.com", whatsapp_group: null as string | null, instagram: null, website: null, facebook: null, external_order_form: null,
  phone_verified: true, has_physical_location: true, offers_delivery: false, delivery_nationwide: false, delivery_areas: [],
  categories: [{ id: 2, name: "לחמים ואפייה" }], images: [IMG], products: [{ id: 1, name: "חלה" }],
  short_description: "מאפייה שכונתית", description: "מאפייה שכונתית קטנה בלב חיפה",
  locations: [LOC_WITH_HOURS], plan: "free", kosher: null as string | null, kashrut_verified_at: null as string | null, kashrut_badges: [] as unknown[],
};

type Rec = { method: string; url: string; body: unknown };
type Opts = { profile?: Record<string, unknown>; status?: string; writes?: Rec[]; products?: unknown[] };

async function stubEdit(page: Page, opts: Opts = {}): Promise<void> {
  const p = opts.profile ?? BASE; const status = opts.status ?? "approved"; const writes = opts.writes; let lastPut: Record<string, unknown> = {};
  const json = (r: Route, s: number, b: unknown) => r.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
  const rec = (r: Route) => { const req = r.request(); let body: unknown = null; try { body = req.postDataJSON(); } catch { body = "<multipart>"; } writes?.push({ method: req.method(), url: new URL(req.url()).pathname.replace(/^.*\/api/, ""), body }); };
  await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) => json(r, 200, { id: 42, email: "owner@example.com", name: "שקד", role: "producer", producer_id: 7 }));
  await page.route("**/favorites**", (r) => json(r, 200, []));
  await page.route("**/producers/me/products**", (r) => json(r, 200, opts.products ?? []));
  for (const sub of ["locations", "name-change-requests", "kashrut-requests"]) await page.route(`**/producers/me/${sub}**`, (r) => json(r, 200, []));
  await page.route("**/upload/image", (r: Route) => { rec(r); return json(r, 200, { url: IMG2 }); });
  await page.route("**/producers/me/dashboard", (r) =>
    json(r, 200, { producer: { id: 7, name: BASE.name, slug: null, status, availability_state: "accepting_orders", vacation_until: null }, stats: {} }));
  await page.route("**/producers/me/analytics**", (r) =>
    json(r, 200, { profile_views: { total: 0, last_7d: 0 }, whatsapp_clicks: { total: 0, last_7d: 0 }, contact_clicks: { total: 0, last_7d: 0 },
      average_rating: null, total_reviews: 0, rank_in_city: null, conversion_rate: "0%", profile_strength: 10, top_cities: [], follower_count: 0, new_followers_this_week: 0 }));
  await page.route("**/producers/me", (r: Route) => {
    if (r.request().method() === "PUT") { rec(r); lastPut = { ...lastPut, ...(r.request().postDataJSON() as Record<string, unknown>) }; }
    return json(r, 200, { ...p, status, ...lastPut });
  });
}

/** #kashrut resolves to the merged «אישורים ותעודות» card (anchorId trust — chunk 11g D3); its section keeps its own id. */
const CARD_OF = (anchor: string) => (anchor === "kashrut" ? "trust" : anchor);
const card = (page: Page, anchor: string) => page.getByTestId(`accordion-${CARD_OF(anchor)}`);
const body = (page: Page, anchor: string) => (anchor === "kashrut" ? page.locator("#kashrut") : page.locator(`#${anchor} [role="region"]`));
async function openAt(page: Page, anchor: string): Promise<void> {
  await page.goto(`/producer/dashboard/edit#${anchor}`);
  await expect(card(page, anchor), `control: the card for #${anchor} never came on screen — every assertion here is void`).toBeVisible({ timeout: 15_000 });
  await expect(body(page, anchor)).toBeVisible();
}
const banner = (page: Page) => page.getByTestId("unsaved-banner");

/** Builds a DataTransfer holding one file inside the page, for synthetic drag events. */
async function dataTransferWith(page: Page, name: string, mime: string) {
  return page.evaluateHandle(([n, m]) => { const dt = new DataTransfer(); dt.items.add(new File(["x"], n, { type: m })); return dt; }, [name, mime]);
}

// ── MT:MEH-1099 + sweep row 1 — the images card ────────────────────────────

test.describe("images card", () => {
  const zone = (page: Page) => page.getByTestId("images-dropzone");

  // MT:MEH-1099:1 — drift D3: the drag-over text swaps in, and a dropped image is uploaded.
  test("dragging a file over the zone swaps the copy, and dropping an image uploads it", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, { writes });
    await openAt(page, "images");
    await expect(zone(page)).toContainText("הוספת תמונות");
    const dt = await dataTransferWith(page, "photo.jpg", "image/jpeg");
    await zone(page).dispatchEvent("dragover", { dataTransfer: dt });
    await expect(zone(page)).toContainText("שחררו כאן להעלאה");
    await zone(page).dispatchEvent("drop", { dataTransfer: dt });
    await expect.poll(() => writes.filter((w) => w.url.endsWith("/upload/image")).length, { message: "the upload never left the browser" }).toBe(1);
    await expect(zone(page)).not.toContainText("שחררו כאן להעלאה");
  });

  // MT:MEH-1099:2 — a non-image is filtered silently: no request, no error.
  test("dropping a PDF does nothing — no upload, no error", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, { writes });
    await openAt(page, "images");
    const dt = await dataTransferWith(page, "menu.pdf", "application/pdf");
    await zone(page).dispatchEvent("drop", { dataTransfer: dt });
    // Inverted bounded wait: the upload must NOT happen.
    const uploaded = await expect.poll(() => writes.filter((w) => w.url.endsWith("/upload/image")).length, { timeout: 2_000 }).toBeGreaterThan(0).then(() => true).catch(() => false);
    expect(uploaded, "a PDF must never reach /upload/image").toBe(false);
    await expect(body(page, "images").getByRole("alert")).toHaveCount(0);
  });

  // MT:MEH-1099:3 — the click path still opens the chooser.
  test("clicking the zone opens the file chooser", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "images");
    const chooser = page.waitForEvent("filechooser", { timeout: 5_000 });
    await zone(page).click();
    const fc = await chooser;
    // `await chooser` is the row's proof — the chooser opened. The line below is the one
    // property of it the app can lose: the zone's input is `multiple` (cards.jsx:390), and
    // a chooser opened from it says so. Drop that attribute and this reads red.
    expect(fc.isMultiple(), "the images chooser must accept several files").toBe(true);
  });

  // MT:MEH-1099:4 — three tips, Hebrew, no emoji.
  test("three photo tips render under the zone, in Hebrew, without emoji", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "images");
    const b = body(page, "images");
    for (const tip of ["אור טבעי, בלי פלאש", "תוצרת אמיתית כמו שהיא — לא מסוגננת יתר"]) await expect(b.getByText(tip)).toBeVisible();
    const tips = b.getByText(/בלי ת/).filter({ hasText: /סטוק|תמונות/ });
    await expect(tips.first()).toBeVisible();
    const text = await b.innerText();
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  // MT:MEH-SWEEP1607:1 (MEH-1236) — an upload persists on its own: the PUT fires without «שמירת תמונות».
  test("an upload saves without pressing save — the PUT carries the new image", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, { writes });
    await openAt(page, "images");
    const dt = await dataTransferWith(page, "photo.jpg", "image/jpeg");
    await zone(page).dispatchEvent("drop", { dataTransfer: dt });
    await expect.poll(() => writes.filter((w) => w.method === "PUT").length, { message: "no PUT followed the upload" }).toBe(1);
    expect(writes.find((w) => w.method === "PUT")!.body).toEqual({ images: [IMG, IMG2] });
  });
});

// ── MT:MEH-1439:2-4 + sweep row 5 — diet helper, kosher hint, product form ─

test.describe("diet semantics in the edit tab", () => {
  // MT:MEH-1439:3 — free-text kosher without a verified certificate → the hint.
  test("a free-text kosher field with no verified certificate shows the filter hint", async ({ page }) => {
    await stubEdit(page, { profile: { ...BASE, kosher: "בהשגחת הרבנות", kashrut_verified_at: null } });
    await openAt(page, "kashrut");
    await expect(page.getByTestId("kashrut-filter-hint")).toHaveText('כדי שהעסק יופיע בסינון "כשר", יש להעלות תעודת כשרות לאימות.');
  });

  // MT:MEH-1439:4 — verified → no hint.
  test("the kosher hint disappears once the certificate is verified", async ({ page }) => {
    await stubEdit(page, { profile: { ...BASE, kosher: "בהשגחת הרבנות", kashrut_verified_at: "2026-08-01T00:00:00Z" } });
    await openAt(page, "kashrut");
    await expect(page.locator("#kashrut")).toBeVisible();
    await expect(page.getByTestId("kashrut-filter-hint")).toHaveCount(0);
  });

  // MT:MEH-1439:2 · MT:MEH-SWEEP1607:5 (MEH-1239) — the add-product form carries the diet helper, the placeholders and the price hint.
  test("the new-product form explains the diet chips and guides name, description and price", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "products");
    await body(page, "products").getByRole("button", { name: "הוסיפו מוצר" }).click();
    const b = body(page, "products");
    await expect(b.getByText("סימון תווית על מוצר מציג את העסק בסינון המתאים בדפי החיפוש והמפה.")).toBeVisible();
    await expect(b.getByPlaceholder("לדוגמה: לחם מחמצת כוסמין")).toBeVisible();
    await expect(b.getByPlaceholder("לדוגמה: כיכר 750 גרם, נאפה בטאבון")).toBeVisible();
    await expect(b.getByText('מחיר אחיד? מלאו רק "מ-". טווח מחירים? מלאו גם "עד" (אופציונלי).')).toBeVisible();
  });
});

// ── MT:MEH-1537:4-5 — contact channels, what goes on the wire ──────────────

test.describe("contact channels — the wire", () => {
  const b = (page: Page) => body(page, "contact-channels");
  const save = (page: Page) => b(page).getByRole("button", { name: /^(שמירת ערוצי קשר|נשמר)$/ });

  // MT:MEH-1537:4 — an emptied email is sent as null.
  test("clearing the email sends null, not an empty string", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, { writes });
    await openAt(page, "contact-channels");
    const email = b(page).getByRole("textbox", { name: "אימייל" });
    await expect(email).toHaveValue("owner@example.com");
    await email.fill("");
    await save(page).click();
    await expect.poll(() => writes.filter((w) => w.method === "PUT").length, { message: "the PUT never left the browser" }).toBe(1);
    expect((writes[0].body as Record<string, unknown>).contact_email).toBeNull();
  });

  // MT:MEH-1537:5 — drift D1: valid values go out as typed; the hyphen strip is the server's.
  test("valid values go out in one payload — the phone exactly as typed", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, { writes });
    await openAt(page, "contact-channels");
    await b(page).getByLabel("טלפון", { exact: true }).fill("050-123-4567");
    await b(page).getByRole("textbox", { name: "אימייל" }).fill("owner@example.com");
    await b(page).getByLabel("קישור לקבוצת וואטסאפ", { exact: true }).fill("https://chat.whatsapp.com/ABCdef123");
    await save(page).click();
    await expect.poll(() => writes.filter((w) => w.method === "PUT").length).toBe(1);
    expect(writes[0].body).toMatchObject({ phone: "050-123-4567", contact_email: "owner@example.com", whatsapp_group: "https://chat.whatsapp.com/ABCdef123" });
    await expect(save(page)).toHaveText("נשמר");
  });
});

// ── MT:MEH-SWEEP1607:3 (MEH-1237) — the banner names every dirty card ───────

// MT:MEH-SWEEP1607:3
test("edits in two cards put both names in the unsaved banner, in card order", async ({ page }) => {
  await stubEdit(page);
  await openAt(page, "bio");
  await body(page, "bio").locator("textarea").first().fill("טיוטה");
  await expect(banner(page)).toContainText("תיאור העסק");
  // An in-page hash change re-runs the resolver (page.js hashchange listener) without unloading the
  // page — a page.goto would reload and drop the bio edit, which is exactly what the row is about.
  await page.evaluate(() => { location.hash = "#contact-channels"; });
  await expect(card(page, "contact-channels")).toBeVisible({ timeout: 15_000 });
  await expect(body(page, "contact-channels")).toBeVisible();
  await body(page, "contact-channels").getByLabel("טלפון", { exact: true }).fill("050-9999999");
  await expect(banner(page)).toContainText("תיאור העסק");
  await expect(banner(page)).toContainText("ערוצי קשר");
  await expect(page.getByTestId("unsaved-jump-bio")).toBeVisible();
  await expect(page.getByTestId("unsaved-jump-contact")).toBeVisible();
});

// ── MT:MEH-1884:1-3 — hours as a completeness step (Overview) ──────────────

test.describe("hours in the completeness card", () => {
  const cardRoot = (page: Page) => page.getByTestId("profile-completeness-card");
  const ring = (page: Page) => cardRoot(page).getByRole("progressbar");
  async function overview(page: Page, profile: Record<string, unknown>, status: string) {
    await stubEdit(page, { profile, status });
    await page.goto("/producer/dashboard");
    await expect(page.getByTestId("producer-overview"), "control: the Overview never rendered").toBeVisible({ timeout: 15_000 });
  }

  // MT:MEH-1884:1 — everything but hours → the card, with hours the one open step.
  test("a full profile without hours shows the card at 83% with «שעות פתיחה» open", async ({ page }) => {
    await overview(page, { ...BASE, locations: [LOC_NO_HOURS] }, "pending");
    await expect(ring(page)).toHaveAttribute("aria-valuenow", "83");
    await expect(cardRoot(page).getByTestId("completeness-chip-hours")).toBeVisible();
    await expect(cardRoot(page)).toContainText("שעות פתיחה");
  });

  // MT:MEH-1884:2 — with hours filled, an approved business no longer sees the card.
  test("with hours filled, an approved business has no completeness card", async ({ page }) => {
    await overview(page, { ...BASE, locations: [LOC_WITH_HOURS] }, "approved");
    await expect(page.getByTestId("producer-overview")).toHaveAttribute("data-state-complete", "true");
    await expect(cardRoot(page)).toHaveCount(0);
  });

  // MT:MEH-1884:3 — drift D2: the ring DOES move — hours is a counted sixth step.
  test("filling hours moves the ring from 83% to complete — hours is a counted step", async ({ page }) => {
    await overview(page, { ...BASE, locations: [LOC_NO_HOURS] }, "pending");
    await expect(ring(page)).toHaveAttribute("aria-valuenow", "83");
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await overview(page, { ...BASE, locations: [LOC_WITH_HOURS] }, "pending");
    await expect(cardRoot(page)).toContainText("הפרופיל מלא");
    await expect(ring(page)).toHaveCount(0);
  });
});
