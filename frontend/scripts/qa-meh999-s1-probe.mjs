/**
 * Module:   qa-meh999-s1-probe
 * Purpose:  MEH-999 / finding S1 — settle whether the cookie banner overlaps the
 *           BottomNav, page content, both, or nothing, with geometry rather than
 *           an eyeball on a fullPage screenshot.
 * Touches:  local stack only. Read-only; navigates and measures.
 * Does NOT: change anything, or judge severity.
 * History:  MEH-999 (creation).
 *
 * WHY A SEPARATE PROBE
 *   A fullPage screenshot renders a position:fixed element at its scroll offset, so
 *   "the banner appears in the middle of the page" is an artifact of the capture and
 *   proves nothing about overlap. Overlap is a rectangle-intersection question and
 *   has to be answered as one.
 *
 *   usage: node qa-meh999-s1-probe.mjs [baseUrl] [outDir] [chromePath]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const OUT = process.argv[3] || "/tmp/meh999-walk";
// NOTE: `chromium-1194` is a VERSIONED directory. It moves whenever
// @playwright/test bumps its bundled browser, including on patch upgrades, and the
// failure is an unhelpful launch error that names nothing in this file. Update this
// default in lockstep with any @playwright/test upgrade, or pass argv[4].
// Deliberately NOT read from the environment: env vars are banned (ORDERS 1.4) and
// the `Env drift` gate reds on any undocumented read — that is what failed CI on
// PR #2708.
const CHROME = process.argv[4] || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "he-IL",
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/he/register/producer`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  const result = await page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
    };

    const banner = [...document.querySelectorAll("div,section,aside")].find(
      (e) => /עוגיות|cookie/i.test((e.innerText || "").slice(0, 200)) && getComputedStyle(e).position === "fixed",
    );
    // BottomNav, not "the first nav on the page". The first version of this used
    // document.querySelector("nav") and matched the HEADER nav at y=16..74, so it
    // answered the overlap question about the wrong element and emitted a
    // confident, useless `false`. Select by POSITION -- a fixed element sitting in
    // the lower half of the viewport -- because that is what "bottom nav" actually
    // means here, and it needs no knowledge of a class name that can churn.
    const nav = [...document.querySelectorAll("nav,div")].find((e) => {
      const cs = getComputedStyle(e);
      if (cs.position !== "fixed") return false;
      const r = e.getBoundingClientRect();
      return r.top > window.innerHeight / 2 && r.height > 0 && e.querySelectorAll("a").length >= 3;
    });

    if (!banner) return { bannerFound: false };
    const b = rect(banner);

    // What does the banner actually cover? Sample the element at the centre of the
    // banner's own box: if elementFromPoint returns the banner (or its child), the
    // banner is on top of whatever is beneath -- so ask what is beneath by hiding it.
    const cx = window.innerWidth / 2;
    const probeY = b.top + Math.min(20, b.h / 2);
    const onTop = document.elementFromPoint(cx, probeY);
    const prev = banner.style.visibility;
    banner.style.visibility = "hidden";
    const beneath = document.elementFromPoint(cx, probeY);
    banner.style.visibility = prev;

    const describe = (el) =>
      el ? { tag: el.tagName, text: (el.innerText || "").trim().slice(0, 60), cls: (el.className || "").toString().slice(0, 60) } : null;

    return {
      bannerFound: true,
      viewportH: window.innerHeight,
      banner: b,
      bannerZ: getComputedStyle(banner).zIndex,
      bottomNav: nav ? { ...rect(nav), z: getComputedStyle(nav).zIndex } : null,
      overlapsBottomNav: nav ? !(b.bottom <= rect(nav).top || b.top >= rect(nav).bottom) : null,
      topmostAtBannerY: describe(onTop),
      elementBeneathBanner: describe(beneath),
    };
  });

  console.log(JSON.stringify(result, null, 2));
  await page.screenshot({ path: `${OUT}/s1-banner-viewport.png`, fullPage: false });
} finally {
  await browser.close();
}
