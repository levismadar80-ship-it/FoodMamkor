/**
 * MEH-2046 PR-3 — capture the four fulfillment cells on a real /map card at 390px.
 *
 * The producers API is STUBBED rather than reached: the sandbox cannot talk to
 * Railway, so an un-stubbed run photographs an empty list and proves nothing
 * about the card. Four synthetic businesses cover the whole (delivers ×
 * offers_pickup) matrix in one frame, which is also the only way to see the
 * uniform-height guarantee hold across all four in a single screenshot.
 *
 * Controls, because a capture harness that writes files and exits 0 while
 * photographing an error boundary is the documented failure (testing.md):
 *   - abort if the error boundary rendered;
 *   - abort if fewer than 4 cards rendered — a stub that silently failed to
 *     intercept would otherwise yield an empty list and a green exit;
 *   - abort if the card a shot is aimed at is COVERED by fixed chrome.
 *
 * That third control exists because the first version of this harness lacked it
 * and produced four files that photographed the BottomNav and the cookie banner
 * instead of the cards. Every number it printed was correct; every image was
 * void. A Playwright element screenshot clips the VIEWPORT at the element's box,
 * so anything `position: fixed` over that box lands in the file with no error and
 * no visual tell — the card list sits at PEEK (14vh) under exactly that chrome.
 * Hence: dismiss the banner, drag the sheet to HALF, and assert non-overlap
 * against every fixed rect before writing a file.
 */
import { chromium } from "playwright";

const OUT = "/home/user/FoodMamkor/qa-artifacts/MEH-2046";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const mk = (id, name, delivers, offers_pickup) => ({
  id,
  name,
  description: "עסק לבדיקת תגי fulfillment",
  city: "חיפה",
  lat: 32.79,
  lng: 34.98,
  status: "approved",
  images: [],
  categories: [{ id: 1, name: "ירקות ופירות" }],
  products: [],
  locations: [],
  delivers,
  offers_pickup,
  avg_rating: 4.6,
  reviews_count: 12,
  delivery_count: 0,
  has_delivery: false,
  has_physical_location: true,
  offers_delivery: delivers,
});

// The four cells, in matrix order, plus a fifth SPACER.
//
// The spacer is not padding for its own sake: the sheet's tallest snap is 45vh,
// so at 390x900 the list's last row always ends ~8px under the BottomNav pill.
// With four items that row is cell 4, which therefore cannot be photographed
// un-covered at any scroll position — CONTROL 4 below rejects it, correctly. A
// fifth row takes that position instead, leaving all four target cells
// scrollable into the clear. It duplicates cell 1, so the expected tag counts in
// CONTROL 5 account for it.
const PRODUCERS = [
  mk("11111111-1111-4111-8111-111111111111", "גם משלוח וגם איסוף", true, true),
  mk("22222222-2222-4222-8222-222222222222", "משלוח בלבד", true, false),
  mk("33333333-3333-4333-8333-333333333333", "איסוף בלבד", false, true),
  mk("44444444-4444-4444-8444-444444444444", "בתיאום אישי", false, false),
  mk("55555555-5555-4555-8555-555555555555", "שורת ריווח (עותק של תא 1)", true, true),
];

// cell 1 and the spacer are both (delivers + pickup).
const EXPECTED_CELLS = {
  both_delivery: 2,
  both_pickup: 2,
  delivery_only: 1,
  pickup_only: 1,
  arranged: 1,
};

const browser = await chromium.launch({ executablePath: CHROME });
// hasTouch is load-bearing: MapBottomSheet only listens for touch events, so
// without it the sheet cannot be opened and the list stays at PEEK.
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
// The desktop and mobile shells EACH mount a card list (only one is displayed),
// so every card locator resolves to 2x the producer count. Scope to the visible
// shell — .first() would take the hidden desktop mount at 390px.
await page
  .locator('[data-testid="map-fulfillment"]')
  .filter({ visible: true })
  .first()
  .waitFor({ state: "visible", timeout: 30_000 });

const report = {};

// CONTROL 1 — the error boundary.
if ((await page.locator("text=משהו השתבש").count()) > 0) {
  console.error("ERROR BOUNDARY RENDERED — screenshots void");
  process.exit(2);
}

// CONTROL 2 — the stub actually fed the list. Without this, a failed intercept
// yields zero cards and every "tag absent" reading below would be vacuously true.
const blocks = page.locator('[data-testid="map-fulfillment"]').filter({ visible: true });
report.fulfillmentBlocks = await blocks.count();
if (report.fulfillmentBlocks < PRODUCERS.length) {
  console.error(
    `STUB DID NOT FEED THE LIST — ${report.fulfillmentBlocks} blocks, expected ${PRODUCERS.length}. Screenshots void.`,
  );
  process.exit(3);
}

const seen = async (key) =>
  await page.locator(`[data-testid="map-fulfillment-${key}"]`).filter({ visible: true }).count();

report.cells = {
  both_delivery: await seen("delivery"),
  both_pickup: await seen("pickup"),
  delivery_only: await seen("delivery_only"),
  pickup_only: await seen("pickup_only"),
  arranged: await seen("arranged"),
};

// CONTROL 5 — the tags rendered are the tags the matrix predicts. Printing the
// counts without checking them is the "artifact that asserts coverage" shape:
// a run that rendered every tag on every card would print a number too.
if (JSON.stringify(report.cells) !== JSON.stringify(EXPECTED_CELLS)) {
  console.error(
    `TAG COUNTS DO NOT MATCH THE MATRIX — got ${JSON.stringify(report.cells)}, expected ${JSON.stringify(EXPECTED_CELLS)}. Screenshots void.`,
  );
  process.exit(6);
}

// Uniform height: every card the same height is the 🔒 MEH-1243 §5 guarantee the
// always-present block exists to preserve. Measured, not assumed.
const cards = page.locator("article:has([data-testid=\"map-fulfillment\"])").filter({ visible: true });
report.cardCount = await cards.count();
const heights = [];
for (let i = 0; i < report.cardCount; i++) {
  const box = await cards.nth(i).boundingBox();
  if (box) heights.push(Math.round(box.height));
}
report.cardHeights = heights;
report.uniformHeight = new Set(heights).size <= 1;

report.docScrollW = await page.evaluate(() => document.documentElement.scrollWidth);
report.viewportW = 390;

// --- make the list actually visible -----------------------------------------

// The banner is z-1100 and sits directly over the sheet's peek area.
const acceptAll = page.getByRole("button", { name: "קבלו הכל" });
if (await acceptAll.count()) await acceptAll.first().click();

// Drag the sheet PEEK (14vh) -> HALF (45vh). Touch only; MapBottomSheet binds
// touchstart/move/end and has no pointer or click affordance. Dispatched over
// CDP rather than with `new TouchEvent` in the page: a synthetic touchmove
// carries no usable `touches` list unless every point is a real `Touch`, and
// Playwright's own touchscreen API only exposes tap.
const sheet = page.locator('div[class*="rounded-t-3xl"][class*="z-[600]"]').first();
const sheetBox = await sheet.boundingBox();
const cdp = await page.context().newCDPSession(page);
const dragFrom = sheetBox.y + 10;
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: dragFrom }] });
for (const dy of [60, 120, 200, 280, 320]) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: dragFrom - dy }] });
  await page.waitForTimeout(30);
}
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await page.waitForTimeout(600); // the sheet's own 300ms height transition

report.sheetHeightVh = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--map-sheet-h").trim(),
);

// CONTROL 3 — the sheet actually opened. At PEEK the list viewport is ~12px
// tall and every "card" shot photographs the chrome on top of it, which is
// exactly what the first run of this harness produced.
if (!report.sheetHeightVh.startsWith("45")) {
  console.error(`SHEET DID NOT OPEN — --map-sheet-h = ${report.sheetHeightVh}, expected 45vh. Screenshots void.`);
  process.exit(4);
}

await page.screenshot({ path: `${OUT}/card-tags-390-all-four-states.png`, fullPage: false });

// CONTROL 4 — is the card the thing actually painted where the shot will clip?
// Enumerating `position: fixed` rects was tried first and is NOT sufficient: the
// BottomNav's fixed container is transparent and `pointer-events: none`, while
// the pill that actually paints is a non-fixed child of it, so a fixed-rect scan
// both over- and under-reports. Hit-testing a grid of points asks the question
// the screenshot asks.
const topmostIsCard = (locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const xs = [r.left + 8, r.left + r.width / 2, r.right - 8];
    const ys = [r.top + 4, r.top + r.height / 2, r.bottom - 4];
    for (const x of xs) {
      for (const y of ys) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(el === hit || el.contains(hit))) {
          return { ok: false, x: Math.round(x), y: Math.round(y), hit: hit ? (hit.className || hit.tagName).toString().slice(0, 80) : "null" };
        }
      }
    }
    return { ok: true };
  });

// One tight shot per cell so each is legible on its own.
for (let i = 0; i < Math.min(4, report.cardCount); i++) {
  // Put the target card at the top of the list viewport — the one position in
  // the sheet guaranteed to be clear of the bottom chrome.
  await cards.nth(i).evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
  await page.waitForTimeout(150);

  const hit = await topmostIsCard(cards.nth(i));
  if (!hit.ok) {
    console.error(
      `CARD ${i + 1} IS COVERED at (${hit.x},${hit.y}) by "${hit.hit}" — a screenshot there photographs the overlay, not the card. Void.`,
    );
    process.exit(5);
  }

  await cards.nth(i).screenshot({ path: `${OUT}/card-tags-390-cell-${i + 1}.png` });
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
