/**
 * MEH-2180 QA harness — 375px. Enables "קרוב אליי" from a seeded cached fix,
 * toggles a diet chip, and asserts the INTERCEPTED /producers request still
 * carries lat/lng.
 *
 * Control first (.claude/rules/testing.md § a probe whose null output is also
 * its reassuring output): a run that never intercepts a /producers call would
 * report "no request without lat/lng found" — indistinguishable from success.
 * So the control requires a NON-EMPTY request log and a geo request before the
 * toggle, and says every null in the run is void if it is silent.
 */
import { chromium } from "playwright";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3210";
const OUT = "qa-artifacts/meh-2180";
const LAT = 32.0853;
const LNG = 34.7818;

const rows = Array.from({ length: 3 }, (_, i) => ({
  id: i + 1,
  name: `בית עסק ${i + 1}`,
  slug: `biz-${i + 1}`,
  city: "תל אביב",
  category: "גבינות",
  description: "תיאור קצר",
  image_url: null,
  is_verified: false,
  rating: null,
  reviews_count: 0,
}));

let failures = 0;
const fail = (m) => { failures++; console.error(`  ✗ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();

// Seed the cached fix BEFORE any script runs, so handleNearMe takes the
// synchronous cached branch instead of prompting for geolocation.
await ctx.addInitScript(
  ([lat, lng]) => {
    window.localStorage.setItem(
      "user_location",
      JSON.stringify({ lat, lng, source: "gps" })
    );
  },
  [LAT, LNG]
);

const producerRequests = [];
await page.route("**/api/**", async (route) => {
  const url = new URL(route.request().url());
  const isListing = /\/api\/producers\/?$/.test(url.pathname);
  if (isListing) producerRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(isListing ? rows : []),
  });
});

await page.goto(`${BASE}/he`, { waitUntil: "domcontentloaded" });

const accept = page.getByRole("button", { name: "קבלו הכל" });
if (await accept.count()) await accept.first().click().catch(() => {});

// ── control: the interceptor is live and the page actually fetches ──────────
await page.waitForTimeout(2500);
if (producerRequests.length === 0) {
  fail("NO /api/producers request was intercepted — the page never fetched, so every check below is void");
} else ok(`intercepted ${producerRequests.length} /producers request(s) on load`);

// ── enable near-me ─────────────────────────────────────────────────────────
const nearMe = page.getByRole("button", { name: /קרוב אליי/ }).first();
if (!(await nearMe.count())) fail('the "קרוב אליי" control was not found');
else {
  await nearMe.click();
  await page.waitForTimeout(2000);
  const geoReq = producerRequests.filter((u) => u.searchParams.get("lat"));
  if (geoReq.length === 0) fail("near-me issued no request carrying lat — the harness never reached the geo state");
  else ok(`near-me issued a geo request: lat=${geoReq.at(-1).searchParams.get("lat")} radius_km=${geoReq.at(-1).searchParams.get("radius_km")}`);
}

await page.screenshot({ path: `${OUT}/geo-active-375.png` });

// ── MEH-2173 layout: the surface carries the PROMOTED pair; the diet chips
// live inside the FilterSheet. Both routes are handleToggleChip → applyChips,
// so exercise each, and check the request each one produces.
const checkRequest = (label, after) => {
  if (after.length === 0) return fail(`${label}: issued NO /producers request — nothing to check`);
  const req = after.at(-1);
  const lat = req.searchParams.get("lat");
  const radius = req.searchParams.get("radius_km");
  const attrs = [...req.searchParams.entries()]
    .filter(([k]) => !["lat", "lng", "radius_km"].includes(k))
    .map(([k, v]) => `${k}=${v}`);
  console.log(`  · ${label}: lat=${lat} lng=${req.searchParams.get("lng")} radius_km=${radius} attrs=[${attrs}]`);
  if (!lat) fail(`${label}: THE BUG — the request carries NO lat, the geo filter was dropped`);
  else ok(`${label}: the request still carries lat/lng`);
  if (attrs.length === 0) fail(`${label}: the request carries no attribute at all`);
  else ok(`${label}: the request carries the attribute (${attrs})`);
  if (radius === "30") fail(`${label}: radius expanded to 30km — that is near-me-only behaviour`);
  else ok(`${label}: radius untouched at ${radius}`);
};

// (a) promoted chip on the surface
let mark = producerRequests.length;
const promoted = page.getByRole("button", { name: "משלוח", exact: true }).first();
if (!(await promoted.count())) fail('the promoted "משלוח" chip was not found');
else {
  await promoted.click();
  await page.waitForTimeout(2000);
  checkRequest("promoted chip «משלוח»", producerRequests.slice(mark));
}

await page.screenshot({ path: `${OUT}/geo-plus-promoted-chip-375.png` });

// (b) diet chip inside the FilterSheet — the ticket's own wording
mark = producerRequests.length;
// The sheet trigger relabels itself to «סינון · N» once N attributes are on
// (measured, not assumed — it is why an exact "סינון" match times out here).
// The anchors exclude the «סינון משלוח ליום …» day buttons.
await page.getByRole("button", { name: /^סינון( · \d+)?$/ }).first().click();
// Gate on the sheet actually being open — its close control — rather than on a
// fixed pause. A pause that is merely too short reports "chip not found", which
// reads identically to "the chip is gone".
await page
  .getByRole("button", { name: "סגירת הסינון" })
  .first()
  .waitFor({ state: "visible", timeout: 10_000 })
  .then(() => ok("FilterSheet is open"))
  .catch(() => fail("the FilterSheet never opened — the טבעוני check below is void"));
// MEH-2173 renders the sheet's diet rows as switches, not buttons — a
// getByRole("button") lookup finds nothing and reports it as "chip missing".
const vegan = page.getByRole("switch", { name: "טבעוני", exact: true }).first();
if (!(await vegan.count())) fail('the "טבעוני" chip was not found inside the FilterSheet');
else {
  await vegan.click();
  await page.waitForTimeout(2000);
  checkRequest("diet chip «טבעוני»", producerRequests.slice(mark));
}

await page.screenshot({ path: `${OUT}/geo-plus-diet-chip-375.png` });
await ctx.close();
await browser.close();

if (failures) {
  console.error(`\nCONTROL/ASSERTION FAILED (${failures}) — do not trust this run.`);
  process.exit(1);
}
console.log("\nControl clean: geo survived the attribute toggle.");
