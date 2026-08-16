/**
 * MEH-1936 self-QA — the dashboard "מיקום חדש" form in a real browser, at
 * mobile 375px and desktop 1440px.
 *
 *   A — the city field is CitySearch (a combobox with a real suggestion list),
 *       not a bare text input.
 *   B — picking an address renders the confirmation line + a real Leaflet map,
 *       and derives precision "exact".
 *   C — an address that resolves to nothing shows the fallback line pointing at
 *       the manual-coordinates disclosure, and does NOT block save.
 *   D — 375px: no horizontal overflow, and the map does not break the layout.
 *
 * Everything the page fetches is stubbed, so the run is deterministic and
 * offline. The unit suite (__tests__/LocationsEditor.test.jsx) covers the state
 * transitions; what only a browser can answer is whether the composed
 * comboboxes and the Leaflet map actually mount and lay out inside this form.
 *
 * Run from frontend/ with `next start` on :3000:
 *   node e2e/qa-meh1936-locations-geocode.mjs [outdir] [/path/to/chrome]
 * Exits non-zero if any check fails.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(
  process.argv[2] || "/home/user/FoodMamkor/qa-artifacts/MEH-1936",
);
// Optional browser path via ARGV, never an env var — a new `process.env.*` read
// is a new undocumented variable and the Env drift gate (MEH-491) reds it.
// Regression rule 8. REUSES: e2e/qa-meh1727-font-cors.mjs:37,61-66, which is
// where this repo already settled the question. Needed because the CC sandbox
// ships a Chromium whose revision does not match this repo's @playwright/test.
const BROWSER_PATH = process.argv[3];
const URL = "http://127.0.0.1:3000/producer/dashboard/edit";
const NOMINATIM = "**nominatim.openstreetmap.org**";

const ADDRESS_ROWS = [
  {
    place_id: 1,
    display_name: "דרך שרה, רמת צבי, זכרון יעקב",
    lat: "32.5731",
    lon: "34.9512",
    address: { road: "דרך שרה", neighbourhood: "רמת צבי", city: "זכרון יעקב" },
  },
];

const failures = [];
function check(name, cond, detail = "") {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name} ${detail}`);
    failures.push(name);
  }
}

const json = (body, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function open(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL" });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("token", "qa-meh1936-token");
    } catch {}
  });
  const page = await ctx.newPage();

  // ORDER MATTERS: Playwright tries handlers most-recently-registered FIRST, so
  // the catch-all goes in BEFORE the specific ones or it swallows them. Getting
  // this backwards costs an hour — the page silently redirects to /login because
  // `/api/auth/me` answered `{}` and the role check failed.
  // The API is same-origin under /api (a Next proxy route), which is why these
  // globs have to reach through that prefix.
  // `[]` and not `{}`: the dashboard's other cards call `.find`/`.map` on their
  // feeds, and an object body crashes the page into its error boundary with
  // `e.find is not a function` — which looks exactly like an auth failure from
  // the outside. Measured, not guessed.
  await page.route("**/api/**", (r) => r.fulfill(json([])));

  // The page redirects to /login unless auth-context resolves a producer.
  await page.route("**/auth/me", (r) =>
    r.fulfill(
      json({
        id: 4242,
        email: "qa-meh1936@example.com",
        name: "QA",
        role: "producer",
        is_producer: true,
        producer_id: "11111111-1111-1111-1111-111111111111",
      }),
    ),
  );
  await page.route("**/producers/me/locations**", (r) => r.fulfill(json([])));
  await page.route("**/producers/me", (r) =>
    r.fulfill(
      json({
        id: "11111111-1111-1111-1111-111111111111",
        name: "QA עסק",
        status: "approved",
        city: "",
        locations: [],
        categories: [],
        delivery_areas: [],
      }),
    ),
  );
  // CitySearch merges GET /cities into its static list.
  await page.route("**/cities**", (r) => r.fulfill(json(["זכרון יעקב", "חיפה"])));
  await page.route(NOMINATIM, (r) => r.fulfill(json(ADDRESS_ROWS)));

  await page.goto(`${URL}?group=location`, { waitUntil: "domcontentloaded" });
  return { ctx, page };
}

async function openAddForm(page) {
  // The locations card is a collapsed accordion (aria-expanded="false" on
  // mount); expand it, then use the empty-state CTA, which is the only way in
  // when the producer has no rows yet.
  const toggle = page.getByTestId("accordion-locations");
  await toggle.waitFor({ timeout: 20_000 });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page.getByTestId("locations-editor").waitFor({ timeout: 20_000 });
  await page
    .locator('[data-testid="locations-editor"] button')
    .filter({ hasText: "הוסיפו" })
    .first()
    .click();
  await page.getByTestId("location-form").waitFor({ timeout: 20_000 });
}

async function run(browser, label, width, height) {
  console.log(`\n=== ${label} (${width}x${height}) ===`);
  const { ctx, page } = await open(browser, width, height);
  fs.mkdirSync(OUT, { recursive: true });

  await openAddForm(page);
  const form = page.getByTestId("location-form");

  // ---- A: the city field is a real combobox, not free text -------------
  const cityField = page.getByTestId("location-city-field");
  const cityCombobox = cityField.locator('input[role="combobox"]');
  check(
    `${label} A1 city field is a combobox (CitySearch), not a bare input`,
    (await cityCombobox.count()) === 1,
    `combobox inputs: ${await cityCombobox.count()}`,
  );
  await cityCombobox.fill("זכרון");
  // Scope to the field: the form also holds native <select>s, whose <option>
  // elements carry the same implicit ARIA role. An unscoped getByRole("option")
  // resolves to the (hidden) "סניף" kind option and waits forever.
  const cityOption = cityField.getByRole("option").filter({ hasText: "זכרון יעקב" }).first();
  await cityOption.waitFor({ state: "visible", timeout: 10_000 });
  check(`${label} A2 city autocomplete offers a real suggestion`, true);
  await cityOption.click();

  // City alone, no street address → precision derives "approximate".
  check(
    `${label} A3 city-only derives precision=approximate`,
    (await page.getByTestId("location-precision").inputValue()) === "approximate",
    `got: ${await page.getByTestId("location-precision").inputValue()}`,
  );
  await page.screenshot({ path: path.join(OUT, `${label}-A-city-picked.png`), fullPage: true });

  // ---- C first (while nothing is picked): unresolved address ------------
  await page.getByTestId("location-address").fill("רחוב שלא קיים 999");
  await page.getByTestId("location-address-unresolved").waitFor({ timeout: 10_000 });
  check(`${label} C1 unresolved address shows the manual-coords fallback line`, true);
  check(
    `${label} C2 no confirmation while unresolved (states are exclusive)`,
    (await page.getByTestId("location-address-confirm").count()) === 0,
  );
  check(
    `${label} C3 save is NOT blocked — the button stays enabled`,
    await page.getByTestId("location-save").isEnabled(),
  );
  await page.screenshot({
    path: path.join(OUT, `${label}-C-unresolved.png`),
    fullPage: true,
  });

  // ---- B: pick an address ----------------------------------------------
  const addressField = page.getByTestId("location-address");
  await addressField.fill("");
  await addressField.fill("דרך שרה");
  const option = page.getByTestId("location-address-field").getByRole("option").first();
  await option.waitFor({ state: "visible", timeout: 10_000 });
  await option.click();

  const confirm = page.getByTestId("location-address-confirm");
  await confirm.waitFor({ timeout: 10_000 });
  const confirmText = ((await confirm.locator("p").first().textContent()) || "").trim();
  check(
    `${label} B1 confirmation names the street + town, not coordinates`,
    confirmText.includes("דרך שרה") && confirmText.includes("זכרון יעקב"),
    `got: ${JSON.stringify(confirmText)}`,
  );
  check(
    `${label} B2 no raw lat/lng leaked into the copy`,
    !confirmText.includes("32.57") && !confirmText.includes("34.95"),
  );
  check(
    `${label} B3 the fallback line is gone (states are exclusive)`,
    (await page.getByTestId("location-address-unresolved").count()) === 0,
  );
  check(
    `${label} B4 a picked address derives precision=exact`,
    (await page.getByTestId("location-precision").inputValue()) === "exact",
    `got: ${await page.getByTestId("location-precision").inputValue()}`,
  );

  // A REAL Leaflet map, not a placeholder div.
  await page.locator(".leaflet-container").first().waitFor({ timeout: 20_000 });
  const tiles = await page.locator(".leaflet-container img.leaflet-tile").count();
  // NB: this asserts the map REQUESTED a tile grid, NOT that tiles painted — a
  // tile <img> exists in the DOM even when its fetch fails. The CC sandbox
  // blocks a.tile.openstreetmap.org outright, so the canvas in these
  // screenshots is EMPTY by construction. That is a sandbox fact, not a finding
  // about this diff, and it is why "tiles painted" is not asserted here.
  check(
    `${label} B5 leaflet tile grid mounted (elements, not pixels)`,
    tiles > 0,
    `tiles: ${tiles}`,
  );

  // ---- D: layout at this viewport --------------------------------------
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check(
    `${label} D1 no horizontal page overflow with the map mounted`,
    overflow <= 0,
    `scrollWidth - clientWidth = ${overflow}px`,
  );
  const formBox = await form.boundingBox();
  const mapBox = await page.locator(".leaflet-container").first().boundingBox();
  check(
    `${label} D2 the map sits inside the form's width`,
    mapBox && formBox && mapBox.width <= formBox.width + 1,
    `map ${mapBox?.width}px vs form ${formBox?.width}px`,
  );
  check(
    `${label} D3 the map has a real height (not collapsed to 0)`,
    mapBox && mapBox.height > 80,
    `map height ${mapBox?.height}px`,
  );

  await page.screenshot({
    path: path.join(OUT, `${label}-B-confirmed.png`),
    fullPage: true,
  });
  await form.screenshot({ path: path.join(OUT, `${label}-form.png`) });

  await ctx.close();
}

const browser = await chromium.launch(
  BROWSER_PATH ? { executablePath: BROWSER_PATH } : {},
);
await run(browser, "mobile", 375, 812);
await run(browser, "desktop", 1440, 900);
await browser.close();

console.log(
  failures.length === 0
    ? `\nALL CHECKS PASSED — artifacts in ${OUT}`
    : `\n${failures.length} FAILED: ${failures.join(", ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
