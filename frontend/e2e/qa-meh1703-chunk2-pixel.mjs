/**
 * MEH-1703 chunk 2 — exact-pixel capture of the Header at 1440, for a
 * before/after comparison at threshold 0.
 *
 * WHY THIS EXISTS RATHER THAN A VRT RUN. `playwright.config.ts` sets
 * `maxDiffPixelRatio: 0.02`, which at 1440x900 is a ~25,920 px budget — large
 * enough to swallow a whole nav item (MEH-1765). A green VRT run is therefore
 * not evidence of zero visual change. This captures the raw PNG so the two
 * sides can be compared byte-for-byte, with NO tolerance at all.
 *
 * Run:  node e2e/qa-meh1703-chunk2-pixel.mjs <out.png>
 * Needs `next start` on :3000.
 *
 * CONTROL: the run asserts the page is not the `משהו השתבש` error boundary and
 * that the header element actually has a non-zero box before writing anything.
 * A capture of a blank or errored page would make "identical" vacuous — that
 * is the #2786 failure, six PNGs of an error boundary logged as six successes.
 */
import { chromium } from "@playwright/test";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "/tmp/header.png");
const BASE = process.argv[3] || "http://127.0.0.1:3000";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const run = async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "he-IL",
    reducedMotion: "reduce",
  });
  // Kill external fetches — the sandbox proxy 403s them and the Next image
  // optimizer retries, which is exactly the non-determinism a zero-tolerance
  // comparison must not inherit.
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
  await ctx.route(/\/_next\/image/, (r) => r.abort());

  const page = await ctx.newPage();
  await page.goto(`${BASE}/he/about`, { waitUntil: "domcontentloaded" });

  const boom = await page.getByText("משהו השתבש").count();
  if (boom > 0) {
    console.error("CONTROL FAILED: page is the error boundary — capture void");
    process.exit(1);
  }

  const header = page.locator("header").first();
  await header.waitFor({ state: "visible", timeout: 20_000 });
  const box = await header.boundingBox();
  if (!box || box.width < 100 || box.height < 20) {
    console.error(`CONTROL FAILED: header box is ${JSON.stringify(box)} — capture void`);
    process.exit(1);
  }

  // Freeze the scroll state: the pill's surface branch is scroll-dependent, so
  // both sides must be captured at the same offset or the diff measures scroll.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);

  await header.screenshot({ path: OUT, animations: "disabled", caret: "hide" });
  console.log(`captured ${OUT}  header box=${box.width}x${box.height}`);
  await browser.close();
};

run().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(2);
});
