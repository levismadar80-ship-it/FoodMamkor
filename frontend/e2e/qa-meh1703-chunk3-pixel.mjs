/**
 * MEH-1703 chunk 3 — exact-pixel capture of the mobile nav at 375, for a
 * before/after comparison at threshold 0.
 *
 * WHY THIS EXISTS RATHER THAN A VRT RUN. `playwright.config.ts` sets
 * `maxDiffPixelRatio: 0.02`; on the mobile project (Pixel 5, 393x851, no
 * `fullPage`) that is a ~6,688 px budget — large enough to swallow a whole nav
 * tab (MEH-1765). A green VRT run is therefore not evidence of zero visual
 * change. This captures the raw PNGs so the two sides can be compared
 * byte-for-byte, with NO tolerance at all.
 *
 * Two surfaces, because chunk 3 touches two components:
 *   <out>-pill.png   the floating BottomNav pill (sheet closed)
 *   <out>-sheet.png  the AccountSheet, opened from the account tab
 *
 * Run:  node e2e/qa-meh1703-chunk3-pixel.mjs <out-prefix> [baseURL]
 * Needs `next start` on :3000.
 *
 * CONTROLS. The run refuses to write a PNG unless it has proved the capture is
 * of a real surface: the page must not be the `משהו השתבש` error boundary, the
 * pill's box must be non-degenerate, and — for the sheet — the dialog must
 * actually have opened. A capture of a blank or errored page would make
 * "identical" vacuous, which is the #2786 failure (six PNGs of an error
 * boundary, logged as six successes and exit 0).
 *
 * Sibling: e2e/qa-meh1703-chunk2-pixel.mjs (the same instrument at 1440).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const PREFIX = path.resolve(process.argv[2] || "/tmp/mobilenav");
const BASE = process.argv[3] || "http://127.0.0.1:3000";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const die = (msg, code = 1) => {
  console.error(msg);
  process.exit(code);
};

// Fail legibly rather than inside Playwright when the pinned browser is absent
// (the CI reviewer's note on the chunk-2 harness).
if (!fs.existsSync(CHROMIUM_PATH)) {
  die(`HARNESS ERROR: no chromium at ${CHROMIUM_PATH} — set PLAYWRIGHT_BROWSERS_PATH or edit CHROMIUM_PATH`, 2);
}

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: "he-IL",
    reducedMotion: "reduce",
    hasTouch: true,
    isMobile: true,
  });
  // Kill external fetches — the sandbox proxy 403s them and the Next image
  // optimizer retries, which is exactly the non-determinism a zero-tolerance
  // comparison must not inherit.
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
  await ctx.route(/\/_next\/image/, (r) => r.abort());

  const page = await ctx.newPage();
  await page.goto(`${BASE}/he/about`, { waitUntil: "domcontentloaded" });

  if ((await page.getByText("משהו השתבש").count()) > 0) {
    die("CONTROL FAILED: page is the error boundary — capture void");
  }

  // The pill is the md:hidden <nav> inside the fixed bottom wrapper.
  const pill = page.locator("nav.nav-pill-glass").first();
  await pill.waitFor({ state: "visible", timeout: 20_000 });
  const box = await pill.boundingBox();
  if (!box || box.width < 200 || box.height < 30) {
    die(`CONTROL FAILED: pill box is ${JSON.stringify(box)} — capture void`);
  }

  // Freeze scroll: the MEH-1014 minimize state is scroll-dependent, so both
  // sides must be captured at the same offset or the diff measures scroll.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await pill.screenshot({ path: `${PREFIX}-pill.png`, animations: "disabled", caret: "hide" });

  // Open the sheet from the account tab (the tab is a toggle, not a route).
  await page.locator('button[aria-haspopup="dialog"]').first().click();
  const sheet = page.locator('[role="dialog"]').first();
  await sheet.waitFor({ state: "visible", timeout: 10_000 });
  const sbox = await sheet.boundingBox();
  if (!sbox || sbox.width < 200 || sbox.height < 100) {
    die(`CONTROL FAILED: sheet box is ${JSON.stringify(sbox)} — capture void`);
  }
  // The sheet must actually carry rows, or "identical" would compare two
  // empty panels.
  const rows = await sheet.locator("li").count();
  if (rows < 3) die(`CONTROL FAILED: sheet has ${rows} rows — capture void`);

  await page.waitForTimeout(400);
  await sheet.screenshot({ path: `${PREFIX}-sheet.png`, animations: "disabled", caret: "hide" });

  console.log(
    `captured ${PREFIX}-{pill,sheet}.png  pill=${box.width}x${box.height} ` +
      `sheet=${sbox.width}x${sbox.height} rows=${rows}`,
  );
  await browser.close();
};

run().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(2);
});
