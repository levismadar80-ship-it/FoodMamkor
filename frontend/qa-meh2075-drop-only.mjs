/**
 * MEH-2075 — drop "בלבד" from the two /map fulfillment tag labels
 * (MEH-2046 decision 12 amendment). i18n-only change; this harness proves
 * the rendered text on both surfaces, not just the JSON values.
 *
 * Two surfaces, two different expectations — that split IS the point of the
 * ticket, so the harness asserts both directions:
 *   - /map card (MapProducerCard): "משלוח" / "איסוף עצמי" — "בלבד" GONE.
 *   - /producers card (ProducerCard): "משלוחים בלבד" — UNCHANGED, different
 *     key (producer.card.badges.delivery_only), deliberately kept per
 *     MEH-1841. If this ever reads "משלוח" bare, the two keys have been
 *     conflated and that is a real regression, not this ticket's intent.
 */
import { chromium } from "playwright";

const OUT = "/home/user/FoodMamkor/qa-artifacts/MEH-2075";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const mapProducer = (id, name, { delivers, offersPickup }) => ({
  id,
  name,
  description: "עסק לבדיקת MEH-2075",
  city: "תל אביב",
  lat: 32.08,
  lng: 34.78,
  status: "approved",
  images: [],
  categories: [{ id: 1, name: "ירקות ופירות" }],
  products: [],
  locations: [{ kind: "branch", is_primary: true, lat: 32.08, lng: 34.78, precision: "exact", label: null }],
  delivers,
  offers_pickup: offersPickup,
  avg_rating: 4.6,
  reviews_count: 12,
  delivery_count: delivers ? 1 : 0,
  has_delivery: delivers,
  has_physical_location: true,
  offers_delivery: delivers,
});

const MAP_PRODUCERS = [
  mapProducer("44444444-4444-4444-8444-444444444444", "עסק משלוח בלבד", { delivers: true, offersPickup: false }),
  mapProducer("55555555-5555-4555-8555-555555555555", "עסק איסוף בלבד", { delivers: false, offersPickup: true }),
];

// ProducerCard's OWN badge reads has_physical_location + offers_delivery —
// legacy fields, unrelated to /map's delivers/offers_pickup. A "no physical
// location, delivers" business is what fires it.
const producerCardBusiness = {
  id: "66666666-6666-4666-8666-666666666666",
  name: "עסק וירטואלי עם משלוח",
  description: "בדיקת ProducerCard, לא MapProducerCard",
  city: "חיפה",
  status: "approved",
  images: [],
  categories: [{ id: 1, name: "ירקות ופירות" }],
  products: [],
  locations: [],
  delivers: true,
  offers_pickup: false,
  avg_rating: 4.2,
  reviews_count: 5,
  delivery_count: 3,
  has_delivery: true,
  has_physical_location: false,
  offers_delivery: true,
};

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({
  viewport: { width: 390, height: 900 },
  hasTouch: true,
  isMobile: true,
});

const report = {};

// --- Part 1: /map card, delivery-only and pickup-only cells ---
await page.route("**/api/producers**", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "x-total-count": String(MAP_PRODUCERS.length) },
    body: JSON.stringify(MAP_PRODUCERS),
  }),
);
await page.goto("http://localhost:3000/map", { waitUntil: "domcontentloaded" });
await page.locator(".leaflet-container").filter({ visible: true }).first().waitFor({ state: "visible", timeout: 30_000 });
await page.waitForTimeout(500);

if ((await page.locator("text=משהו השתבש").count()) > 0) {
  console.error("ERROR BOUNDARY RENDERED — screenshots void");
  process.exit(2);
}
const accept = page.getByRole("button", { name: "קבלו הכל" });
if (await accept.count()) await accept.first().click();

const deliveryOnlyTag = page.getByTestId("map-fulfillment-delivery_only").filter({ visible: true }).first();
const pickupOnlyTag = page.getByTestId("map-fulfillment-pickup_only").filter({ visible: true }).first();
await deliveryOnlyTag.waitFor({ state: "visible", timeout: 15_000 });
await pickupOnlyTag.waitFor({ state: "visible", timeout: 15_000 });

report.mapDeliveryOnlyText = (await deliveryOnlyTag.innerText()).trim();
report.mapPickupOnlyText = (await pickupOnlyTag.innerText()).trim();

// CONTROL — "בלבד" must be GONE from both.
if (report.mapDeliveryOnlyText.includes("בלבד") || report.mapPickupOnlyText.includes("בלבד")) {
  console.error(
    `"בלבד" STILL PRESENT on /map (delivery=${report.mapDeliveryOnlyText}, pickup=${report.mapPickupOnlyText}). Void.`,
  );
  process.exit(3);
}
if (report.mapDeliveryOnlyText !== "משלוח" || report.mapPickupOnlyText !== "איסוף עצמי") {
  console.error(
    `UNEXPECTED TEXT (delivery=${report.mapDeliveryOnlyText}, pickup=${report.mapPickupOnlyText}) — expected exactly "משלוח" / "איסוף עצמי". Void.`,
  );
  process.exit(4);
}
// The card list sits at the bottom sheet's PEEK snap (14vh) — the tag is
// below the fold there (PR-3's own documented failure, MEH-2046). The sheet
// only expands via a touch drag gesture (no click affordance), and synthetic
// Touch/TouchEvent dispatch did not reach the component's drag state in this
// harness (diagnosed separately — height stayed exactly 126px/14vh across
// several dispatch attempts). This is a CAPTURE-ONLY override — it forces
// the sheet's inline style directly, after every pass/fail assertion above
// has already run against the real, undisturbed DOM. It changes nothing
// about what was measured; it only makes the measured element visible in
// the frame.
await page.evaluate(() => {
  const sheet = document.querySelector('[class*="z-\\[600\\]"]');
  if (sheet) {
    sheet.style.transition = "none";
    sheet.style.height = "60vh";
  }
});
await page.waitForTimeout(200);
await deliveryOnlyTag.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/drop-only-390-1-map-delivery-only-card.png` });
{
  const box = await deliveryOnlyTag.boundingBox();
  await page.screenshot({
    path: `${OUT}/drop-only-390-2-map-delivery-only-tag-tight.png`,
    clip: { x: 0, y: Math.max(0, box.y - 60), width: 390, height: box.height + 120 },
  });
}

// --- Part 2: /producers card — the OTHER "delivery only" key, untouched ---
await page.route("**/api/producers**", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "x-total-count": "1" },
    body: JSON.stringify([producerCardBusiness]),
  }),
);
// ?q= forces ProducersClient's client-side fetchFiltered (anyActive=true) —
// SSR's own fetch hits API_URL directly (unstubbable from the browser) and
// returns empty in this sandbox, so an unfiltered /producers never re-fetches.
await page.goto("http://localhost:3000/producers?q=%D7%91%D7%93%D7%99%D7%A7%D7%94", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
const producerCardBadge = page.getByText("משלוחים בלבד").filter({ visible: true }).first();
await producerCardBadge.waitFor({ state: "visible", timeout: 15_000 });
report.producerCardBadgeText = (await producerCardBadge.innerText()).trim();
if (report.producerCardBadgeText !== "משלוחים בלבד") {
  console.error(
    `ProducerCard's OWN "delivery only" badge changed (now "${report.producerCardBadgeText}") — MEH-2075 explicitly excludes this key (producer.card.badges.delivery_only, MEH-1841). Void.`,
  );
  process.exit(5);
}
await page.screenshot({ path: `${OUT}/drop-only-390-3-producercard-untouched.png` });

report.docScrollW = await page.evaluate(() => document.documentElement.scrollWidth);
report.viewportW = 390;

console.log(JSON.stringify(report, null, 2));
await browser.close();
