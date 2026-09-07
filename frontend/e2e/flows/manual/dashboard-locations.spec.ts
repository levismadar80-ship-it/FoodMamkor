import { test, expect, type Page, type Route } from "../_cloudinary-stub";

/**
 * Spec:     manual/dashboard-locations — MEH-1249 chunk 11f of 12
 * Purpose:  Convert the CONVERT-verdict rows of the locations editor
 *           ("מיקומים", anchor #locations) in the edit tab:
 *             MT:MEH-1421   list · add · single primary · same-city label
 *                           rule (three message shapes, the floor stated up
 *                           front, in-form placement, persistence until typing)
 *                           · row-level errors stay toasts · invalid coords
 * Touches:  NO real backend. Reads are route-fulfilled as chunks 11a–11e do,
 *           and `/producers/me/locations` is a small STATEFUL stub: POST
 *           appends, PUT merges (and flips `is_primary` exclusively), DELETE
 *           removes — or answers the status a test asks for. Every write is
 *           captured; no byte reaches a server.
 * Does NOT: cover promotion after deleting the primary (MT:MEH-1421:11 — the
 *           server picks the successor; backend/tests own it), the admin dedup
 *           badge (MT:MEH-1421:12 — /admin), or geocoding (the address field is
 *           left empty; city alone is a valid location).
 * Related:  app/[locale]/producer/dashboard/edit/LocationsEditor.jsx ·
 *           lib/errors.js sameCityLabelParams · lib/schemas.js
 *           LocationInputSchema · components/CitySearch.jsx
 * History:  MEH-1249 chunk 11f.
 *
 * ─── MEH-1968 three conditions, stated because the rule requires it ────────
 *   1. No backend BEHAVIOUR is asserted — which rows render, which message the
 *      client composes from a 422's `params`, what it puts on the wire, and
 *      what it refuses to send.
 *   2. The 422 shape is the MEH-1943 `{code, message, params}` envelope with
 *      `code = location_same_city_needs_label` (lib/errors.js:69); the list
 *      endpoints have Pydantic models; LocationInputSchema mirrors the server.
 *   3. Reaching "two locations in the same town" honestly means writing rows
 *      to the shared staging backend CI points at — forbidden (Sapir 13/07).
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 * D1 · MT:MEH-1421:10 expects a TOAST for an invalid latitude. The client check
 *      is LocationInputSchema (Zod, "קו רוחב לא תקין") and its message renders
 *      IN THE FORM via setSaveError → data-testid="location-form-error"
 *      (LocationsEditor.jsx handleCreate), not as a toast. Asserted where it
 *      renders; the "not sent to the server" half is asserted as written.
 * D2 · MT:MEH-1421:1 says "★ ראשי". The badge is a Phosphor <Star> glyph plus
 *      the `primary_badge` key = "ראשי"; the text node is "ראשי" alone.
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const IMG = "https://res.cloudinary.com/demo/image/upload/p.jpg";
type Loc = { id: number; kind: string; label: string | null; city: string | null; address: string | null; lat: number | null; lng: number | null; opening_hours: string | null; phone: string | null; is_primary: boolean; location_precision: string };
const loc = (o: Partial<Loc> & { id: number }): Loc => ({ kind: "branch", label: null, city: "חיפה", address: null, lat: 32.08, lng: 34.78, opening_hours: null, phone: null, is_primary: false, location_precision: "approximate", ...o });

const PROFILE = {
  id: 7, name: "מאפיית שקד", city: "חיפה", phone: "050-1234567", primary_contact_method: "whatsapp", whatsapp: "050-1234567",
  phone_verified: true, has_physical_location: true, offers_delivery: false, delivery_nationwide: false, delivery_areas: [],
  categories: [{ id: 2, name: "לחמים ואפייה" }], images: [{ id: 1, url: IMG }], products: [{ id: 1, name: "חלה" }],
  short_description: "מאפייה שכונתית", description: "מאפייה שכונתית קטנה בלב חיפה",
};

type Rec = { method: string; url: string; body: unknown };
type Opts = {
  locations?: Loc[];
  /** what a POST answers instead of appending: { status, detail } */
  postFails?: { status: number; detail: unknown };
  /** what a DELETE answers instead of removing. `detail: null` → the client's own fallback copy. */
  deleteFails?: { status: number; detail: unknown };
  writes?: Rec[];
};

async function stubEdit(page: Page, opts: Opts = {}): Promise<{ list: () => Loc[] }> {
  let rows: Loc[] = (opts.locations ?? [loc({ id: 1, is_primary: true, label: "החנות" })]).map((r) => ({ ...r }));
  const writes = opts.writes;
  const json = (r: Route, status: number, body: unknown) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) => json(r, 200, { id: 42, email: "owner@example.com", name: "שקד", role: "producer", producer_id: 7 }));
  await page.route("**/favorites**", (r) => json(r, 200, []));
  await page.route("**/api/cities**", (r) => json(r, 200, []));
  for (const sub of ["products", "name-change-requests", "kashrut-requests"]) {
    await page.route(`**/producers/me/${sub}**`, (r) => json(r, 200, []));
  }
  await page.route("**/producers/me/dashboard", (r) =>
    json(r, 200, { producer: { id: 7, name: PROFILE.name, slug: null, status: "approved", availability_state: "accepting_orders", vacation_until: null }, stats: {} }));
  await page.route("**/producers/me/analytics**", (r) =>
    json(r, 200, { profile_views: { total: 0, last_7d: 0 }, whatsapp_clicks: { total: 0, last_7d: 0 }, contact_clicks: { total: 0, last_7d: 0 },
      average_rating: null, total_reviews: 0, rank_in_city: null, conversion_rate: "0%", profile_strength: 10, top_cities: [], follower_count: 0, new_followers_this_week: 0 }));
  await page.route("**/producers/me", (r: Route) => {
    const p = { ...PROFILE, status: "approved", locations: rows };
    if (r.request().method() === "PUT") {
      const body = r.request().postDataJSON() as Record<string, unknown>;
      writes?.push({ method: "PUT", url: "/producers/me", body });
      return json(r, 200, { ...p, ...body });
    }
    return json(r, 200, p);
  });
  // The stateful half. Registered last so it wins over nothing — the generic
  // child-card loop above deliberately skips `locations`.
  await page.route("**/producers/me/locations**", (r: Route) => {
    const req = r.request(); const method = req.method();
    const path = new URL(req.url()).pathname;
    const idMatch = path.match(/\/locations\/(\d+)$/); const id = idMatch ? Number(idMatch[1]) : null;
    if (method === "GET") return json(r, 200, rows);
    const body = method === "DELETE" ? null : (req.postDataJSON() as Record<string, unknown>);
    writes?.push({ method, url: path.replace(/^.*\/producers/, "/producers"), body });
    if (method === "POST") {
      if (opts.postFails) return json(r, opts.postFails.status, { detail: opts.postFails.detail });
      const next = loc({ id: Math.max(0, ...rows.map((x) => x.id)) + 1, ...(body as Partial<Loc>) });
      if (next.is_primary) rows = rows.map((x) => ({ ...x, is_primary: false }));
      rows = [...rows, next]; return json(r, 201, next);
    }
    if (method === "PUT" && id !== null) {
      if ((body as Loc).is_primary) rows = rows.map((x) => ({ ...x, is_primary: false }));
      rows = rows.map((x) => (x.id === id ? { ...x, ...(body as Partial<Loc>) } : x));
      return json(r, 200, rows.find((x) => x.id === id));
    }
    if (method === "DELETE" && id !== null) {
      if (opts.deleteFails) return json(r, opts.deleteFails.status, { detail: opts.deleteFails.detail });
      rows = rows.filter((x) => x.id !== id); return r.fulfill({ status: 204, body: "" });
    }
    return json(r, 405, { detail: "unexpected" });
  });
  return { list: () => rows };
}

const card = (page: Page) => page.getByTestId("accordion-locations");
const editor = (page: Page) => page.getByTestId("locations-editor");
const rowsOf = (page: Page) => editor(page).getByRole("button", { name: "מחקו מיקום" });
const primaryBadges = (page: Page) => editor(page).getByText("ראשי", { exact: true });
const setPrimaryBtns = (page: Page) => editor(page).getByRole("button", { name: "קבעו כראשי" });
const addBtn = (page: Page) => page.getByTestId("locations-add");
const form = (page: Page) => page.getByTestId("location-form");
const formError = (page: Page) => page.getByTestId("location-form-error");
const saveBtn = (page: Page) => page.getByTestId("location-save");
const labelInput = (page: Page) => page.getByTestId("location-label");
const ACTION = "כדי שהלקוחות יבדילו ביניהם, תני למיקום הזה שם — לפחות שלוש אותיות.";

async function openLocations(page: Page): Promise<void> {
  await page.goto("/producer/dashboard/edit#locations");
  await expect(card(page), "control: #locations never came on screen — every assertion here is void").toBeVisible({ timeout: 15_000 });
  await expect(editor(page)).toBeVisible();
}

/** Opens the add form and commits a city from the static list. */
async function startAdding(page: Page, city: string): Promise<void> {
  await addBtn(page).click();
  await expect(form(page)).toBeVisible();
  const cityBox = form(page).getByTestId("location-city-field").getByRole("combobox");
  await cityBox.fill(city);
  const option = page.getByRole("option", { name: city, exact: true });
  await expect(option, `control: «${city}» never appeared in the city list`).toBeVisible();
  await option.click();
}

async function openDetails(page: Page): Promise<void> {
  const toggle = page.getByTestId("location-details-toggle");
  if (!(await labelInput(page).isVisible())) await toggle.click();
  await expect(labelInput(page)).toBeVisible();
}

const sameCity = (params: Record<string, unknown>) => ({ status: 422, detail: { code: "location_same_city_needs_label", message: "same city", params } });

// ── MT:MEH-1421 — the locations editor ─────────────────────────────────────

test.describe("locations editor — list, add, primary", () => {
  // MT:MEH-1421:1 — drift D2: the badge text is «ראשי»; «קבעו כראשי» on every other row; the add CTA.
  test("the list marks the primary, offers «קבעו כראשי» on the others, and has an add button", async ({ page }) => {
    await stubEdit(page, { locations: [loc({ id: 1, is_primary: true, label: "החנות" }), loc({ id: 2, kind: "pickup", city: "עכו" })] });
    await openLocations(page);
    await expect(rowsOf(page)).toHaveCount(2);
    await expect(primaryBadges(page)).toHaveCount(1);
    await expect(setPrimaryBtns(page)).toHaveCount(1);
    await expect(editor(page).getByText("החנות", { exact: true })).toBeVisible();
    await expect(editor(page).getByText("נקודת איסוף · עכו")).toBeVisible();
    await expect(addBtn(page)).toHaveText("הוסיפו מיקום");
  });

  // MT:MEH-1421:2 — kind + city + label → POST → the new row appears.
  test("adding a pickup point in another town posts it and lists it", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, { writes });
    await openLocations(page);
    await startAdding(page, "עכו");
    await form(page).getByTestId("location-kind").selectOption("pickup");
    await openDetails(page);
    await labelInput(page).fill("הדוכן בשוק");
    await saveBtn(page).click();

    await expect(form(page)).toHaveCount(0);
    await expect(rowsOf(page)).toHaveCount(2);
    await expect(editor(page).getByText("הדוכן בשוק", { exact: true })).toBeVisible();
    const post = writes.find((w) => w.method === "POST");
    expect(post, "the POST never left the browser").toBeTruthy();
    expect(post!.body).toMatchObject({ kind: "pickup", city: "עכו", label: "הדוכן בשוק" });
  });

  // MT:MEH-1421:3 — exactly one primary after «קבעו כראשי».
  test("«קבעו כראשי» moves the single badge to the chosen row", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, { locations: [loc({ id: 1, is_primary: true, label: "החנות" }), loc({ id: 2, kind: "pickup", city: "עכו", label: "הדוכן" })], writes });
    await openLocations(page);
    await setPrimaryBtns(page).click();
    await expect(primaryBadges(page)).toHaveCount(1);
    await expect(setPrimaryBtns(page)).toHaveCount(1);
    // The badge now sits on the row that was clicked, and the PUT said so.
    const put = writes.find((w) => w.method === "PUT" && w.url.endsWith("/locations/2"));
    expect(put?.body).toEqual({ is_primary: true });
    const rows = editor(page).getByRole("listitem");
    await expect(rows.filter({ hasText: "הדוכן" }).getByText("ראשי", { exact: true })).toBeVisible();
    await expect(rows.filter({ hasText: "החנות" }).getByText("ראשי", { exact: true })).toHaveCount(0);
  });
});

test.describe("locations editor — the same-town label rule", () => {
  // MT:MEH-1421:4 · MT:MEH-1421:5 (a) — the existing location has a label: it is named.
  test("a second location in the same town without a label is refused, naming the existing label", async ({ page }) => {
    await stubEdit(page, { postFails: sameCity({ city: "חיפה", existing_count: 1, existing_label: "החנות", existing_kind: "branch" }) });
    await openLocations(page);
    await startAdding(page, "חיפה");
    await saveBtn(page).click();
    await expect(formError(page)).toHaveText(`יש לך כבר 'החנות' בחיפה. ${ACTION}`);
  });

  // MT:MEH-1421:5 (b) — no label on the existing one: its kind stands in.
  test("…or naming the existing location by its kind when it has no label", async ({ page }) => {
    await stubEdit(page, { locations: [loc({ id: 1, is_primary: true })], postFails: sameCity({ city: "חיפה", existing_count: 1, existing_label: null, existing_kind: "branch" }) });
    await openLocations(page);
    await startAdding(page, "חיפה");
    await saveBtn(page).click();
    await expect(formError(page)).toHaveText(`יש לך כבר סניף בחיפה. ${ACTION}`);
  });

  // MT:MEH-1421:5 (c) — several already there: a count, no invented examples.
  test("…or counting them when there are several", async ({ page }) => {
    await stubEdit(page, { postFails: sameCity({ city: "חיפה", existing_count: 2 }) });
    await openLocations(page);
    await startAdding(page, "חיפה");
    await saveBtn(page).click();
    await expect(formError(page)).toHaveText(`יש לך כבר 2 מיקומים בחיפה. ${ACTION}`);
  });

  // MT:MEH-1421:6 — the three-letter floor is part of the first message, not a later surprise.
  test("the three-letter floor is stated in the first message", async ({ page }) => {
    await stubEdit(page, { postFails: sameCity({ city: "חיפה", existing_count: 1, existing_label: "החנות" }) });
    await openLocations(page);
    await startAdding(page, "חיפה");
    await saveBtn(page).click();
    await expect(formError(page)).toContainText("לפחות שלוש אותיות");
  });

  // MT:MEH-1421:7 · MT:MEH-1421:8 — the message is IN the form, under the label field, and it persists until she types.
  test("the message renders inside the form, survives waiting, and clears on typing in «תווית»", async ({ page }) => {
    await stubEdit(page, { postFails: sameCity({ city: "חיפה", existing_count: 1, existing_label: "החנות" }) });
    await openLocations(page);
    await startAdding(page, "חיפה");
    await saveBtn(page).click();
    await expect(formError(page)).toBeVisible();
    await expect(form(page).getByTestId("location-form-error"), "the error must be a descendant of the form").toHaveCount(1);
    await expect(formError(page)).toHaveAttribute("role", "alert");

    // Inverted bounded wait: nothing may make it disappear on its own.
    const vanished = await expect(formError(page)).toBeHidden({ timeout: 3_000 }).then(() => true).catch(() => false);
    expect(vanished, "the message must not clear itself").toBe(false);

    await openDetails(page);
    await labelInput(page).fill("ה");
    await expect(formError(page)).toHaveCount(0);
  });

  // MT:MEH-1421:9 — a row-level failure has no open form, so it stays a toast.
  test("a failed delete is a toast, not an in-form message", async ({ page }) => {
    await stubEdit(page, { locations: [loc({ id: 1, is_primary: true, label: "החנות" }), loc({ id: 2, kind: "pickup", city: "עכו", label: "הדוכן" })], deleteFails: { status: 500, detail: null } });
    await openLocations(page);
    await rowsOf(page).nth(1).click();
    await expect(page.getByText("שגיאה במחיקת המיקום")).toBeVisible();
    await expect(formError(page)).toHaveCount(0);
    await expect(rowsOf(page), "the row must survive a failed delete").toHaveCount(2);
  });

  // MT:MEH-1421:10 — drift D1: the latitude check is client-side and renders in the form; nothing is sent.
  test("a latitude of 200 is refused in the form and never sent", async ({ page }) => {
    const writes: Rec[] = [];
    await stubEdit(page, { writes });
    await openLocations(page);
    await startAdding(page, "עכו");
    await page.getByTestId("location-coords-toggle").click();
    await page.getByTestId("location-lat").fill("200");
    await page.getByTestId("location-lng").fill("34.5");
    await saveBtn(page).click();
    await expect(formError(page)).toHaveText("קו רוחב לא תקין");
    expect(writes.filter((w) => w.method === "POST").length, "an invalid latitude must not reach the wire").toBe(0);
  });
});
