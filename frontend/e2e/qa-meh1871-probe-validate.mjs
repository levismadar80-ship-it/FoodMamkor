/**
 * Probe validation for the MEH-1871 mobile QA red.
 *
 * Question: did STEP 3 fail because the component ignored a real scroll, or
 * because the CDP touch gesture moves scrollY WITHOUT emitting a window scroll
 * event the listener could see? Those are opposite conclusions.
 *
 * Arm A — programmatic window.scrollBy (definitely emits scroll): control whose
 *         answer is already known from the unit tests.
 * Arm B — CDP touch gesture, with a scroll-event counter installed on window.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.TEST_URL || "https://staging.mehamakor.online";
const TRIGGER = '[data-testid="badge-overflow"]';
const PANEL = '[data-testid="badge-overflow-popover"]';

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--ssl-version-max=tls1.2"],
});
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  hasTouch: true,
  isMobile: true,
  extraHTTPHeaders: {
    "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
    "x-vercel-set-bypass-cookie": "true",
    "x-vercel-skip-toolbar": "1",
  },
});
const page = await ctx.newPage();

async function openPanel() {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="producer-card"]', { timeout: 45000 });
  const t = page.locator(TRIGGER).first();
  await t.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const b = await t.boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(350);
  // Install a counter AFTER opening so we only count post-open events.
  await page.evaluate(() => {
    window.__scrollEvents = 0;
    window.__capEvents = 0;
    window.addEventListener("scroll", () => { window.__scrollEvents++; }, { passive: true });
    window.addEventListener("scroll", () => { window.__capEvents++; }, { capture: true, passive: true });
  });
  return page.locator(PANEL).count();
}

const report = [];

// ---- Arm A: programmatic scroll ----
let opened = await openPanel();
let y0 = await page.evaluate(() => window.scrollY);
await page.evaluate(() => window.scrollBy(0, 250));
await page.waitForTimeout(500);
let a = await page.evaluate(() => ({ y: window.scrollY, bubble: window.__scrollEvents, cap: window.__capEvents }));
report.push({
  arm: "A programmatic window.scrollBy",
  openedOk: opened === 1,
  scrolled: `${y0}→${a.y}`,
  scrollEvents: `bubble=${a.bubble} capture=${a.cap}`,
  panelsAfter: await page.locator(PANEL).count(),
});

// ---- Arm B: CDP touch gesture ----
opened = await openPanel();
y0 = await page.evaluate(() => window.scrollY);
const cdp = await ctx.newCDPSession(page);
await cdp.send("Input.synthesizeScrollGesture", {
  x: 187, y: 500, xDistance: 0, yDistance: -250,
  gestureSourceType: "touch", speed: 800,
});
await cdp.detach();
await page.waitForTimeout(700);
let b = await page.evaluate(() => ({ y: window.scrollY, bubble: window.__scrollEvents, cap: window.__capEvents }));
report.push({
  arm: "B CDP touch gesture",
  openedOk: opened === 1,
  scrolled: `${y0}→${b.y}`,
  scrollEvents: `bubble=${b.bubble} capture=${b.cap}`,
  panelsAfter: await page.locator(PANEL).count(),
});

console.log("\n===== PROBE VALIDATION =====");
for (const r of report) {
  console.log(`\n${r.arm}`);
  console.log(`  panel opened cleanly : ${r.openedOk}`);
  console.log(`  scrollY              : ${r.scrolled}`);
  console.log(`  window scroll events : ${r.scrollEvents}`);
  console.log(`  panels after         : ${r.panelsAfter}  ${r.panelsAfter === 0 ? "(dismissed)" : "(STILL OPEN)"}`);
}
console.log(`
Reading:
  A dismisses + B does not, with B showing 0 scroll events  -> probe artifact (gesture emits no event)
  A dismisses + B does not, with B showing >0 scroll events -> REAL defect on touch scroll
  neither dismisses                                          -> REAL defect (or wrong selector)`);

await browser.close();
