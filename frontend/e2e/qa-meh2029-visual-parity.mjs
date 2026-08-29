/**
 * MEH-2029 — does the next/font/local build render the same pixels as the
 * next/font/google build it replaces?
 *
 * Brand typography is DNA, so "the tests pass" is not the bar: the question is
 * whether a reader would see a different typeface. This drives TWO servers —
 * one on each build — and diffs the same route, in the same viewport, at the
 * same moment.
 *
 * THE CONTROL IS NOT OPTIONAL, and it is the reason this file is not just a
 * screenshot diff. Two captures of the SAME build already differ: encoder
 * noise, subpixel AA, and anything time- or data-dependent on the page. A raw
 * "0.4% of pixels differ" means nothing without knowing what the same build
 * scores against itself. So every run measures that floor first, and a
 * cross-build score is only reported as a REGRESSION when it exceeds it.
 * (.claude/rules/frontend.md records the inverse mistake — hashing rendered
 * output and reporting encoder noise as a visual change.)
 *
 * Usage:
 *   node e2e/qa-meh2029-visual-parity.mjs <oldBaseUrl> <newBaseUrl>
 *
 * Exits 1 if any route's cross-build difference exceeds its own noise floor,
 * or if RTL / horizontal-overflow assertions fail.
 */
import { chromium, devices } from "@playwright/test";
import sharp from "sharp";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OLD = process.argv[2] || "http://localhost:3012";
const NEW = process.argv[3] || "http://localhost:3013";
const OUT = "qa-artifacts/MEH-2029";
const PINNED_CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/**
 * The gate. Two bounds, and the amplitude one is what makes it meaningful:
 * a real typeface substitution replaces black glyph pixels with background,
 * which is a channel delta near 255 across thousands of pixels. Anti-aliasing
 * along a shared edge is a delta of 1-3 across a handful. Measured on this
 * migration: 10 pixels, deltas {1:4, 2:4, 3:2}, in a 4x42 sliver.
 *
 * `--self-test` PROVES this discriminates instead of asserting it: it captures
 * the same build with the .woff2 files blocked, so the page falls back to
 * system faces, and requires the gate to FAIL on that. A tolerance nobody has
 * watched fail is a tolerance of unknown width.
 */
const MAX_CHANNEL_DELTA = 8;
const MAX_DIFFERING_FRACTION = 0.000_5;

const ROUTES = ["/", "/about", "/login", "/register"];
const VIEWPORTS = [
  { name: "390x844", viewport: { width: 390, height: 844 }, isMobile: true },
  { name: "pixel5", ...devices["Pixel 5"] },
  { name: "1440x900", viewport: { width: 1440, height: 900 }, isMobile: false },
];

/** Let lazily-mounted chrome (cookie banner, nav) land before the shutter. */
const SETTLE_MS = 1200;

/** Freeze anything that moves, so a diff means typography and not timing. */
const FREEZE = `*,*::before,*::after{animation:none!important;transition:none!important;
  animation-duration:0s!important;caret-color:transparent!important}`;

async function capture(browser, baseUrl, profile, route, blockFonts = false) {
  const { name, ...contextOptions } = profile;
  const context = await browser.newContext({
    ...contextOptions,
    locale: "he-IL",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  if (blockFonts) await page.route("**/*.woff2", (route_) => route_.abort());
  await page.goto(`${baseUrl}${route}`, { waitUntil: "load", timeout: 60_000 });
  await page.addStyleTag({ content: FREEZE });
  // Gate on the webfonts, not on the network going quiet — `networkidle` is
  // banned in this repo (.claude/rules/testing.md).
  await page.evaluate(() => document.fonts.ready);
  const facts = await page.evaluate(() => ({
    dir: document.documentElement.dir,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  // Viewport-sized, NOT fullPage. A full-page shot is as tall as the document,
  // and this document's height is not stable between two loads of the same
  // build — lazy content and the cookie banner move it. Unequal canvases score
  // as 100% different, which is how the first run of this harness reported a
  // 100% "regression" on three surfaces whose SAME-BUILD floor was also 100%.
  // The floor is what caught it; without it that number reads as a finding.
  await page.waitForTimeout(SETTLE_MS);
  const png = await page.screenshot();
  await context.close();
  return { png, facts };
}

/** Fraction of pixels that differ at all, and the largest channel delta. */
async function diff(pngA, pngB) {
  const a = sharp(pngA);
  const b = sharp(pngB);
  const [metaA, metaB] = [await a.metadata(), await b.metadata()];
  if (metaA.width !== metaB.width || metaA.height !== metaB.height) {
    // Report this distinctly: "the canvases are different sizes" is a probe
    // condition, not a measurement of how different the pixels are.
    return {
      differing: 1,
      maxChannel: 255,
      note: `SIZE MISMATCH ${metaA.width}x${metaA.height} vs ${metaB.width}x${metaB.height}`,
    };
  }
  const composite = await sharp(pngA)
    .composite([{ input: pngB, blend: "difference" }])
    .removeAlpha()
    .raw()
    .toBuffer();
  let differing = 0;
  let maxChannel = 0;
  for (let index = 0; index < composite.length; index += 3) {
    const worst = Math.max(composite[index], composite[index + 1], composite[index + 2]);
    if (worst > 0) differing += 1;
    if (worst > maxChannel) maxChannel = worst;
  }
  return { differing: differing / (composite.length / 3), maxChannel };
}

/**
 * Known-answer control for the GATE itself: block the webfonts so the page
 * renders in system faces, and require the gate to call that a regression.
 */
async function selfTest(browser) {
  const profile = VIEWPORTS[0];
  const normal = await capture(browser, NEW, profile, "/");
  const noFonts = await capture(browser, NEW, profile, "/", true);
  const scored = await diff(normal.png, noFonts.png);
  const caught =
    scored.maxChannel > MAX_CHANNEL_DELTA || scored.differing > MAX_DIFFERING_FRACTION;
  console.log(
    `self-test — same build with .woff2 blocked: ${(scored.differing * 100).toFixed(4)}% ` +
      `of pixels differ, max channel delta ${scored.maxChannel} → gate ${caught ? "FAILS (correct)" : "PASSES (BROKEN)"}`,
  );
  if (!caught) {
    console.error(
      "\n✗ SELF-TEST FAILED — the gate cannot tell a missing webfont from anti-aliasing.\n" +
        "  Every parity result below is void: a check that stays green when the\n" +
        "  typeface is gone is not measuring the typeface.\n",
    );
    process.exit(1);
  }
  return scored;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: ["--ssl-version-max=tls1.2"],
    ...(existsSync(PINNED_CHROME) ? { executablePath: PINNED_CHROME } : {}),
  });

  await selfTest(browser);

  const rows = [];
  const failures = [];

  for (const profile of VIEWPORTS) {
    for (const route of ROUTES) {
      const slug = `${route === "/" ? "home" : route.slice(1)}-${profile.name}`;

      const oldShot = await capture(browser, OLD, profile, route);
      const newShot = await capture(browser, NEW, profile, route);
      // The floor: the SAME build, captured a second time.
      const newShotAgain = await capture(browser, NEW, profile, route);

      const floor = await diff(newShot.png, newShotAgain.png);
      const cross = await diff(oldShot.png, newShot.png);

      writeFileSync(join(OUT, `${slug}.png`), newShot.png);

      const regressed =
        cross.maxChannel > MAX_CHANNEL_DELTA ||
        cross.differing > Math.max(floor.differing, MAX_DIFFERING_FRACTION);
      rows.push({ slug, floor, cross, regressed, facts: newShot.facts });
      if (regressed) {
        writeFileSync(join(OUT, `${slug}-BEFORE.png`), oldShot.png);
        failures.push(
          `${slug}: ${(cross.differing * 100).toFixed(4)}% of pixels differ ` +
            `(floor ${(floor.differing * 100).toFixed(4)}%), max channel delta ${cross.maxChannel}`,
        );
      }

      const { dir, scrollWidth, clientWidth } = newShot.facts;
      if (dir !== "rtl") failures.push(`${slug}: <html dir> is "${dir}", expected "rtl"`);
      if (scrollWidth > clientWidth) {
        failures.push(`${slug}: horizontal overflow — scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`);
      }
    }
  }

  await browser.close();

  console.log(`\nMEH-2029 visual parity — OLD ${OLD}  vs  NEW ${NEW}\n`);
  console.log(
    `${"surface".padEnd(26)}${"same-build floor".padEnd(20)}${"old vs new".padEnd(20)}rtl  overflow`,
  );
  for (const row of rows) {
    const { facts } = row;
    console.log(
      row.slug.padEnd(26) +
        `${row.floor.note ?? `${(row.floor.differing * 100).toFixed(4)}%`}`.padEnd(20) +
        `${row.cross.note ?? `${(row.cross.differing * 100).toFixed(4)}%`}`.padEnd(20) +
        `${facts.dir}  ${facts.scrollWidth <= facts.clientWidth ? "none" : "YES"}`,
    );
  }

  if (failures.length > 0) {
    console.error(`\n✗ ${failures.length} failure(s):`);
    for (const line of failures) console.error(`  - ${line}`);
    process.exit(1);
  }
  console.log(
    `\n✓ ${rows.length} surfaces: every old-vs-new difference is at or below the ` +
      `same-build noise floor, every page is RTL, none scrolls horizontally.\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
