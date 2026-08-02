/**
 * Module:   qa-meh1831-fonts-lenis
 * Purpose:  Self-QA harness for MEH-1831 — proves (a) no request leaves for
 *           fonts.googleapis.com / fonts.gstatic.com on a real page load,
 *           (b) the three brand families actually resolve to next/font's
 *           self-hosted faces rather than a system fallback, and (c) Lenis
 *           does not start its rAF loop under a coarse pointer.
 * Does NOT: assert pixel parity — that is the VRT suite's job
 *           (e2e/visual/parity.spec.ts). This measures computed styles and the
 *           network, which a screenshot cannot distinguish from a lucky match.
 * Related:  frontend/__tests__/SmoothScrollProviderTouch.test.jsx,
 *           frontend/app/[locale]/layout.js (next/font declarations)
 * History:  MEH-1831 (creation)
 *
 * Run against a local `next start`:
 *   node e2e/qa-meh1831-fonts-lenis.mjs
 */

import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const OUT = "qa-artifacts/MEH-1831";

const PAGES = [
  ["home", "/he"],
  ["producers", "/he/producers"],
  ["about", "/he/about"],
];

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

/**
 * The discriminating check. "A font-family string is present" is not evidence:
 * the pre-MEH-1831 failure mode and the fixed state produce the SAME declared
 * stack. What separates them is which family the browser actually resolved to —
 * next/font's faces carry generated names, so a resolved `__Frank_Ruhl_Libre_*`
 * proves the self-hosted face loaded, and a bare "Frank Ruhl Libre" proves it
 * did not (no such face exists any more).
 */
async function measureTypography(page) {
  return page.evaluate(() => {
    const seen = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { family: cs.fontFamily, weight: cs.fontWeight };
    };
    const loaded = [...document.fonts].filter((f) => f.status === "loaded");
    return {
      body: seen(document.body),
      heading: seen(document.querySelector("h1, h2")),
      english: seen(document.querySelector(".font-english")),
      vars: {
        headline: getComputedStyle(document.documentElement)
          .getPropertyValue("--font-headline")
          .trim(),
        body: getComputedStyle(document.documentElement)
          .getPropertyValue("--font-body")
          .trim(),
        latin: getComputedStyle(document.documentElement)
          .getPropertyValue("--font-latin")
          .trim(),
      },
      fontFaces: { total: document.fonts.size, loaded: loaded.length },
      loadedFamilies: [...new Set(loaded.map((f) => f.family))].sort(),
    };
  });
}

async function shoot(browser, label, viewport, deviceOpts = {}) {
  const context = await browser.newContext({
    viewport,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "no-preference",
    ...deviceOpts,
  });

  const offenders = [];
  context.on("request", (req) => {
    const url = req.url();
    if (FONT_HOSTS.some((h) => url.includes(h))) offenders.push(url);
  });

  const page = await context.newPage();
  const results = [];

  for (const [name, path] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${OUT}/${name}-${label}.png`, fullPage: false });
    results.push([name, await measureTypography(page)]);
  }

  // Lenis liveness: the provider only schedules rAF when it constructs Lenis.
  // `__lenis` is set by the library on the scroll root when it initialises.
  await page.goto(`${BASE}/he`, { waitUntil: "networkidle" });
  const lenisActive = await page.evaluate(
    () =>
      Boolean(document.documentElement.className.includes("lenis")) ||
      Boolean(window.lenis) ||
      document.querySelectorAll("html.lenis, .lenis-smooth").length > 0,
  );

  await context.close();
  return { results, offenders, lenisActive };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, channel: process.env.CHROMIUM_PATH ? undefined : "chromium" });
mkdirSync(OUT, { recursive: true });

const report = {};
report.desktop = await shoot(browser, "1440", { width: 1440, height: 900 });
report.mobile = await shoot(browser, "375", { width: 375, height: 812 }, {
  ...devices["Pixel 5"],
  viewport: { width: 375, height: 812 },
});

await browser.close();

for (const [label, data] of Object.entries(report)) {
  console.log(`\n=== ${label} ===`);
  console.log(`external font requests: ${data.offenders.length}`, data.offenders);
  console.log(`lenis html class active: ${data.lenisActive}`);
  for (const [name, m] of data.results) {
    console.log(`  [${name}] faces total=${m.fontFaces.total} loaded=${m.fontFaces.loaded}`);
    console.log(`     body     -> ${m.body?.family}`);
    console.log(`     heading  -> ${m.heading?.family} (weight ${m.heading?.weight})`);
    console.log(`     english  -> ${m.english?.family ?? "(no .font-english on page)"}`);
    console.log(`     loaded   -> ${m.loadedFamilies.join(" | ")}`);
  }
  console.log(`  vars: ${JSON.stringify(data.results[0][1].vars)}`);
}

const totalOffenders = report.desktop.offenders.length + report.mobile.offenders.length;
console.log(`\nRESULT external-font-requests=${totalOffenders} (expected 0)`);
console.log(
  `RESULT lenis desktop=${report.desktop.lenisActive} mobile=${report.mobile.lenisActive} ` +
    `(expected true / false)`,
);
