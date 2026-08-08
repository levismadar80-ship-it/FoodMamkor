/**
 * QA harness — MEH-1939 / MEH-1936 dashboard locations modal.
 *
 * ⚠️ LOCAL, NOT STAGING. Target is `next start` on 127.0.0.1:3000 against a
 * local uvicorn on 127.0.0.1:8000 and a local Postgres — the same shape
 * `e2e.yml` has used since MEH-1044. Staging could NOT be reached from the CC
 * sandbox: every staging route 302s to `vercel.com/sso-api` (deployment
 * protection) and `*.up.railway.app` returns `CONNECT tunnel failed, 403`.
 * Nothing this script prints is evidence about the staging deployment.
 *
 * Chromium only. WebKit is unavailable in this sandbox (MEH-1788), so iOS
 * Safari is NOT covered by any line of output here.
 *
 * Nominatim is stubbed — it is external, unreachable from the sandbox, and
 * non-deterministic. The BACKEND IS REAL: /producers/me/locations is served by
 * the local FastAPI app, so the 422 captured below is the genuine server
 * response, not a fixture.
 *
 * Usage: node e2e/qa-meh1939-local-locations.mjs [outdir] [/path/to/chrome]
 * REUSES: e2e/qa-meh1937-single-check.mjs (route stubs, token seeding, viewport loop)
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

const OUT = process.argv[2] || "../qa-artifacts/MEH-1939-local";
const BROWSER_PATH = process.argv[3];
const BASE = "http://127.0.0.1:3000";
const API = "http://127.0.0.1:8000";
const NOMINATIM = "**nominatim.openstreetmap.org**";

const TOWN = "זכרון יעקב";
const ROWS = [
  {
    place_id: 1,
    display_name: `דרך שרה, רמת צבי, ${TOWN}`,
    lat: "32.5731",
    lon: "34.9512",
    address: { road: "דרך שרה", neighbourhood: "רמת צבי", city: TOWN },
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

const EMAIL = "qa-owner@example.com";
const PASSWORD = "Zx7Yp9Mq2Lr4";

// A token minted out-of-band is REJECTED by the browser session: the access
// token carries a request-fingerprint binding (auth.py:261-275), so seeding
// localStorage produces "פג תוקף ההתחברות — נא להתחבר מחדש". Logging in through
// the real form is both the working path and the more faithful one.
async function uiLogin(page) {
  await page.goto(`${BASE}/he/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("login-email").fill(EMAIL);
  await page.getByTestId("login-password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForTimeout(3500);
  // Dismiss the cookie banner. Not cosmetic: with it up, the error toast in
  // step C renders into the same bottom strip and is partly covered, which on
  // the first run looked like a z-index defect. A returning logged-in owner has
  // accepted cookies, so dismissing it is also the more representative state.
  // The overlap itself is recorded in the report as a first-visit observation.
  const accept = page.getByRole("button", { name: /קבלו הכל/ });
  if (await accept.count()) {
    await accept.click();
    await page.waitForTimeout(700);
  }
}

// A token for the REST assertions only (never fed to the browser).
async function apiToken() {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  const token = j.access_token || j.token;
  if (!token) throw new Error(`no token in login response: ${JSON.stringify(j)}`);
  return token;
}

// The editor lives inside a collapsed accordion behind a hub card.
async function openLocationsSection(page) {
  await page.goto(`${BASE}/he/producer/dashboard/edit`, { waitUntil: "networkidle" });
  await page.getByTestId("hub-card-location").click();
  await page.waitForTimeout(1000);
  await page.getByTestId("accordion-locations").click();
  await page.getByTestId("locations-editor").waitFor({ state: "visible", timeout: 20_000 });
}

// 0 items renders an EmptyState CTA; ≥1 renders `locations-add`. Handling only
// the second is how this harness first went red — the 0/1/many rule, live.
async function startAddForm(page) {
  const add = page.getByTestId("locations-add");
  if (await add.count()) {
    await add.scrollIntoViewIfNeeded();
    await add.click();
  } else {
    await page.getByRole("button", { name: /הוסיפו מיקום ראשון/ }).click();
  }
  await page.getByTestId("location-form").waitFor({ state: "visible", timeout: 10_000 });
}

// Wipe location rows between viewports so the same-town case starts from a
// known count.
//
// Goes straight to the DB, NOT through the API. The first version of this used
// a token minted by fetch() and every call came back 401 "fingerprint mismatch"
// (auth.py) — and because it read `if (!list.ok) return;` it swallowed that
// silently. Rows then leaked from the mobile run into the desktop run, so
// desktop's first save hit the same-town 422 and the harness crashed three
// steps later on a symptom. A guard that consults its own subject and returns
// quietly is exactly the shape testing.md warns about; this one throws.
function resetLocations() {
  const sql = "DELETE FROM producer_locations WHERE producer_id IN (SELECT producer_id FROM users WHERE email = '" + EMAIL + "');";
  const out = execSync(
    `PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d mehamakor_qa -tAc "${sql}"`,
    { encoding: "utf8" },
  );
  if (!/^DELETE \d+/m.test(out.trim())) {
    throw new Error(`resetLocations did not run: ${JSON.stringify(out)}`);
  }
}

function locationRowCount() {
  const out = execSync(
    `PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d mehamakor_qa -tAc "SELECT count(*) FROM producer_locations WHERE producer_id IN (SELECT producer_id FROM users WHERE email = '${EMAIL}');"`,
    { encoding: "utf8" },
  );
  return Number(out.trim());
}

async function open(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL" });
  const page = await ctx.newPage();
  let geocodeEnabled = true;
  await page.route(NOMINATIM, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(geocodeEnabled ? ROWS : []),
    }),
  );
  await uiLogin(page);
  await openLocationsSection(page);
  return { ctx, page, setGeocode: (v) => (geocodeEnabled = v) };
}

async function shot(page, name, width) {
  const file = `${OUT}/local-not-staging-${name}-${width}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(`        shot: ${file}`);
}

// Scope to the combobox's own [role=listbox]. A bare getByRole("option") also
// matches the `location-kind` <select>'s hidden <option> elements, which is
// what made the first run of this harness time out on 24 hidden matches.
async function pickFrom(input, page) {
  const listboxId = await input.getAttribute("aria-controls");
  const option = page.locator(`#${listboxId} [role="option"]`).first();
  await option.waitFor({ state: "visible", timeout: 10_000 });
  await option.click();
  return true;
}

async function pickSuggestion(page, testid, text) {
  const input = page.getByTestId(testid);
  await input.fill(text);
  return pickFrom(input, page);
}

async function run(browser, label, width, height) {
  console.log(`\n=== ${label} (${width}x${height}) — LOCAL, NOT STAGING ===`);
  resetLocations();
  const { ctx, page, setGeocode } = await open(browser, width, height);

  // ---- A. CitySearch + AddressSearch → pin + exactly one check mark --------
  await startAddForm(page);

  const cityInput = page.getByTestId("location-city-field").locator("input").first();
  await cityInput.fill(TOWN);
  await pickFrom(cityInput, page).catch(() => {});

  await pickSuggestion(page, "location-address", "דרך שרה");

  const confirm = page.getByTestId("location-address-confirm");
  await confirm.waitFor({ timeout: 10_000 });
  const row = confirm.locator("p").first();
  const text = ((await row.textContent()) || "").trim();

  // Guard against a green that means "nothing rendered".
  check("A1 confirmation row rendered its copy", text.includes("המיקום זוהה"), `text=${JSON.stringify(text)}`);
  // AND, not OR: icon count alone misses a returning glyph, and glyph alone
  // misses the icon being dropped or doubled.
  const icons = await row.locator("svg").count();
  check("A2 exactly one check-mark icon", icons === 1, `icons=${icons}`);
  check("A3 no ✓ glyph in the copy", !text.includes("✓"), `text=${JSON.stringify(text)}`);
  // The pin: MiniMap mounts a Leaflet container once coordinates exist.
  // MiniMap is a client-only dynamic import; counting immediately after the
  // confirm block appears reads 0 before it has mounted. Tiles themselves are
  // network-blocked in this sandbox, but the container mounts regardless — that
  // is what "the pin landed" means here, and the screenshot shows the rest.
  const map = confirm.locator(".leaflet-container");
  await map.first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  const mapCount = await map.count();
  check("A4 confirmation map (pin) mounted", mapCount === 1, `containers=${mapCount}`);
  await shot(page, "A-address-confirmed", width);

  await page.getByTestId("location-save").click();
  await page.waitForTimeout(1500);

  // ---- B. fake address → unresolved + manual-coordinates fallback ---------
  setGeocode(false);
  await startAddForm(page);
  const city2 = page.getByTestId("location-city-field").locator("input").first();
  await city2.fill("חיפה");
  await page.getByTestId("location-address").fill("רחוב שלא קיים 9999");
  await page.waitForTimeout(2500);

  const unresolved = page.getByTestId("location-address-unresolved");
  const unresolvedVisible = await unresolved.isVisible().catch(() => false);
  const unresolvedText = unresolvedVisible ? ((await unresolved.textContent()) || "").trim() : "";
  check("B1 inline unresolved line shown", unresolvedVisible, `visible=${unresolvedVisible}`);
  console.log(`        unresolved copy: ${JSON.stringify(unresolvedText)}`);
  const toggle = page.getByTestId("location-coords-toggle");
  check("B2 manual-coordinates disclosure present", await toggle.isVisible().catch(() => false));
  await shot(page, "B-address-unresolved", width);

  await toggle.click();
  await page.getByTestId("location-lat").fill("32.7940");
  await page.getByTestId("location-lng").fill("34.9896");
  await page.getByTestId("location-save").click();
  await page.waitForTimeout(2000);
  const rows = locationRowCount();
  check("B3 save with manual coordinates persisted", rows === 2, `rows=${rows}`);
  await shot(page, "B-after-manual-save", width);

  // ---- C. MEH-1940: second location, same town, no label → 422 -----------
  setGeocode(true);
  await startAddForm(page);
  const city3 = page.getByTestId("location-city-field").locator("input").first();
  await city3.fill(TOWN);
  await pickFrom(city3, page).catch(() => {});
  await pickSuggestion(page, "location-address", "דרך שרה");

  const resp = page.waitForResponse(
    (r) => r.url().includes("/producers/me/locations") && r.request().method() === "POST",
    { timeout: 15_000 },
  );
  await page.getByTestId("location-save").click();
  const r = await resp;
  const status = r.status();
  let detail = "";
  try {
    detail = (await r.json())?.detail || "";
  } catch {}
  check("C1 same-town unlabelled location rejected with 422", status === 422, `status=${status}`);
  console.log(`        422 detail (what the API returns): ${JSON.stringify(detail)}`);

  // What the OWNER actually sees — the toast, not the raw payload.
  const toast = page.locator("[data-sonner-toast], [role='status'], .Toastify__toast").first();
  const toastVisible = await toast.isVisible().catch(() => false);
  const toastText = toastVisible ? ((await toast.textContent()) || "").trim() : "";
  check("C2 owner-visible error surfaced", toastVisible, `visible=${toastVisible}`);
  console.log(`        toast copy (what the owner sees): ${JSON.stringify(toastText)}`);
  await shot(page, "C-same-town-422", width);

  await ctx.close();
  return { detail, toastText };
}

const browser = await chromium.launch(
  BROWSER_PATH ? { executablePath: BROWSER_PATH } : {},
);
mkdirSync(OUT, { recursive: true });

const mobile = await run(browser, "mobile", 375, 812);
const desktop = await run(browser, "desktop", 1440, 900);
await browser.close();

console.log("\n=== SUMMARY — LOCAL, NOT STAGING · Chromium only (no WebKit, MEH-1788) ===");
console.log(`422 detail  : ${JSON.stringify(mobile.detail)}`);
console.log(`owner toast : ${JSON.stringify(mobile.toastText)}`);
console.log(desktop.detail === mobile.detail ? "both viewports agree on the 422 copy" : "VIEWPORTS DISAGREE on the 422 copy");
if (failures.length) {
  console.log(`\nFAILURES (${failures.length}): ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nAll checks passed (local only).");
