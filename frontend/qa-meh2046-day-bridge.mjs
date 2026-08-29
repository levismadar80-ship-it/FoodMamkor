/**
 * MEH-2046 PR-6 — the /map day-bridge context banner.
 *
 * Stubbed feed (the sandbox cannot reach Railway) — one delivering business,
 * so the map has something to draw. The scenario drives the REAL Option C
 * flow through the UI (chip → CityPickerModal → "דלגו"/popular-city button)
 * rather than typing into CitySearch, so no /cities stub is needed.
 *
 * Controls, because a capture harness that exits 0 having photographed
 * nothing is the documented failure this repo has already produced twice
 * this chain (PR-3's clipped-chrome shots, PR-4's 0x0 geometry probe):
 *   - abort on the error boundary;
 *   - abort if the banner is present in the UNSCOPED state (chip on, no
 *     city) — decision 1 says dismiss leaves the chip on and unscoped, and a
 *     banner that shows there would misdescribe a business as city-scoped
 *     when it is not;
 *   - abort if the banner does NOT appear once a city is actually applied —
 *     the actual regression this harness exists to catch;
 *   - abort if dismissing the banner also cleared the delivery/city filter
 *     (checked via the service-filter-note, which is driven by chipState
 *     alone and must survive the banner's local dismiss);
 *   - abort if the bridge CTA does not land on /producers with the SAME
 *     city applied (MEH-1826 serializer trap: the URL param is `city`, not
 *     `delivery_city` — a wrong param would 200 but silently not filter).
 */
import { chromium } from "playwright";

const OUT = "/home/user/FoodMamkor/qa-artifacts/MEH-2046";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CITY = "חיפה";

const PRODUCER = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "עסק עם משלוח",
  description: "עסק לבדיקת באנר הגשר",
  city: CITY,
  lat: 32.79,
  lng: 34.98,
  status: "approved",
  images: [],
  categories: [{ id: 1, name: "ירקות ופירות" }],
  products: [],
  locations: [{ kind: "branch", is_primary: true, lat: 32.79, lng: 34.98, precision: "exact", label: null }],
  delivers: true,
  offers_pickup: false,
  avg_rating: 4.6,
  reviews_count: 12,
  delivery_count: 1,
  has_delivery: true,
  has_physical_location: true,
  offers_delivery: true,
};

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({
  viewport: { width: 390, height: 900 },
  hasTouch: true,
  isMobile: true,
});

const stubProducers = (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "x-total-count": "1" },
    body: JSON.stringify([PRODUCER]),
  });
// Scoped to the /api/producers PROXY path (next.config.js rewrites, lib/api.js
// baseURL="/api"), never the bare **/producers** glob — that also matches the
// document navigation to the /producers PAGE itself and would serve the JSON
// stub as the page body. Confirmed by reproduction: an unscoped route here
// made a real navigation to /producers?city=... render "[]" as the entire
// page (the fetch stub answering the navigation request).
await page.route("**/api/producers**", stubProducers);

await page.goto("http://localhost:3000/map", { waitUntil: "domcontentloaded" });

await page
  .locator(".leaflet-container")
  .filter({ visible: true })
  .first()
  .waitFor({ state: "visible", timeout: 30_000 });
await page.waitForTimeout(500);

const report = {};

// CONTROL 1 — error boundary.
if ((await page.locator("text=משהו השתבש").count()) > 0) {
  console.error("ERROR BOUNDARY RENDERED — screenshots void");
  process.exit(2);
}

const accept = page.getByRole("button", { name: "קבלו הכל" });
if (await accept.count()) await accept.first().click();

// exact:true — the stubbed producer's own name ("עסק עם משלוח") also contains
// "משלוח" as a substring, and Playwright's default name match is substring.
const deliveryChip = page.getByRole("button", { name: "משלוח", exact: true }).filter({ visible: true }).first();
await deliveryChip.waitFor({ state: "visible", timeout: 30_000 });

const banner = page.getByTestId("delivery-context-banner").filter({ visible: true });

// --- Step 1: chip on, dismiss the city picker (skip) → UNSCOPED, no banner ---
await deliveryChip.click();
const skipButton = page.getByRole("button", { name: "דלגו" });
await skipButton.waitFor({ state: "visible", timeout: 10_000 });
await skipButton.click();
await page.waitForTimeout(300);

report.deliveryPressedUnscoped = await deliveryChip.getAttribute("aria-pressed");
report.bannerCountUnscoped = await banner.count();
if (report.bannerCountUnscoped !== 0) {
  console.error(
    `BANNER PRESENT IN THE UNSCOPED STATE (count=${report.bannerCountUnscoped}) — decision 1 requires dismiss to leave the chip on with NO city; a banner here would misdescribe an unscoped delivery business as city-scoped. Void.`,
  );
  process.exit(3);
}
await page.screenshot({ path: `${OUT}/day-bridge-390-1-unscoped-no-banner.png` });

// --- Step 2: reset, then pick a city via the modal → REFINED, banner present ---
await deliveryChip.click(); // off
await page.waitForTimeout(150);
await deliveryChip.click(); // on again — no saved city yet, modal reopens
// Scoped to the dialog + exact match: "חיפה" is also a substring of the
// stubbed producer's own name, which Playwright's default substring
// matching would otherwise resolve to the map marker behind the modal.
const cityModal = page.getByRole("dialog").filter({ visible: true }).first();
await cityModal.waitFor({ state: "visible", timeout: 10_000 });
const cityButton = cityModal.getByRole("button", { name: CITY, exact: true });
await cityButton.waitFor({ state: "visible", timeout: 10_000 });
await cityButton.click();
await page.waitForTimeout(300);

report.deliveryPressedRefined = await deliveryChip.getAttribute("aria-pressed");
report.bannerCountRefined = await banner.count();
if (report.bannerCountRefined !== 1) {
  console.error(
    `BANNER DID NOT APPEAR in the REFINED state (delivery on + city=${CITY}, count=${report.bannerCountRefined}) — the regression this harness exists to catch. Void.`,
  );
  process.exit(4);
}
report.bannerText = (await banner.innerText()).trim();
report.serviceNoteBeforeDismiss = await page.getByTestId("service-filter-note").filter({ visible: true }).count();
await page.screenshot({ path: `${OUT}/day-bridge-390-2-refined-banner.png` });
{
  const box = await banner.boundingBox();
  await page.screenshot({
    path: `${OUT}/day-bridge-390-2-refined-banner-tight.png`,
    clip: { x: 0, y: Math.max(0, box.y - 20), width: 390, height: box.height + 40 },
  });
}

// --- Step 3: dismiss the banner — component state only, filter survives ---
const dismissButton = page.getByRole("button", { name: "סגירת ההסבר" }).filter({ visible: true }).first();
await dismissButton.click();
await page.waitForTimeout(200);

report.bannerCountAfterDismiss = await banner.count();
report.serviceNoteAfterDismiss = await page.getByTestId("service-filter-note").filter({ visible: true }).count();
report.deliveryPressedAfterDismiss = await deliveryChip.getAttribute("aria-pressed");
if (report.bannerCountAfterDismiss !== 0) {
  console.error("BANNER SURVIVED ITS OWN DISMISS BUTTON. Void.");
  process.exit(5);
}
if (report.serviceNoteAfterDismiss !== 1 || report.deliveryPressedAfterDismiss !== "true") {
  console.error(
    `DISMISSING THE BANNER CHANGED THE FILTER (serviceNote=${report.serviceNoteAfterDismiss}, deliveryPressed=${report.deliveryPressedAfterDismiss}) — dismiss must be component state only. Void.`,
  );
  process.exit(6);
}
await page.screenshot({ path: `${OUT}/day-bridge-390-3-after-dismiss.png` });

// --- Step 4: re-show the banner (a fresh render, since state was local) and
// follow the bridge CTA to /producers, then confirm the SAME city landed. ---
await deliveryChip.click(); // off
await page.waitForTimeout(150);
await deliveryChip.click(); // on — city already saved (userCity), so useMapFilters'
// applyToggle only opens the picker when !userCity — it is now set, so this
// reactivates delivery WITHOUT reopening the modal, and cityFilter is untouched
// (still חיפה from step 2) → banner should reappear immediately.
await page.waitForTimeout(300);
report.bannerCountBeforeBridge = await banner.count();
if (report.bannerCountBeforeBridge !== 1) {
  console.error(
    `BANNER DID NOT RETURN after re-toggling delivery with a city already saved (count=${report.bannerCountBeforeBridge}). Void.`,
  );
  process.exit(7);
}

const bridgeLink = page.getByRole("link", { name: "לסינון לפי יום משלוח בכל בתי העסק" }).filter({ visible: true }).first();
await bridgeLink.waitFor({ state: "visible", timeout: 10_000 });
report.bridgeHref = await bridgeLink.getAttribute("href");
await bridgeLink.click();
await page.waitForURL(/\/producers/, { timeout: 15_000 });
await page.waitForTimeout(500);

report.landedUrl = page.url();
const producersUrl = new URL(report.landedUrl);
report.landedCityParam = producersUrl.searchParams.get("city");
report.cityChipOnLanding = await page.getByRole("button", { name: CITY }).filter({ visible: true }).count();

if (report.landedCityParam !== CITY || report.cityChipOnLanding < 1) {
  console.error(
    `BRIDGE DID NOT LAND WITH THE SAME CITY APPLIED (param=${report.landedCityParam}, cityChipCount=${report.cityChipOnLanding}). Void.`,
  );
  process.exit(8);
}
await page.screenshot({ path: `${OUT}/day-bridge-390-4-landed-producers.png` });

report.docScrollW = await page.evaluate(() => document.documentElement.scrollWidth);
report.viewportW = 390;

console.log(JSON.stringify(report, null, 2));
await browser.close();
