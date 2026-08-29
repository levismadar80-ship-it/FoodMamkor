import { chromium } from "playwright";

const OUT = "/home/user/FoodMamkor/qa-artifacts/MEH-2046";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.goto("http://localhost:3000/map", { waitUntil: "domcontentloaded" });
// Gate on the thing under test, never on global network quiet (MEH-215).
// The desktop and mobile shells EACH mount a FilterChipsBar (only one is
// displayed), so every chip locator resolves to 2 nodes. Scope to the visible
// one rather than taking .first(), which is the hidden desktop mount at 390px.
const visible = (name) =>
  page.getByRole("button", { name, exact: true }).filter({ visible: true });
await visible("משלוח").waitFor({ state: "visible", timeout: 30_000 });

// CONTROL: if the error boundary rendered, every screenshot below is a photo of
// a crash. Fail loudly rather than writing a reassuring file.
const boom = await page.locator("text=משהו השתבש").count();
if (boom > 0) { console.error("ERROR BOUNDARY RENDERED — screenshots void"); process.exit(2); }

const delivery = visible("משלוח");
const pickup = visible("איסוף עצמי");
const note = page.locator('[data-testid="service-filter-note"]').filter({ visible: true });

const report = {};
report.chipsPresent = { delivery: await delivery.count(), pickup: await pickup.count() };
report.noteBefore = await note.count();
await page.screenshot({ path: `${OUT}/service-row-390-1-idle.png` });

await delivery.click();
await page.waitForTimeout(700);

// Option C, the half that matters: the chip must be ON *before* the city is
// chosen, and the modal is an offer, not a gate. The modal opening here is the
// evidence — under the pre-2046 guard the handler returned early and the chip
// stayed OFF entirely.
report.deliveryPressedWithModalOpen = await delivery.getAttribute("aria-pressed");
const modal = page.locator('[role="dialog"][aria-labelledby="city-picker-title"]');
report.cityModalOpened = await modal.count();
await page.screenshot({ path: `${OUT}/service-row-390-2-delivery-on-city-offered.png` });

// DISMISS — and assert the chip survives it, unscoped. This is the whole point
// of Option C, and it is the assertion a screenshot alone cannot make.
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
report.cityModalAfterDismiss = await modal.count();
report.deliveryPressedAfterDismiss = await delivery.getAttribute("aria-pressed");
report.noteAfterDelivery = await note.count();
report.noteText = (await note.count()) ? (await note.first().innerText()).trim() : null;
await page.screenshot({ path: `${OUT}/service-row-390-3-dismissed-chip-stays-on.png` });

await pickup.click();
await page.waitForTimeout(700);
report.bothPressed = {
  delivery: await delivery.getAttribute("aria-pressed"),
  pickup: await pickup.getAttribute("aria-pressed"),
};
await page.screenshot({ path: `${OUT}/service-row-390-4-both-on.png` });

report.docScrollW = await page.evaluate(() => document.documentElement.scrollWidth);
report.viewportW = 390;

console.log(JSON.stringify(report, null, 2));
await browser.close();
