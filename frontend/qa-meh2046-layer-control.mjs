/**
 * MEH-2046 PR-4 — the relocated layer control and the hidden-businesses notice.
 *
 * Stubbed feed (the sandbox cannot reach Railway) with a deliberate mix:
 * one ordinary branch business, and one whose ONLY location is a pickup row.
 * The second is the whole point — under producerPoints rule 3 it does not fall
 * back to its own coordinates, so switching the layer off removes it from the
 * map entirely. That is the state the notice exists to report.
 *
 * Controls, because a capture harness that exits 0 having photographed nothing
 * is the documented failure and this repo has already produced one this week:
 *   - abort on the error boundary;
 *   - abort if the toggle is not on screen (nothing to photograph);
 *   - abort if the notice does not appear after switching the layer OFF, or
 *     if it is already present while the layer is ON — a notice that renders
 *     either way is not evidence of anything;
 *   - abort if the toggle overlaps the near-me pill it stacks above.
 */
import { chromium } from "playwright";

const OUT = "/home/user/FoodMamkor/qa-artifacts/MEH-2046";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
// NearMePill.jsx:43 renders this as its accessible name.
const NEAR_ME_ARIA = "הצגת בתי עסק קרובים למיקום שלי";

const mk = (id, name, locations) => ({
  id,
  name,
  description: "עסק לבדיקת שכבת נקודות איסוף",
  city: "חיפה",
  lat: 32.79,
  lng: 34.98,
  status: "approved",
  images: [],
  categories: [{ id: 1, name: "ירקות ופירות" }],
  products: [],
  locations,
  delivers: false,
  offers_pickup: locations.some((l) => l.kind === "pickup" || l.kind === "market_stand"),
  avg_rating: 4.6,
  reviews_count: 12,
  delivery_count: 0,
  has_delivery: false,
  has_physical_location: true,
  offers_delivery: false,
});

const loc = (kind, lat, lng) => ({
  kind,
  is_primary: kind === "branch",
  lat,
  lng,
  precision: "exact",
  label: null,
});

const PRODUCERS = [
  mk("11111111-1111-4111-8111-111111111111", "עסק עם סניף", [loc("branch", 32.79, 34.98)]),
  // Pickup-only: disappears entirely when the layer is off (rule 3).
  mk("22222222-2222-4222-8222-222222222222", "רק נקודת איסוף", [loc("pickup", 32.8, 34.99)]),
];

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({
  viewport: { width: 390, height: 900 },
  hasTouch: true,
  isMobile: true,
});

await page.route("**/producers**", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "x-total-count": String(PRODUCERS.length) },
    body: JSON.stringify(PRODUCERS),
  }),
);

await page.goto("http://localhost:3000/map", { waitUntil: "domcontentloaded" });

// The desktop and mobile shells EACH mount a MapPane (only one is displayed),
// so every control resolves to 2x. Scope to the visible shell — .first() would
// take the hidden desktop mount at 390px.
const toggle = page
  .locator('[data-testid="pickup-layer-toggle-mobile"]')
  .filter({ visible: true })
  .first();
await toggle.waitFor({ state: "visible", timeout: 30_000 });
// The toggle mounts before Leaflet does, so waiting on it alone photographs the
// "טוענת מפה..." placeholder. Wait for the map itself, or the first frame shows
// a control corner floating over a loading state.
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

const notice = page
  .locator('[data-testid="pickup-layer-hidden-notice"]')
  .filter({ visible: true });

// CONTROL 2 — the notice must be ABSENT while the layer is on. A notice that is
// always there would satisfy the "appears" check below without meaning anything.
report.noticeWhileLayerOn = await notice.count();
report.pressedBefore = await toggle.getAttribute("aria-pressed");
if (report.noticeWhileLayerOn !== 0) {
  console.error("NOTICE PRESENT WHILE LAYER IS ON — it does not discriminate. Void.");
  process.exit(3);
}
await page.screenshot({ path: `${OUT}/layer-390-1-on.png` });
{
  const box = await toggle.boundingBox();
  await page.screenshot({
    path: `${OUT}/layer-390-1-on-corner.png`,
    clip: { x: 0, y: box.y - 40, width: 200, height: box.height + 80 },
  });
}

await toggle.click();
await page.waitForTimeout(300);

report.pressedAfter = await toggle.getAttribute("aria-pressed");
report.noticeWhileLayerOff = await notice.count();

// CONTROL 3 — the notice must appear once a business is actually hidden.
if (report.noticeWhileLayerOff !== 1) {
  console.error(
    `NOTICE DID NOT APPEAR with the layer off (count=${report.noticeWhileLayerOff}) — the pickup-only business is hidden and nothing says so. Void.`,
  );
  process.exit(4);
}
report.noticeText = (await notice.innerText()).trim();
await page.screenshot({ path: `${OUT}/layer-390-2-off-notice.png` });
{
  const box = await toggle.boundingBox();
  await page.screenshot({
    path: `${OUT}/layer-390-2-off-corner.png`,
    clip: { x: 0, y: box.y - 40, width: 200, height: box.height + 80 },
  });
}

// CONTROL 4 — the toggle stacks ABOVE the near-me pill, it does not sit on it.
//
// Measured through the SCOPED Playwright locators, not an in-page
// querySelector. The first version of this probe used
// `document.querySelector('[data-testid=...]')`, which returns the hidden
// desktop-shell instance — a zero-size box — and then reported
// `overlaps: false` from it. That is a null dressed as a pass: the two boxes
// cannot overlap when one of them is 0x0. The `w > 0` assertion below is what
// stops that reading from recurring.
const nearMeBox = await page
  .getByLabel(NEAR_ME_ARIA)
  .filter({ visible: true })
  .first()
  .boundingBox();
const toggleBox = await toggle.boundingBox();
report.geometry = {
  toggle: toggleBox && {
    top: Math.round(toggleBox.y),
    bottom: Math.round(toggleBox.y + toggleBox.height),
    w: Math.round(toggleBox.width),
    h: Math.round(toggleBox.height),
  },
  nearMe: nearMeBox && {
    top: Math.round(nearMeBox.y),
    bottom: Math.round(nearMeBox.y + nearMeBox.height),
  },
};
if (!toggleBox || toggleBox.width === 0 || !nearMeBox) {
  console.error(
    `GEOMETRY PROBE MEASURED NOTHING: ${JSON.stringify(report.geometry)} — a 0x0 box cannot overlap anything, so "no overlap" here would mean nothing. Void.`,
  );
  process.exit(5);
}
report.geometry.overlaps = !(
  toggleBox.y + toggleBox.height <= nearMeBox.y || toggleBox.y >= nearMeBox.y + nearMeBox.height
);
report.geometry.gapPx = Math.round(nearMeBox.y - (toggleBox.y + toggleBox.height));
if (report.geometry.overlaps) {
  console.error(`TOGGLE OVERLAPS THE NEAR-ME PILL: ${JSON.stringify(report.geometry)}. Void.`);
  process.exit(6);
}

report.docScrollW = await page.evaluate(() => document.documentElement.scrollWidth);

// Desktop instance, same two states.
const wide = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await wide.route("**/producers**", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "x-total-count": String(PRODUCERS.length) },
    body: JSON.stringify(PRODUCERS),
  }),
);
await wide.goto("http://localhost:3000/map", { waitUntil: "domcontentloaded" });
const wideToggle = wide
  .locator('[data-testid="pickup-layer-toggle-desktop"]')
  .filter({ visible: true })
  .first();
await wideToggle.waitFor({ state: "visible", timeout: 30_000 });
const wideAccept = wide.getByRole("button", { name: "קבלו הכל" });
if (await wideAccept.count()) await wideAccept.first().click();
await wide.screenshot({ path: `${OUT}/layer-1440-1-on.png` });
await wideToggle.click();
await wide.waitForTimeout(300);
report.desktopNoticeOff = await wide
  .locator('[data-testid="pickup-layer-hidden-notice"]')
  .filter({ visible: true })
  .count();
await wide.screenshot({ path: `${OUT}/layer-1440-2-off-notice.png` });

console.log(JSON.stringify(report, null, 2));
await browser.close();
