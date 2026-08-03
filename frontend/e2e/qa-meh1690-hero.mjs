/**
 * qa-meh1690-hero.mjs — MEH-1690 hero-zone geometry probe.
 *
 * Purpose:  Measure, in a real browser, where the hero image's bottom edge
 *           falls relative to the search pill and the chips row, at 375 and
 *           1440. Phase 0 evidence + the post-fix proof for the
 *           "pill sits FULLY inside the hero image" acceptance criterion.
 * Does NOT: assert anything about copy or take VRT baselines — those are
 *           parity.spec.ts (runner-generated) and the curl probe in the PR body.
 * History:  MEH-1690 (creation).
 *
 * Usage: node e2e/qa-meh1690-hero.mjs   (needs `next start` on :3000)
 *
 * Constants, not env vars, on purpose: `scripts/check_env_drift.sh:65` fails any
 * frontend `process.env` name absent from `.env.example`, and a throwaway QA
 * harness must not widen the env surface (regression rule 8; the same slip
 * reddened Env drift on MEH-1770).
 */
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

const browser = await chromium.launch(
  EXE ? { executablePath: EXE } : undefined
);

let failed = 0;

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "he-IL",
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/he`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="hero-chips-row"]');

  const m = await page.evaluate(() => {
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {
        top: +(b.top + window.scrollY).toFixed(2),
        bottom: +(b.bottom + window.scrollY).toFixed(2),
        height: +b.height.toFixed(2),
        width: +b.width.toFixed(2),
      };
    };
    // The hero image band is the element carrying the Ken Burns layer.
    const kb = document.querySelector(".kenburns-right");
    const band = kb ? kb.parentElement : null;
    return {
      imageBand: r(band),
      pill: r(document.querySelector('[role="search"]')),
      chips: r(document.querySelector('[data-testid="hero-chips-row"]')),
      submit: r(document.querySelector('[data-testid="hero-search-submit"]')),
      trustLine: document.querySelectorAll('[data-testid="hero-trust-line"]').length,
      sealInHero: (() => {
        // Any accent-coloured seal glyph inside the hero zone.
        const hero = document.querySelector("section[aria-label]");
        if (!hero) return -1;
        return hero.querySelectorAll(".text-accent").length;
      })(),
    };
  });

  const imgBottom = m.imageBand?.bottom;
  const pillInside = m.pill && imgBottom != null && m.pill.bottom <= imgBottom;
  const chipsInside = m.chips && imgBottom != null && m.chips.bottom <= imgBottom;
  // Circle must not be tangent to the pill track on any side.
  const padTop = m.submit && m.pill ? +(m.submit.top - m.pill.top).toFixed(2) : null;
  const padBottom = m.submit && m.pill ? +(m.pill.bottom - m.submit.bottom).toFixed(2) : null;

  console.log(`\n=== viewport ${vp.name}px ===`);
  console.log(`image band bottom : ${imgBottom}`);
  console.log(`pill              : top=${m.pill?.top} bottom=${m.pill?.bottom} h=${m.pill?.height}`);
  console.log(`chips row         : top=${m.chips?.top} bottom=${m.chips?.bottom} h=${m.chips?.height}`);
  console.log(`submit circle     : h=${m.submit?.height} w=${m.submit?.width}`);
  console.log(`circle pad top/bot: ${padTop} / ${padBottom}`);
  console.log(`pill fully inside image  : ${pillInside}  (overhang ${m.pill ? (m.pill.bottom - imgBottom).toFixed(2) : "n/a"}px)`);
  console.log(`chips fully inside image : ${chipsInside} (overhang ${m.chips ? (m.chips.bottom - imgBottom).toFixed(2) : "n/a"}px)`);
  console.log(`hero-trust-line count    : ${m.trustLine}`);
  console.log(`.text-accent in hero     : ${m.sealInHero}`);

  if (!pillInside || !chipsInside) failed++;
  if (padTop !== null && (padTop <= 0 || padBottom <= 0)) failed++;

  await ctx.close();
}

await browser.close();
console.log(`\nRESULT: ${failed === 0 ? "PASS" : `FAIL (${failed} viewport-checks)`}`);
process.exit(failed === 0 ? 0 : 1);
