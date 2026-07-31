/**
 * qa-meh1690-shots.mjs — MEH-1690 PR screenshots + render-level absence checks.
 *
 * Purpose:  Capture the hero zone at 375 and 1440 for the PR, and assert the
 *           removal spec against the RENDERED DOM rather than the source — a
 *           grep proves the string left the file, not that it left the page.
 * Does NOT: measure geometry (qa-meh1690-hero.mjs) or touch VRT baselines
 *           (parity.spec.ts, runner-generated).
 * History:  MEH-1690 (creation).
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "../qa-artifacts/MEH-1690";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE });
let bad = 0;

for (const vp of [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "he-IL",
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/he`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="hero-chips-row"]');

  const checks = await page.evaluate(() => {
    const hero = document.querySelector("section[aria-label]");
    const heroText = hero ? hero.textContent : "";
    return {
      trustClaimInHero: (heroText.match(/כל בית עסק נבדק ואושר ידנית/g) || []).length,
      sealInHero: hero ? hero.querySelectorAll(".text-accent, svg.text-accent").length : -1,
      howItWorksInHero: (heroText.match(/איך זה עובד/g) || []).length,
      telAvivInChips: (
        (document.querySelector('[data-testid="hero-chips-row"]')?.textContent || "")
          .match(/תל אביב/g) || []
      ).length,
      // The accessible name must NOT be the placeholder (AC: label or aria-label).
      inputAccName: (() => {
        const el = document.querySelector('[data-testid="hero-search"]');
        if (!el) return null;
        const lbl = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        return {
          fromLabel: lbl ? lbl.textContent.trim() : null,
          ariaLabel: el.getAttribute("aria-label"),
          placeholder: el.getAttribute("placeholder"),
        };
      })(),
    };
  });

  console.log(`\n=== RENDERED, viewport ${vp.name}px ===`);
  console.log(`trust-claim string in hero zone : ${checks.trustClaimInHero}`);
  console.log(`accent seal glyph in hero zone  : ${checks.sealInHero}`);
  console.log(`"איך זה עובד" in hero zone       : ${checks.howItWorksInHero}`);
  console.log(`"תל אביב" in hero chips row      : ${checks.telAvivInChips}`);
  console.log(`input accessible name           : label=${JSON.stringify(checks.inputAccName?.fromLabel)} aria-label=${JSON.stringify(checks.inputAccName?.ariaLabel)}`);
  console.log(`input placeholder (must differ) : ${JSON.stringify(checks.inputAccName?.placeholder)}`);

  const accName = checks.inputAccName?.fromLabel || checks.inputAccName?.ariaLabel;
  const accOk = !!accName && accName !== checks.inputAccName?.placeholder;
  console.log(`acc-name present AND != placeholder : ${accOk}`);

  if (
    checks.trustClaimInHero !== 0 ||
    checks.sealInHero !== 0 ||
    checks.howItWorksInHero !== 0 ||
    checks.telAvivInChips !== 0 ||
    !accOk
  ) {
    bad++;
  }

  await page.screenshot({ path: `${OUT}/home-hero-${vp.name}.png` });
  await ctx.close();
}

await browser.close();
console.log(`\nRESULT: ${bad === 0 ? "PASS" : `FAIL (${bad})`}`);
process.exit(bad === 0 ? 0 : 1);
