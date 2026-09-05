import { test, expect, type Page } from "../_cloudinary-stub";
import type { Locator, Route } from "@playwright/test";

/**
 * Spec:     manual/admin-producer-form-licence — MEH-1249 chunk 12f
 * Purpose:  Convert the CONVERT-verdict rows of the licence card's REGISTRATION
 *           and ADMIN-FORM sub-sections, plus the admin ProducerForm's
 *           business-type section and the queue's completeness dot:
 *             MT:MEH-530:1-6, :61, :62   /register/producer CATEGORY frame —
 *                                        the licence field's required/optional
 *                                        branching (the UI half of each row)
 *             MT:MEH-530:7, :8           /admin/producers/new + /[id]/edit —
 *                                        the same field on the admin form
 *             MT:MEH-213:1-9             admin ProducerForm «סוג העסק» +
 *                                        CitiesAutocomplete
 *             MT:MEH-213:19, :20         the queue's completeness dot for
 *                                        delivery-only businesses
 * Touches:  NO backend. `GET /categories` and `GET /cities` are answered from
 *           fixtures; `POST /admin/producers` and the edit-page read are
 *           captured and answered with the status a test asks for; the queue
 *           list is the 12a/12d inventory. Session via addInitScript. Default
 *           CI target, no DEMO_* fixture, no storageState.
 * Does NOT: register an account or create a business. Every row whose
 *           «תוצאה מצופה» is a 200/201 from a real submit is converted as the
 *           REQUEST that leaves the browser (its body, its shape), never as the
 *           server's answer — that half is backend tests, and a real write is a
 *           write against the RAILWAY STAGING backend the storageState specs
 *           share (.github/workflows/e2e.yml:229-233), forbidden 13/07.
 * Related:  app/[locale]/register/producer/RegisterProducerClient.jsx:1583-1735 ·
 *           components/admin/ProducerForm.jsx (ProducerLicenseField :56, «סוג
 *           העסק» :868-960, submit :1120-1128) · components/CitiesAutocomplete.jsx ·
 *           lib/license-required-categories.js · lib/producer-completeness.js ·
 *           manual/register-producer.spec.ts (chunk 9 — the frame walk this
 *           file reuses) · flows/18-producer-register-wizard (the licence GATE) ·
 *           manual/admin-settings-licence-actions.spec.ts (12c — licence expiry).
 * History:  MEH-1249 chunk 12f.
 *
 * ─── The route interception, against the MEH-1968 three conditions ────────
 *
 *   1. No backend BEHAVIOUR is asserted — not that the 422 fires for a missing
 *      licence (that is ensure_license_for_categories, backend tests), not that
 *      the row lands in the DB. Every test asks what the form renders for a
 *      given catalogue, which body leaves the browser, and where the page goes
 *      when the server answers.
 *   2. The contracts are pinned: CategoryOut (schemas.py:1125), the /cities
 *      list of strings (routers/cities.py:47), ProducerAdminOut for the edit
 *      read (admin/producers/[id]/edit/page.js:36-42), LICENSE_REQUIRED_ERROR_HE
 *      (services/license_validation.py:27) for the 422 detail.
 *   3. The unmocked alternative creates businesses on shared staging and burns
 *      the register limiter on the runner IP (e2e/CLAUDE.md).
 *
 * The 404 catch-all on /api/* (chunk 12e) is kept: a read this inventory
 * missed is named by the control test instead of 401-bouncing the page.
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 *
 * D1 · MT:MEH-530:2 says an empty licence on a required category is caught by
 *      "a red error … (422 from the backend)". Since card 952 the CATEGORY→STORY
 *      advance is gated CLIENT-side (RegisterProducerClient.jsx:1721-1730) — the
 *      alert renders and NO request leaves. Asserted as measured; the 422 is
 *      still the backend's (row :7 covers the admin form's 422 path).
 * D2 · MT:MEH-530:3 names the toggle «יש לי רישיון יצרן ↓» and the category
 *      «ירקות ופירות». The live toggle reads «יש לי רישיון יצרן (אם רלוונטי) ↓»
 *      (`actions.add_license`) and the category is «פירות וירקות». The admin
 *      form's toggle DOES read «יש לי רישיון יצרן ↓» — two surfaces, two strings.
 * D3 · MT:MEH-530:5 calls the format warning "orange". On the register form it
 *      is `text-fg-muted` (gray, deliberately softer than the red blocking
 *      error — card 952); the admin form's is `text-amber-600`. Both asserted
 *      by text; the register colour is asserted as measured.
 * D4 · MT:MEH-213:4 says ticking «משלוחים לכל הארץ» makes "CitiesAutocomplete
 *      disappear". The DELIVERY-CITIES one does; card 1255 then renders a second
 *      one under «חוץ מ:» for the exclusion list. Asserted as measured: the
 *      «ערים שמשלוחים אליהן» block is gone, the «חוץ מ:» block is present.
 * D5 · MT:MEH-213:5 quotes the error as «יש לבחור לפחות עיר אחת». The live copy
 *      is «יש לבחור לפחות עיר אחת או לסמן משלוחים לכל הארץ» — asserted whole.
 *
 * ─── Rows this chunk does NOT convert ──────────────────────────────────────
 *
 * 530:9, :10, :58, :59 read API shapes in DevTools — backend tests. 530:56 is
 * the WhatsApp template (backend); :57 is unreachable in the card-2209 modal
 * (12d D4). 530:60 is a real-device row. 213:10-18 (ProducerDetail, ProducerCard,
 * /map) sit in an admin-mapped section but are PUBLIC surfaces — flagged for
 * the docs backfill as a re-homing candidate, not converted here. 213:21-23 are
 * the /cities endpoint (backend tests).
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const ADMIN = { id: 1, email: "admin@example.com", name: "מנהלת", role: "admin" };

/** The catalogue. Slugs matter: CategorySelector's POPULAR grid is keyed by
 *  slug (bread / meat / oil / veg render without a search; honey does not). */
const CATEGORIES = [
  { id: 1, name: "לחמים ואפייה", slug: "bread" },
  { id: 2, name: "פירות וירקות", slug: "veg" },
  { id: 3, name: "בשר", slug: "meat" },
  { id: 4, name: "דבש", slug: "honey" },
  { id: 5, name: "שמנים", slug: "oil" },
];
const CITIES = ["תל אביב-יפו", "תל מונד", "תל שבע", "חיפה", "ירושלים"];
const LICENCE_422 = "מספר רישיון יצרן חובה לקטגוריה זו"; // services/license_validation.py:27

type Row = Record<string, unknown> & { id: number; name: string; status: string };
function row(over: Partial<Row> = {}): Row {
  return {
    id: 501,
    name: "עסק לבדיקה",
    city: "חיפה",
    status: "approved",
    slug: "esek",
    ambassador: false,
    business_days_waiting: 0,
    submitted_for_review_at: "2026-09-01T08:00:00Z",
    created_at: "2026-08-30T08:00:00Z",
    images: ["https://res.cloudinary.com/demo/image/upload/v1/a.jpg"],
    categories: [{ id: 2, name: "פירות וירקות" }],
    phone: "050-1234567",
    has_physical_location: false,
    offers_delivery: true,
    delivery_nationwide: true,
    delivery_areas: [],
    locations: [],
    opening_hours: "א-ה 9:00-17:00",
    short_description: "משלוחים עד הבית",
    description: "ירקות טריים מהשדה.",
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

/** ProducerAdminOut-shaped read for the edit page (card 2072 moved it off the public shape). */
const EDIT_PRODUCER = {
  ...row({ id: 77, name: "מאפיית שקד", slug: "shaked", categories: [{ id: 1, name: "לחמים ואפייה" }], has_physical_location: true, offers_delivery: false, delivery_nationwide: false }),
  producer_license_number: "1234567",
  license_expires_at: null,
  address: "הרצל 1",
  contact_name: "שקד",
  website: null,
  whatsapp_group: null,
  primary_contact_method: "whatsapp",
  contact_email: null,
  facebook: null,
  external_order_form: null,
  lat: 32.8,
  lng: 34.99,
  google_place_id: null,
  top_product_name: null,
  price_range: null,
  established_year: null,
  has_delivery: false,
  pickup_points: false,
  kosher: "",
  grass_fed: false,
  organic_certified: false,
  vegan_scope: "unknown",
  vegetarian_scope: "unknown",
  gluten_free_facility: "unknown",
  is_recommended: false,
  admin_notes: "",
  delivery_excluded_cities: [],
  availability_state: "active",
  vacation_until: null,
};

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
  /** What POST /admin/producers answers: 201 with an id, or 422 with the licence detail. */
  postStatus?: 201 | 422;
  rows?: Row[];
  writes?: Rec[];
  /** Every GET /cities, with its q. */
  cityCalls?: string[];
};
type Stub = { unstubbed: string[] };

/** Public reads shared by the register wizard and the admin form. */
async function stubPublic(page: Page, cityCalls?: string[]): Promise<Stub> {
  const unstubbed: string[] = [];
  await page.route((u) => /\/api\//.test(u.pathname), (r) => {
    unstubbed.push(`${r.request().method()} ${new URL(r.request().url()).pathname}`);
    return json(r, { detail: "unstubbed" }, 404);
  });
  await page.route("**/categories", (r) => json(r, CATEGORIES));
  await page.route("**/experiences/count", (r) => json(r, { count: 0 }));
  await page.route((u) => /\/api\/cities\/?$/.test(u.pathname), (r) => {
    const q = new URL(r.request().url()).searchParams.get("q") ?? "";
    cityCalls?.push(q);
    return json(r, CITIES.filter((c) => c.startsWith(q)));
  });
  // The wizard's ACCOUNT frame checks password strength on every keystroke past
  // 12 characters — incidental, and a real call otherwise (flows/29 does the same).
  await page.route("**/auth/check-password", (r) => json(r, { score: 4, feedback: [] }));
  return { unstubbed };
}

/** Admin session + the reads the admin layout, the form, the /admin landing and the queue make. */
async function stubAdmin(page: Page, opts: StubOpts = {}): Promise<Stub> {
  const { postStatus = 201, rows = [], writes, cityCalls } = opts;
  const stub = await stubPublic(page, cityCalls);
  await page.addInitScript(() => {
    localStorage.setItem("token", "e2e-token");
    localStorage.setItem("cookieConsent", "essential");
  });
  await page.route("**/auth/me", (r) => json(r, ADMIN));
  await page.route("**/users/me/favorites", (r) => json(r, []));
  await page.route("**/admin/dashboard", (r) =>
    json(r, {
      stats: { total_producers: rows.length, pending_producers: 0, total_users: 3, total_group_buys: 0, pending_moderation_count: 0, pending_kashrut_requests: 0 },
      recent_activity: [],
      monthly_producers: [],
    }),
  );
  // The queue (where a successful save lands) — the 12a inventory.
  await page.route("**/admin/checklist-items", (r) => json(r, []));
  await page.route("**/admin/producers/rejection-presets", (r) => json(r, []));
  await page.route("**/admin/producers/*/review-checks", (r) => json(r, { checks: [] }));
  await page.route((u) => /\/api\/admin\/producers\/?$/.test(u.pathname), (r) => {
    if (r.request().method() === "POST") {
      rec(r, writes);
      return postStatus === 201 ? json(r, { ...row({ id: 900 }), id: 900 }, 201) : json(r, { detail: LICENCE_422 }, 422);
    }
    return json(r, rows);
  });
  await page.route((u) => /\/api\/admin\/producers\/77$/.test(u.pathname), (r) => json(r, EDIT_PRODUCER));
  return stub;
}

// ── register wizard walk (reused from manual/register-producer.spec.ts) ────

async function gotoCategoryFrame(page: Page): Promise<void> {
  await page.goto("/register/producer");
  await expect(page.getByTestId("register-preflight")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("register-preflight-start").click();
  await expect(page.getByTestId("register-frame-account")).toBeVisible();
  await page.getByTestId("register-account-name").fill("טסט בדיקה");
  await page.getByTestId("register-account-email").fill(`c12f+${Date.now()}@example.com`);
  await page.getByTestId("register-account-password").fill("Abcdefgh1234");
  await page.getByTestId("register-account-next").click();
  await expect(page.getByTestId("register-frame-details")).toBeVisible();
  await page.getByTestId("register-details-name").fill("העסק שלי");
  await page.getByTestId("register-details-phone").fill("0501234567");
  const city = page.getByTestId("register-details-city");
  await city.getByRole("combobox").fill("תל א");
  await city.getByRole("option").first().click();
  await page.getByTestId("register-details-next").click();
  await expect(page.getByTestId("register-frame-category")).toBeVisible();
}

/** Pick a chip by its catalogue name; non-popular ones are reached through the search box. */
async function pickCategory(page: Page, name: string): Promise<void> {
  const cat = CATEGORIES.find((c) => c.name === name);
  if (!cat) throw new Error(`pickCategory(): «${name}» is not in the CATEGORIES fixture`);
  const chip = page.getByTestId(`category-chip-${cat.id}`);
  if ((await chip.count()) === 0) await page.getByTestId("category-search").fill(name);
  await chip.click();
}

const licenceField = (page: Page) => page.getByTestId("register-category-license");
/** The licence <input> by its <label> («מספר רישיון יצרן», with «(חובה)» appended when required) — register's optional field and the admin form's alike. */
const licenceInput = (page: Page) => page.getByLabel(/^מספר רישיון יצרן/);
const optionalToggle = (page: Page) => page.getByRole("button", { name: "יש לי רישיון יצרן (אם רלוונטי) ↓" });
const nextBtn = (page: Page) => page.getByTestId("register-category-next");

// ── MT:MEH-530:1-6, :61, :62 — /register/producer CATEGORY frame ───────────

test.describe("/register/producer — the licence field on CATEGORY", () => {
  test("control: every read the wizard makes up to CATEGORY is stubbed", async ({ page }) => {
    const stub = await stubPublic(page);
    await gotoCategoryFrame(page);
    await expect(page.getByTestId("category-chip-1")).toBeVisible();
    expect(stub.unstubbed, "an /api/* read reached the 404 catch-all — a stub is missing").toEqual([]);
  });

  // MT:MEH-530:1 — a licence-required category → the field appears at once, «(חובה)», with the Ministry hint.
  test("«לחמים ואפייה» reveals «מספר רישיון יצרן (חובה)» with the Ministry-of-Health hint", async ({ page }) => {
    await stubPublic(page);
    await gotoCategoryFrame(page);
    await expect(licenceField(page)).toHaveCount(0);
    await pickCategory(page, "לחמים ואפייה");
    await expect(licenceField(page)).toBeVisible();
    await expect(page.getByText("מספר רישיון יצרן (חובה)")).toBeVisible();
    await expect(page.getByText("ייצור מזון בקטגוריה זו דורש רישיון יצרן ממשרד הבריאות")).toBeVisible();
    await expect(optionalToggle(page), "no optional toggle on the required path").toHaveCount(0);
    await licenceField(page).fill("1234567");
    await nextBtn(page).click();
    await expect(page.getByTestId("register-frame-story"), "a filled licence advances").toBeVisible();
  });

  // MT:MEH-530:2 — empty licence on a required category: blocked with the red error. D1: client gate, no request.
  test("an empty licence on «לחמים ואפייה» blocks «הבא» with «מספר רישיון יצרן חובה לקטגוריה זו»", async ({ page }) => {
    const stub = await stubPublic(page);
    await gotoCategoryFrame(page);
    await pickCategory(page, "לחמים ואפייה");
    await nextBtn(page).click();
    const alert = page.getByRole("alert").filter({ hasText: LICENCE_422 });
    await expect(alert).toBeVisible();
    await expect(alert).toHaveClass(/text-red-500/);
    await expect(page.getByTestId("register-frame-category"), "still on CATEGORY").toBeVisible();
    await expect(licenceField(page)).toBeFocused();
    expect(stub.unstubbed.filter((u) => u.startsWith("POST")), "nothing was posted — the gate is client-side").toEqual([]);
    // Typing clears the blocking error (card 952).
    await licenceField(page).fill("1");
    await expect(page.getByRole("alert").filter({ hasText: LICENCE_422 })).toHaveCount(0);
  });

  // MT:MEH-530:3 — a licence-free category: no field, a toggle; opened, the optional field; empty still advances.
  test("«פירות וירקות» alone shows the optional toggle; opened, the field is not «(חובה)» and empty still advances", async ({ page }) => {
    await stubPublic(page);
    await gotoCategoryFrame(page);
    await pickCategory(page, "פירות וירקות");
    await expect(licenceField(page)).toHaveCount(0);
    await expect(page.getByText("מספר רישיון יצרן (חובה)")).toHaveCount(0);
    await optionalToggle(page).click();
    const optional = licenceInput(page);
    await expect(optional).toBeVisible();
    await expect(page.getByText("מספר רישיון יצרן", { exact: true })).toBeVisible();
    await expect(page.getByText("מספר רישיון יצרן (חובה)")).toHaveCount(0);
    await nextBtn(page).click();
    await expect(page.getByTestId("register-frame-story")).toBeVisible();
  });

  // MT:MEH-530:4 — mixed: a free + a required category → the field turns required automatically.
  test("«פירות וירקות» + «לחמים ואפייה» makes the field required, hint included", async ({ page }) => {
    await stubPublic(page);
    await gotoCategoryFrame(page);
    await pickCategory(page, "פירות וירקות");
    await expect(optionalToggle(page)).toBeVisible();
    await pickCategory(page, "לחמים ואפייה");
    await expect(licenceField(page)).toBeVisible();
    await expect(page.getByText("מספר רישיון יצרן (חובה)")).toBeVisible();
    await expect(page.getByText("ייצור מזון בקטגוריה זו דורש רישיון יצרן ממשרד הבריאות")).toBeVisible();
    await expect(optionalToggle(page)).toHaveCount(0);
  });

  // MT:MEH-530:5 — «abc» → the inline format warning; «הבא» still advances; a valid number clears it. D3: gray, not orange.
  test("«abc» shows the 7-10-digits warning without blocking; «1234567» shows none", async ({ page }) => {
    await stubPublic(page);
    await gotoCategoryFrame(page);
    await pickCategory(page, "לחמים ואפייה");
    await licenceField(page).fill("abc");
    const warning = page.getByText("מספר רישיון יצרן הוא 7-10 ספרות");
    await expect(warning).toBeVisible();
    await expect(warning, "D3 — the register warning is muted, not the blocking red").toHaveClass(/text-fg-muted/);
    // Scoped: the page carries an unrelated role="alert" (the chat widget) — the 12c lesson.
    await expect(page.getByRole("alert").filter({ hasText: LICENCE_422 })).toHaveCount(0);
    await nextBtn(page).click();
    await expect(page.getByTestId("register-frame-story"), "the warning does not block the advance").toBeVisible();
    await page.getByTestId("register-story-back").click();
    await expect(page.getByTestId("register-frame-category")).toBeVisible();
    await licenceField(page).fill("1234567");
    await expect(page.getByText("מספר רישיון יצרן הוא 7-10 ספרות")).toHaveCount(0);
  });

  // MT:MEH-530:6 — maxLength 20: a 21-digit paste is cut to 20.
  test("the field caps at 20 characters", async ({ page }) => {
    await stubPublic(page);
    await gotoCategoryFrame(page);
    await pickCategory(page, "לחמים ואפייה");
    await expect(licenceField(page)).toHaveAttribute("maxlength", "20");
    await licenceField(page).pressSequentially("123456789012345678901");
    await expect(licenceField(page)).toHaveValue("12345678901234567890");
  });

  // MT:MEH-530:61 — honey is licence-required (card 743).
  test("«דבש» (found through the search) requires the licence", async ({ page }) => {
    await stubPublic(page);
    await gotoCategoryFrame(page);
    await pickCategory(page, "דבש");
    await expect(licenceField(page)).toBeVisible();
    await expect(page.getByText("מספר רישיון יצרן (חובה)")).toBeVisible();
    await nextBtn(page).click();
    await expect(page.getByRole("alert").filter({ hasText: LICENCE_422 })).toBeVisible();
  });

  // MT:MEH-530:62 — oil alone stays optional (card 743 split it from honey).
  test("«שמנים» alone keeps the licence optional and advances empty", async ({ page }) => {
    await stubPublic(page);
    await gotoCategoryFrame(page);
    await pickCategory(page, "שמנים");
    await expect(licenceField(page)).toHaveCount(0);
    await expect(optionalToggle(page)).toBeVisible();
    await nextBtn(page).click();
    await expect(page.getByTestId("register-frame-story")).toBeVisible();
  });
});

// ── admin ProducerForm helpers ─────────────────────────────────────────────

async function openNewProducer(page: Page): Promise<void> {
  await page.goto("/he/admin/producers/new");
  await expect(page.getByRole("heading", { name: "הוסיפו בית עסק חדש" }), "control: the new-producer page never rendered").toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("checkbox", { name: "לחמים ואפייה" })).toBeVisible();
}
const saveBtn = (page: Page) => page.getByRole("button", { name: "צור עסק" });
const typeSection = (page: Page) => page.locator("div").filter({ has: page.getByRole("heading", { name: "סוג העסק" }) }).last();
const physical = (page: Page) => page.getByRole("checkbox", { name: "חנות פיזית (קבלת לקוחות)" });
const delivery = (page: Page) => page.getByRole("checkbox", { name: "משלוחים", exact: true });
const nationwide = (page: Page) => page.getByRole("checkbox", { name: "משלוחים לכל הארץ" });
/** The delivery-cities block (not the nationwide exclusion block, which has its own combobox). */
const citiesBlock = (page: Page) => typeSection(page).locator("div").filter({ has: page.getByText("ערים שמשלוחים אליהן") }).last();
const cityInput = (page: Page) => citiesBlock(page).getByRole("combobox");
const chip = (page: Page, city: string) => citiesBlock(page).getByRole("button", { name: `הסר ${city}` });
/**
 * Remove a city chip by keyboard. On the CI mobile runner a pointer click on the
 * 12px × was intercepted for 20 s by the chip wrapper / the chip itself (measured
 * 05/09/2026, not reproduced locally) — geometry the row does not claim anything
 * about. Focus + Enter activates the same native <button>, and the chip's absence
 * is asserted afterwards, so a swallowed activation still fails.
 */
async function removeChip(page: Page, city: string): Promise<void> {
  const btn = chip(page, city);
  await btn.focus();
  await btn.press("Enter");
  await expect(btn).toHaveCount(0);
}

/**
 * Toggle a form checkbox by keyboard. On the CI mobile runner a pointer
 * `check()`/`uncheck()` on these 16px inputs was intercepted for 20 s by a
 * sibling <label> / the Section card (measured on this spec's first CI run,
 * 05/09/2026 — not reproduced locally) — geometry the row does not claim anything about. Focus
 * + Space toggles the same native input regardless of what paints over it,
 * and the state is asserted afterwards, so a swallowed toggle still fails.
 */
async function setChecked(cb: Locator, on: boolean): Promise<void> {
  await cb.scrollIntoViewIfNeeded();
  if ((await cb.isChecked()) !== on) await cb.press("Space");
  await expect(cb).toBeChecked({ checked: on });
}

async function deliveryOnly(page: Page): Promise<void> {
  await setChecked(physical(page), false);
  await setChecked(delivery(page), true);
  await expect(nationwide(page)).toBeVisible();
}

// ── MT:MEH-530:7, :8 — the admin form's licence field ──────────────────────

test.describe("/admin/producers — the licence field on the admin form", () => {
  test("control: every read the new-producer page makes is stubbed", async ({ page }) => {
    const stub = await stubAdmin(page);
    await openNewProducer(page);
    expect(stub.unstubbed, "an /api/* read reached the 404 catch-all — a stub is missing").toEqual([]);
  });

  // MT:MEH-530:7 — «בשר» → the field inline with «(חובה)»; an empty save is a 422 the toast shows; a filled one posts the number.
  test("«בשר» reveals the required licence field; the 422 for an empty one reaches the toast", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes, postStatus: 422 });
    await openNewProducer(page);
    await expect(page.getByRole("button", { name: "יש לי רישיון יצרן ↓" })).toBeVisible();
    await setChecked(page.getByRole("checkbox", { name: "בשר" }), true);
    const field = licenceInput(page);
    await expect(field).toBeVisible();
    await expect(page.getByText("מספר רישיון יצרן (חובה)")).toBeVisible();
    await expect(page.getByText("ייצור מזון בקטגוריה זו דורש רישיון יצרן ממשרד הבריאות")).toBeVisible();
    await expect(page.getByRole("button", { name: "יש לי רישיון יצרן ↓" })).toHaveCount(0);
    await page.getByLabel("שם העסק").fill("קצביית הכפר");
    await saveBtn(page).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].url).toBe("/admin/producers");
    expect((writes[0].body as { producer_license_number: string; category_ids: number[] }).producer_license_number).toBe("");
    expect((writes[0].body as { category_ids: number[] }).category_ids).toEqual([3]);
    await expect(page.getByRole("status").getByText(LICENCE_422)).toBeVisible();
    await expect(page, "a 422 keeps the admin on the form").toHaveURL(/\/admin\/producers\/new/);
  });

  test("a filled licence on «דגים»-class categories posts the number and lands on the queue", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes, postStatus: 201 });
    await openNewProducer(page);
    await setChecked(page.getByRole("checkbox", { name: "בשר" }), true);
    await licenceInput(page).fill("abc");
    await expect(page.getByText("מספר רישיון יצרן הוא 7-10 ספרות")).toHaveClass(/text-amber-600/);
    await licenceInput(page).fill("1234567");
    await expect(page.getByText("מספר רישיון יצרן הוא 7-10 ספרות")).toHaveCount(0);
    await page.getByLabel("שם העסק").fill("קצביית הכפר");
    await saveBtn(page).click();
    await expect.poll(() => writes.length).toBe(1);
    expect((writes[0].body as { producer_license_number: string }).producer_license_number).toBe("1234567");
    await expect(page).toHaveURL(/\/admin(\?|$)/);
  });

  // MT:MEH-530:8 — editing a producer that has a licence: the field is open with the value, no toggle.
  test("the edit page opens the licence field with the stored number — no toggle", async ({ page }) => {
    await stubAdmin(page);
    await page.goto("/he/admin/producers/77/edit");
    await expect(page.getByRole("heading", { name: "עריכה: מאפיית שקד" })).toBeVisible({ timeout: 15_000 });
    await expect(licenceInput(page)).toHaveValue("1234567");
    await expect(page.getByRole("button", { name: "יש לי רישיון יצרן ↓" })).toHaveCount(0);
    // «לחמים ואפייה» is licence-required, so the label carries the suffix too.
    await expect(page.getByText("מספר רישיון יצרן (חובה)")).toBeVisible();
    await expect(page.getByRole("button", { name: "שמרו שינויים" })).toBeEnabled();
  });
});

// ── MT:MEH-213:1-9 — «סוג העסק» + CitiesAutocomplete ──────────────────────

test.describe("/admin/producers/new — «סוג העסק»", () => {
  // MT:MEH-213:1 — defaults: physical checked, delivery unchecked, save enabled.
  test("defaults: «חנות פיזית» checked, «משלוחים» unchecked, «צור עסק» enabled", async ({ page }) => {
    await stubAdmin(page);
    await openNewProducer(page);
    await expect(typeSection(page).getByRole("checkbox")).toHaveCount(2);
    await expect(physical(page)).toBeChecked();
    await expect(delivery(page)).not.toBeChecked();
    await expect(saveBtn(page)).toBeEnabled();
    await expect(nationwide(page)).toHaveCount(0);
  });

  // MT:MEH-213:2 — neither → inline error, save disabled.
  test("unticking both shows «חייב לסמן לפחות אחד מהשניים» and disables save", async ({ page }) => {
    await stubAdmin(page);
    await openNewProducer(page);
    await setChecked(physical(page), false);
    const err = page.getByText("חייב לסמן לפחות אחד מהשניים");
    await expect(err).toBeVisible();
    await expect(err).toHaveClass(/text-red-600/);
    await expect(saveBtn(page)).toBeDisabled();
    await setChecked(physical(page), true);
    await expect(err).toHaveCount(0);
    await expect(saveBtn(page)).toBeEnabled();
  });

  // MT:MEH-213:3 — delivery only → the cascading block: nationwide checkbox + the cities combobox.
  test("delivery only reveals «משלוחים לכל הארץ» and the cities combobox", async ({ page }) => {
    await stubAdmin(page);
    await openNewProducer(page);
    await deliveryOnly(page);
    await expect(nationwide(page)).not.toBeChecked();
    await expect(page.getByText("ערים שמשלוחים אליהן")).toBeVisible();
    await expect(cityInput(page)).toBeVisible();
    await expect(cityInput(page)).toHaveAttribute("placeholder", "הקלידו שם עיר...");
  });

  // MT:MEH-213:4 — nationwide → the delivery-cities autocomplete is gone; save enabled. D4: the exclusion block appears.
  test("ticking nationwide removes the delivery-cities combobox, enables save — and shows the «חוץ מ:» exclusion list (D4)", async ({ page }) => {
    await stubAdmin(page);
    await openNewProducer(page);
    await deliveryOnly(page);
    await expect(saveBtn(page), "no cities yet — disabled").toBeDisabled();
    await setChecked(nationwide(page), true);
    await expect(page.getByText("ערים שמשלוחים אליהן")).toHaveCount(0);
    await expect(saveBtn(page)).toBeEnabled();
    await expect(page.getByText("חוץ מ:")).toBeVisible();
    await expect(page.getByText("אופציונלי — ערים שלא משלחים אליהן")).toBeVisible();
    await expect(typeSection(page).getByRole("combobox"), "exactly one combobox — the exclusion one").toHaveCount(1);
  });

  // MT:MEH-213:5 — unticking nationwide with no cities → inline error, save disabled. D5: the full copy.
  test("unticking nationwide with no cities shows the at-least-one-city error and disables save", async ({ page }) => {
    await stubAdmin(page);
    await openNewProducer(page);
    await deliveryOnly(page);
    await setChecked(nationwide(page), true);
    await setChecked(nationwide(page), false);
    const err = page.getByText("יש לבחור לפחות עיר אחת או לסמן משלוחים לכל הארץ");
    await expect(err).toBeVisible();
    await expect(err).toHaveClass(/text-red-600/);
    await expect(saveBtn(page)).toBeDisabled();
  });

  // MT:MEH-213:6 + :7 — type «תל» → the dropdown; pick one → a chip; × removes it.
  test("typing «תל» lists the matching cities, a pick becomes a chip, and × removes it", async ({ page }) => {
    const cityCalls: string[] = [];
    await stubAdmin(page, { cityCalls });
    await openNewProducer(page);
    await deliveryOnly(page);
    await cityInput(page).fill("תל");
    const listbox = citiesBlock(page).getByRole("listbox");
    await expect(listbox).toBeVisible();
    await expect(listbox.getByRole("option")).toHaveText(["תל אביב-יפו", "תל מונד", "תל שבע"]);
    expect(cityCalls.at(-1), "the query reached GET /cities").toBe("תל");
    await listbox.getByRole("option", { name: "תל אביב-יפו" }).click();
    await expect(chip(page, "תל אביב-יפו")).toBeVisible();
    await expect(citiesBlock(page).getByText("תל אביב-יפו")).toBeVisible();
    await expect(listbox).toHaveCount(0);
    await expect(cityInput(page)).toHaveValue("");
    await expect(page.getByText("יש לבחור לפחות עיר אחת או לסמן משלוחים לכל הארץ")).toHaveCount(0);
    await expect(saveBtn(page)).toBeEnabled();
    // MT:MEH-213:7
    await removeChip(page, "תל אביב-יפו");
    await expect(page.getByText("יש לבחור לפחות עיר אחת או לסמן משלוחים לכל הארץ")).toBeVisible();
  });

  // MT:MEH-213:8 — keyboard: arrows move, Enter adds, Backspace on an empty input removes the last chip.
  test("keyboard: ArrowDown/Up highlight, Enter adds, Backspace removes the last chip", async ({ page }) => {
    await stubAdmin(page);
    await openNewProducer(page);
    await deliveryOnly(page);
    const input = cityInput(page);
    await input.fill("תל");
    const options = citiesBlock(page).getByRole("option");
    await expect(options).toHaveCount(3);
    await input.press("ArrowDown");
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
    await input.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "false");
    await input.press("ArrowUp");
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(chip(page, "תל מונד")).toBeVisible();
    await input.fill("חי");
    await expect(options, "the debounced fetch must land before the arrow moves").toHaveCount(1);
    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(chip(page, "חיפה")).toBeVisible();
    await expect(citiesBlock(page).getByRole("button", { name: /^הסר / })).toHaveText(["×", "×"]);
    await expect(input).toHaveValue("");
    await input.press("Backspace");
    await expect(chip(page, "חיפה")).toHaveCount(0);
    await expect(chip(page, "תל מונד")).toBeVisible();
  });

  // MT:MEH-213:9 — save a delivery-only, nationwide business: the body on the wire. ("Confirm in DB" is the backend's.)
  test("saving a delivery-only nationwide business posts the three location flags and no cities", async ({ page }) => {
    const writes: Rec[] = [];
    await stubAdmin(page, { writes, postStatus: 201 });
    await openNewProducer(page);
    await page.getByLabel("שם העסק").fill("משלוחי הגליל");
    await setChecked(page.getByRole("checkbox", { name: "פירות וירקות" }), true);
    await deliveryOnly(page);
    await setChecked(nationwide(page), true);
    await saveBtn(page).click();
    await expect.poll(() => writes.length).toBe(1);
    const body = writes[0].body as Record<string, unknown>;
    expect(body).toMatchObject({
      has_physical_location: false,
      offers_delivery: true,
      delivery_nationwide: true,
      delivery_area_cities: [],
      delivery_excluded_cities: [],
      category_ids: [2],
    });
    await expect(page).toHaveURL(/\/admin(\?|$)/);
  });
});

// ── MT:MEH-213:19, :20 — the queue's completeness dot ─────────────────────

test.describe("/admin/producers — completeness dot for delivery-only businesses", () => {
  const dot = (rowLoc: Locator, label: string) => rowLoc.getByLabel(label, { exact: true });

  // MT:MEH-213:19 — nationwide + no coordinates → green (coords are not required without a physical location).
  test("delivery-only + nationwide with no coordinates is «שלם»", async ({ page }) => {
    await stubAdmin(page, { rows: [row({ name: "משלוחים ארציים" })] });
    await page.goto("/he/admin/producers");
    const r = page.getByRole("row", { name: /משלוחים ארציים/ });
    await expect(r).toBeVisible({ timeout: 15_000 });
    await expect(dot(r, "שלם")).toBeVisible();
    await expect(dot(r, "שלם")).toHaveAttribute("title", "כל הפרטים מולאו");
    await expect(dot(r, "חסרים פרטים")).toHaveCount(0);
    await expect(dot(r, "חסרים פרטים קריטיים")).toHaveCount(0);
  });

  // MT:MEH-213:20 — delivery-only with neither nationwide nor cities → yellow, «אזורי משלוח» in the tooltip.
  test("delivery-only with no areas is yellow and names «אזורי משלוח»", async ({ page }) => {
    await stubAdmin(page, { rows: [row({ name: "משלוחים בלי אזור", delivery_nationwide: false, delivery_areas: [] }), row({ id: 502, name: "משלוחים ארציים", slug: "arzi" })] });
    await page.goto("/he/admin/producers");
    const r = page.getByRole("row", { name: /משלוחים בלי אזור/ });
    await expect(r).toBeVisible({ timeout: 15_000 });
    const yellow = dot(r, "חסרים פרטים");
    await expect(yellow).toBeVisible();
    await expect(yellow).toHaveAttribute("title", "חסרים פרטים: אזורי משלוח");
    await expect(yellow.locator("svg")).toHaveClass(/text-amber-500/);
    await expect(dot(r, "שלם")).toHaveCount(0);
    // Control on the same page: the nationwide sibling is green.
    await expect(dot(page.getByRole("row", { name: /משלוחים ארציים/ }), "שלם")).toBeVisible();
  });
});
