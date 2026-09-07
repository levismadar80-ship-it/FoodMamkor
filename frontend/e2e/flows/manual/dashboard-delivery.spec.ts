import { test, expect, type Page, type Route } from "../_cloudinary-stub";
import { REGIONS } from "../../../data/regions";

/**
 * Spec:     manual/dashboard-delivery — MEH-1249 chunk 11d of 12
 * Purpose:  Convert the CONVERT-verdict rows of the delivery card
 *           ("משלוחים ואיסוף", anchor #delivery) in the edit tab:
 *             MT:MEH-1255   nationwide + the exclusion list ("חוץ מ:")
 *             MT:MEH-1256   region quick-add chips on the cities field
 *             MT:MEH-1577   structured delivery cost (fee + free-above)
 * Touches:  NO real backend. Reads are route-fulfilled exactly as chunks
 *           11a–11c do (incl. the four child-card reads). `PUT /producers/me`
 *           is CAPTURED and fulfilled — the rows under test are about what the
 *           client sends and renders, and no byte reaches a server.
 *           `GET /cities?q=` is fulfilled with a fixed string array so a typed
 *           city can be committed without the real autocomplete backend.
 * Does NOT: assert persistence after reload, the public DeliveryBlock
 *           rendering (MT:MEH-1577:1-4,6,7 — /producer/[id] page group;
 *           __tests__/DeliveryBlock*.test.jsx pin the strings), the consumer
 *           `?delivery_city=` filter (MT:MEH-1255:5 — backend), the server
 *           422s (MT:MEH-1255:3, MT:MEH-1577:8-9 — backend validators), or
 *           the admin form twins (MT:MEH-1255:6, MT:MEH-1256:5 — /admin).
 * Related:  app/[locale]/producer/dashboard/edit/cards.jsx (DeliveryCard,
 *           :1528) · components/CitiesAutocomplete.jsx · data/regions.js ·
 *           __tests__/EditTabDeliveryCard.test.jsx (the isolation layer this
 *           spec does not repeat: payload shapes, ""↔0↔null mapping)
 * History:  MEH-1249 chunk 11d.
 *
 * ─── MEH-1968 three conditions, stated because the rule requires it ────────
 *   1. No backend BEHAVIOUR is asserted — which controls render for a given
 *      profile, and what the client puts on the wire. A fulfilled PUT proves
 *      the payload, not that anything was saved.
 *   2. /producers/me has a Pydantic response model; PUT /producers/me is the
 *      contract EditTabDeliveryCard.test.jsx already pins field by field;
 *      GET /cities returns a plain string list (CitiesAutocomplete.jsx:58-59).
 *   3. Reaching "nationwide with exclusions" / "14 delivery areas" / "fee 0"
 *      honestly means PUTting to the shared staging backend CI points at —
 *      a destructive write Sapir's 13/07 ruling forbids.
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 * D1 · MT:MEH-1256:4 says a fully-selected region chip is "· נוסף ולא לחיץ".
 *      MEH-1346 made the chip a TOGGLE (CitiesAutocomplete.jsx:98-115): it
 *      renders «<אזור> · ✓ נוסף» with aria-pressed="true" and stays clickable —
 *      clicking removes the region's cities. Asserted as it is today.
 * D2 · MT:MEH-1255:1 quotes the helper as "אופציונלי — ערים שלא משלחים אל…";
 *      the live key is `delivery_excluded_hint` = "אופציונלי — ערים שלא משלחים
 *      אליהן" and the label is "משלוחים לכל הארץ, חוץ מהערים האלה:" — the
 *      doc's "חוץ מ:" is the short form. Asserted against the live strings.
 * D3 · MT:MEH-1256:1 lists the chip row as "הצפון · חיפה והקריות · השרון ·
 *      גוש דן · השפלה · …" — data/regions.js has SEVEN regions; asserted as
 *      the exact ordered list the data file exports, not the doc's prefix.
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const IMG = "https://res.cloudinary.com/demo/image/upload/p.jpg";
const PRIMARY_LOC = { id: 1, kind: "branch", is_primary: true, lat: 32.08, lng: 34.78, opening_hours: "א-ה 09:00-17:00" };

const BASE = {
  id: 7,
  name: "מאפיית שקד",
  city: "חיפה",
  phone: "050-1234567",
  primary_contact_method: "whatsapp",
  whatsapp: "050-1234567",
  phone_verified: true,
  categories: [{ id: 2, name: "לחמים ואפייה" }],
  images: [{ id: 1, url: IMG }],
  products: [{ id: 1, name: "חלה" }],
  short_description: "מאפייה שכונתית",
  description: "מאפייה שכונתית קטנה בלב חיפה",
  locations: [PRIMARY_LOC],
  delivery_fee: null as number | null,
  free_delivery_above: null as number | null,
  delivery_excluded_cities: [] as string[],
};

/** Delivers to one city, not nationwide. */
const DELIVERY_CITIES = {
  ...BASE,
  has_physical_location: true,
  offers_delivery: true,
  delivery_nationwide: false,
  delivery_areas: [{ city: "חיפה", delivery_day: null, delivery_fee: null }],
};
/** Nationwide, one exclusion. */
const NATIONWIDE = {
  ...BASE,
  has_physical_location: false,
  offers_delivery: true,
  delivery_nationwide: true,
  delivery_areas: [],
  delivery_excluded_cities: ["אילת"],
};
/** No delivery at all. */
const PHYSICAL_ONLY = {
  ...BASE,
  has_physical_location: true,
  offers_delivery: false,
  delivery_nationwide: false,
  delivery_areas: [],
};

type EditOpts = {
  profile?: Record<string, unknown>;
  /** what GET /cities answers (a plain string list) */
  cities?: string[];
  /** records every PUT body */
  puts?: Array<Record<string, unknown>>;
};

async function stubEdit(page: Page, opts: EditOpts = {}): Promise<void> {
  const { profile: p = DELIVERY_CITIES, cities = [], puts } = opts;
  const status = "approved";
  await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) =>
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ id: 42, email: "owner@example.com", name: "שקד", role: "producer", producer_id: 7 }) }));
  await page.route("**/favorites**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/cities**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cities) }));
  for (const sub of ["products", "locations", "name-change-requests", "kashrut-requests"]) {
    await page.route(`**/producers/me/${sub}**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  }
  await page.route("**/producers/me/dashboard", (r) =>
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ producer: { id: 7, name: BASE.name, slug: null, status, availability_state: "accepting_orders", vacation_until: null }, stats: {} }) }));
  await page.route("**/producers/me/analytics**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ profile_views: { total: 0, last_7d: 0 }, whatsapp_clicks: { total: 0, last_7d: 0 }, contact_clicks: { total: 0, last_7d: 0 },
        average_rating: null, total_reviews: 0, rank_in_city: null, conversion_rate: "0%", profile_strength: 10, top_cities: [], follower_count: 0, new_followers_this_week: 0 }) }));
  await page.route("**/producers/me", (r: Route) => {
    if (r.request().method() === "PUT") {
      const body = r.request().postDataJSON() as Record<string, unknown>;
      puts?.push(body);
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...p, status, ...body }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...p, status }) });
  });
}

const card = (page: Page) => page.getByTestId("accordion-delivery");
const body = (page: Page) => page.locator('#delivery [role="region"]');
const checkbox = (page: Page, name: string) => body(page).getByRole("checkbox", { name, exact: true });
/** The save button through all three of its labels. `name: "שמירה"` alone is a
 *  SUBSTRING match — it sees «בשמירה…» and is blind to «נשמר», so a probe built
 *  on it reported the button frozen on "saving" while an in-page sampler showed
 *  «נשמר» from 308ms to 3300ms. Exact alternation, so the locator can see every
 *  state it is asked to assert. */
const saveBtn = (page: Page) => body(page).getByRole("button", { name: /^(שמירה|בשמירה…|נשמר)$/ });
/** The seven region quick-add chips — the only aria-pressed buttons in the card. */
const regionChips = (page: Page) => body(page).locator("button[aria-pressed]");
const regionChip = (page: Page, name: RegExp) => regionChips(page).filter({ hasText: name });
/** One remove button per selected city chip, in whichever autocomplete is mounted. */
const cityChips = (page: Page) => body(page).getByRole("button", { name: /^הסר / });
const cityChip = (page: Page, city: string) => body(page).getByRole("button", { name: `הסר ${city}` });
const combobox = (page: Page) => body(page).getByRole("combobox");
const feeInput = (page: Page) => body(page).locator("#delivery-fee");
const freeAboveInput = (page: Page) => body(page).getByLabel("משלוח חינם מעל (₪)");

const EXCLUDED_LABEL = "משלוחים לכל הארץ, חוץ מהערים האלה:";
const CITIES_LABEL = "ערים שמשלוחים אליהן";
const CITIES_REQUIRED = "יש לבחור לפחות עיר אחת או לסמן משלוחים לכל הארץ";

type Region = { key: string; name: string; cities: string[] };
/** A missing key must fail with a readable control message, not a TypeError on `.cities` later. */
function regionByKey(key: string): Region {
  const r = (REGIONS as Region[]).find((x) => x.key === key);
  if (!r) throw new Error(`control: data/regions.js has no region with key "${key}" — the fixture premise is gone`);
  return r;
}
const SHARON = regionByKey("sharon");
const HAIFA_REGION = regionByKey("haifa");

async function openDelivery(page: Page): Promise<void> {
  await page.goto("/producer/dashboard/edit#delivery");
  await expect(card(page), "control: #delivery never came on screen — every assertion here is void").toBeVisible({ timeout: 15_000 });
  await expect(body(page)).toBeVisible();
}

/** Types a city into the mounted autocomplete and commits it from the listbox. */
async function addCityByTyping(page: Page, city: string): Promise<void> {
  await combobox(page).fill(city);
  const option = page.getByRole("option", { name: city });
  await expect(option, `control: the suggestion «${city}» never appeared — is GET /cities stubbed?`).toBeVisible();
  await option.click();
  await expect(cityChip(page, city)).toBeVisible();
}

// ── MT:MEH-1255 — nationwide + exclusions ──────────────────────────────────

test.describe("delivery card — nationwide and the exclusion list", () => {
  // MT:MEH-1255:1 — the exclusion field exists only in nationwide mode.
  test("the exclusion field appears only once «לכל הארץ» is on, and the cities field leaves", async ({ page }) => {
    await stubEdit(page);
    await openDelivery(page);
    await expect(body(page).getByText(CITIES_LABEL, { exact: true })).toBeVisible();
    await expect(body(page).getByText(EXCLUDED_LABEL)).toHaveCount(0);

    await checkbox(page, "משלוחים לכל הארץ").check();
    await expect(body(page).getByText(EXCLUDED_LABEL)).toBeVisible();
    await expect(body(page).getByText("אופציונלי — ערים שלא משלחים אליהן")).toBeVisible();
    await expect(body(page).getByText(CITIES_LABEL, { exact: true })).toHaveCount(0);
  });

  // MT:MEH-1255:2 — the list goes on the wire as delivery_excluded_cities.
  test("adding an excluded city puts it on the wire alongside the existing one", async ({ page }) => {
    const puts: Array<Record<string, unknown>> = [];
    await stubEdit(page, { profile: NATIONWIDE, cities: ["ערד"], puts });
    await openDelivery(page);
    await expect(cityChip(page, "אילת"), "fixture precondition: the seeded exclusion never rendered").toBeVisible();
    await expect(saveBtn(page), "nothing changed yet — save must be disabled").toBeDisabled();

    await addCityByTyping(page, "ערד");
    await saveBtn(page).click();
    await expect.poll(() => puts.length, { message: "the PUT never left the browser" }).toBe(1);
    // The 3-second «נשמר» confirmation (cards.jsx setSaved + setTimeout 3000).
    await expect(saveBtn(page)).toHaveText("נשמר");
    await expect(saveBtn(page), "saved and clean → nothing to save").toBeDisabled();

    expect(puts[0]).toMatchObject({ delivery_nationwide: true, delivery_areas: [] });
    // Set semantics: the client may order the list however it likes; exactly these two, no more.
    const excluded = puts[0].delivery_excluded_cities as string[];
    expect(excluded).toHaveLength(2);
    expect(excluded).toEqual(expect.arrayContaining(["אילת", "ערד"]));
  });

  // MT:MEH-1255:4 — turning nationwide off drops the exclusions and brings the cities field back.
  test("turning «לכל הארץ» off clears the exclusions and requires a city again", async ({ page }) => {
    const puts: Array<Record<string, unknown>> = [];
    await stubEdit(page, { profile: NATIONWIDE, puts });
    await openDelivery(page);
    await checkbox(page, "משלוחים לכל הארץ").uncheck();

    await expect(body(page).getByText(EXCLUDED_LABEL)).toHaveCount(0);
    await expect(body(page).getByText(CITIES_LABEL, { exact: true })).toBeVisible();
    await expect(body(page).getByText(CITIES_REQUIRED)).toBeVisible();
    await expect(saveBtn(page), "no city yet — the card must block the save").toBeDisabled();

    await regionChip(page, new RegExp(`^${HAIFA_REGION.name}`)).click();
    await expect(body(page).getByText(CITIES_REQUIRED)).toHaveCount(0);
    await expect(saveBtn(page)).toBeEnabled();
    await saveBtn(page).click();
    await expect.poll(() => puts.length, { message: "the PUT never left the browser" }).toBe(1);

    expect(puts[0]).toMatchObject({ delivery_nationwide: false, delivery_excluded_cities: [] });
    const rows = puts[0].delivery_areas as Array<{ city: string }>;
    expect(rows.map((r) => r.city).sort()).toEqual([...HAIFA_REGION.cities].sort());
  });
});

// ── MT:MEH-1256 — region quick-add chips ───────────────────────────────────

test.describe("delivery card — region quick-add chips", () => {
  // MT:MEH-1256:1 — chips render only once delivery is on; exactly the seven regions, in data order.
  test("the region chips appear only in a delivery context — all seven, in order", async ({ page }) => {
    await stubEdit(page, { profile: PHYSICAL_ONLY });
    await openDelivery(page);
    await expect(regionChips(page)).toHaveCount(0);

    await checkbox(page, "משלוחים").check();
    const names = REGIONS.map((r: { name: string }) => r.name);
    expect(names.length, "control: data/regions.js must export the regions").toBeGreaterThan(0);
    await expect(regionChips(page)).toHaveCount(names.length);
    await expect(regionChips(page)).toHaveText(names);
  });

  // MT:MEH-1256:2 — one click adds every city of the region as a chip and as a PUT row.
  test("clicking «השרון» adds all of its cities, and the save carries them as rows", async ({ page }) => {
    const puts: Array<Record<string, unknown>> = [];
    await stubEdit(page, { puts });
    await openDelivery(page);
    await expect(cityChips(page), "fixture precondition: one seeded city").toHaveCount(1);

    await regionChip(page, /^השרון/).click();
    await expect(cityChips(page)).toHaveCount(1 + SHARON.cities.length);
    for (const c of SHARON.cities) await expect(cityChip(page, c)).toBeVisible();

    await saveBtn(page).click();
    await expect.poll(() => puts.length, { message: "the PUT never left the browser" }).toBe(1);
    const rows = puts[0].delivery_areas as Array<{ city: string }>;
    expect(rows.map((r) => r.city).sort()).toEqual(["חיפה", ...SHARON.cities].sort());
  });

  // MT:MEH-1256:3 — a city already present is not added twice.
  test("a hand-added «נתניה» stays a single chip after «השרון» is clicked", async ({ page }) => {
    await stubEdit(page, { profile: { ...DELIVERY_CITIES, delivery_areas: [] }, cities: ["נתניה"] });
    await openDelivery(page);
    expect(SHARON.cities, "control: the dedupe case needs נתניה inside השרון").toContain("נתניה");
    await addCityByTyping(page, "נתניה");
    await expect(cityChips(page)).toHaveCount(1);

    await regionChip(page, /^השרון/).click();
    await expect(cityChip(page, "נתניה")).toHaveCount(1);
    await expect(cityChips(page)).toHaveCount(SHARON.cities.length);
  });

  // MT:MEH-1256:4 — drift D1: fully selected = «· ✓ נוסף», aria-pressed, and a TOGGLE (not inert).
  test("a fully-selected region reads «· ✓ נוסף», is pressed, and clicking it again removes its cities", async ({ page }) => {
    await stubEdit(page);
    await openDelivery(page);
    const sharon = regionChip(page, /^השרון/);
    await expect(sharon).toHaveAttribute("aria-pressed", "false");
    await expect(sharon).toHaveText("השרון");

    await sharon.click();
    await expect(sharon).toHaveAttribute("aria-pressed", "true");
    await expect(sharon).toHaveText("השרון · ✓ נוסף");
    await expect(sharon).toBeEnabled();

    await sharon.click();
    await expect(sharon).toHaveAttribute("aria-pressed", "false");
    await expect(cityChips(page)).toHaveCount(1);
    await expect(cityChip(page, "חיפה")).toBeVisible();
  });
});

// ── MT:MEH-1577 — structured delivery cost ─────────────────────────────────

test.describe("delivery card — structured delivery cost", () => {
  // MT:MEH-1577:5 — a stored 0 seeds the field as "0", never as blank.
  test("a stored fee of 0 renders as 0, and the threshold as its number", async ({ page }) => {
    await stubEdit(page, { profile: { ...DELIVERY_CITIES, delivery_fee: 0, free_delivery_above: 250 } });
    await openDelivery(page);
    await expect(feeInput(page)).toHaveValue("0");
    await expect(freeAboveInput(page)).toHaveValue("250");
    await expect(feeInput(page)).toHaveAttribute("min", "0");
    await expect(freeAboveInput(page)).toHaveAttribute("min", "1");
  });

  // The wire, from the browser: a typed 0 is 0, a blank is null. Not a doc row —
  // the isolation test pins the mapping in jsdom; this pins it through the real
  // <input type="number"> and axios.
  test("a typed 0 goes on the wire as 0, and a cleared threshold as null", async ({ page }) => {
    const puts: Array<Record<string, unknown>> = [];
    await stubEdit(page, { profile: { ...DELIVERY_CITIES, delivery_fee: 35, free_delivery_above: 250 }, puts });
    await openDelivery(page);
    await feeInput(page).fill("0");
    await freeAboveInput(page).fill("");
    await saveBtn(page).click();
    await expect.poll(() => puts.length, { message: "the PUT never left the browser" }).toBe(1);
    expect(puts[0]).toMatchObject({ delivery_fee: 0, free_delivery_above: null });
  });

  // MT:MEH-1577:10 — no delivery → no cost fields, and the save nulls them.
  test("turning «משלוחים» off hides the cost fields and the save resets every delivery field", async ({ page }) => {
    const puts: Array<Record<string, unknown>> = [];
    await stubEdit(page, { profile: { ...DELIVERY_CITIES, delivery_fee: 35, free_delivery_above: 250 }, puts });
    await openDelivery(page);
    await expect(feeInput(page)).toHaveValue("35");

    await checkbox(page, "משלוחים").uncheck();
    await expect(feeInput(page)).toHaveCount(0);
    await expect(freeAboveInput(page)).toHaveCount(0);
    await expect(regionChips(page)).toHaveCount(0);

    await saveBtn(page).click();
    await expect.poll(() => puts.length, { message: "the PUT never left the browser" }).toBe(1);
    expect(puts[0]).toMatchObject({
      has_physical_location: true,
      offers_delivery: false,
      delivery_nationwide: false,
      delivery_areas: [],
      delivery_excluded_cities: [],
      delivery_fee: null,
      free_delivery_above: null,
    });
  });
});
