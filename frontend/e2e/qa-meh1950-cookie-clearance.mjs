/**
 * MEH-1950 — cookie banner ↔ BottomNav clearance, measured (not eyeballed).
 *
 * Runs against a LOCAL `next start` (this is component-pair geometry, not
 * edge/CDN behaviour — a local build measures the right thing here, unlike the
 * MEH-1853 CLS harness whose subject was staging itself).
 *
 * WHAT IT PROVES
 * --------------
 * 1. CONTROL FIRST (validate the probe on a case whose answer is known): force
 *    the banner into the nav's rect and assert the overlap detector fires.
 *    A probe that cannot see a constructed overlap reports a reassuring "no
 *    overlap" for two possible reasons; this removes one of them.
 * 2. Default pill (56px → 72px clearance): banner bottom edge sits a fixed
 *    8px gap above the pill's top. No overlap.
 * 3. Simulated taller nav (pill forced to 96px height): the published
 *    `--bottom-nav-clearance` var tracks it (ResizeObserver), the banner
 *    moves up, gap stays 8px. Under the old hardcoded 80px offset this exact
 *    case overlapped by ~48px — this run is the discriminating one.
 *
 * Usage: node e2e/qa-meh1950-cookie-clearance.mjs [baseURL]
 *   (default http://localhost:3000; screenshots → ../qa-artifacts/MEH-1950/)
 */
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3000";
const OUT = new URL("../../qa-artifacts/MEH-1950/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const GAP = 8; // the design gap the derivation encodes
const TOL = 1.5; // sub-pixel rounding tolerance

let failures = 0;
const report = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures += 1;
};

async function rects(page) {
  return page.evaluate(() => {
    const banner = document.querySelector(".cookie-banner");
    const nav = document.querySelector("nav[aria-label=\"ניווט מובייל\"]");
    const v = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    };
    return {
      banner: v(banner),
      nav: v(nav),
      varValue: getComputedStyle(document.documentElement).getPropertyValue(
        "--bottom-nav-clearance"
      ),
      innerHeight: window.innerHeight,
      hScroll:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    };
  });
}

const overlaps = (a, b) => a && b && a.bottom > b.top && a.top < b.bottom;

async function runDevice(browser, name, contextOpts, shotSuffix) {
  const ctx = await browser.newContext({ ...contextOpts, locale: "he-IL" });
  const page = await ctx.newPage();
  // Banner shows only with no stored consent — fresh context guarantees that.
  await page.goto(`${BASE}/he`, { waitUntil: "networkidle" });
  await page.waitForSelector(".cookie-banner", { timeout: 15000 });
  await page.waitForSelector("nav[aria-label=\"ניווט מובייל\"]", { timeout: 15000 });

  const rtl = await page.evaluate(
    () => document.documentElement.getAttribute("dir") === "rtl"
  );
  report(`${name}: RTL asserted`, rtl, `dir=${rtl ? "rtl" : "NOT rtl"}`);

  // 1 · CONTROL — construct a known overlap, assert the detector sees it.
  {
    const seen = await page.evaluate(() => {
      const banner = document.querySelector(".cookie-banner");
      const prev = banner.style.bottom;
      banner.style.bottom = "0px"; // guaranteed inside the pill's band
      const b = banner.getBoundingClientRect();
      const n = document
        .querySelector("nav[aria-label=\"ניווט מובייל\"]")
        .getBoundingClientRect();
      banner.style.bottom = prev;
      return b.bottom > n.top && b.top < n.bottom;
    });
    report(`${name}: control (forced overlap detected)`, seen, seen ? "detector fires" : "detector BLIND — abort reading the rest");
  }

  // 2 · Default pill height.
  {
    const m = await rects(page);
    const gap = m.nav.top - m.banner.bottom;
    report(
      `${name}: default nav — no overlap, gap≈${GAP}px`,
      !overlaps(m.banner, m.nav) && Math.abs(gap - GAP) <= TOL,
      `gap=${gap.toFixed(1)}px, var=${m.varValue || "(unset)"}`
    );
    report(`${name}: no horizontal scroll`, !m.hScroll, `hScroll=${m.hScroll}`);
    await page.screenshot({
      path: `${OUT}default-${shotSuffix}.png`,
      fullPage: false,
    });
  }

  // 3 · Simulated 96px pill — the case the old hardcoded 80px failed.
  {
    await page.evaluate(() => {
      const nav = document.querySelector("nav[aria-label=\"ניווט מובייל\"]");
      nav.style.height = "96px";
    });
    // ResizeObserver publish + style recalc settle.
    await page.waitForTimeout(400);
    const m = await rects(page);
    const gap = m.nav.top - m.banner.bottom;
    report(
      `${name}: 96px nav — no overlap, gap≈${GAP}px`,
      !overlaps(m.banner, m.nav) && Math.abs(gap - GAP) <= TOL,
      `gap=${gap.toFixed(1)}px, var=${m.varValue || "(unset)"}`
    );
    await page.screenshot({
      path: `${OUT}nav96-${shotSuffix}.png`,
      fullPage: false,
    });
    await page.evaluate(() => {
      document.querySelector("nav[aria-label=\"ניווט מובייל\"]").style.height = "";
    });
  }

  await ctx.close();
}

// Sandbox: Chromium is preinstalled at /opt/pw-browsers (never `playwright
// install`); executablePath override rides a pinned-version mismatch.
const browser = await chromium.launch({
  executablePath: process.env.QA_CHROMIUM || "/opt/pw-browsers/chromium",
});
try {
  await runDevice(
    browser,
    "390×844",
    { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    "390x844"
  );
  await runDevice(browser, "Pixel 5", devices["Pixel 5"], "pixel5");
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
