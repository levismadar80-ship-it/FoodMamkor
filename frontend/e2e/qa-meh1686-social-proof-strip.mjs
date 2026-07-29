/**
 * MEH-1686 self-QA harness — social-proof strip geometry + the Header
 * glassmorphism measurement, run against a real browser (the vitest guards run
 * in jsdom, which cannot see computed padding, border colour, or a
 * backdrop-filter compositing result).
 *
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1686-social-proof-strip.mjs [baseURL] [chromiumPath]
 *
 * Probes, at 375 + 1440:
 *   #1 the /stats strip's computed padding — the ticket's py-4 → py-8
 *   #2 the strip's computed top border — the ticket asked for a divider; this
 *      measures whether one was already there (it was)
 *   #3 the Header pill's backdrop-filter, captured with the blur ON and again
 *      with `backdrop-filter: none` forced, so "blur is invisible on cream"
 *      is decided by a pixel delta instead of by assumption. Forcing the
 *      property off is exactly what deleting the `backdrop-blur-md` utility
 *      does — the `supports-[backdrop-filter]:` opacity gate tests *support*,
 *      not usage, so the translucency survives either way.
 *
 * REUSES: frontend/e2e/qa-meh1684-hero-search-zone.mjs (manual QA-harness
 * pattern — argv baseURL + chromiumPath, never process.env: the MEH-491
 * env-drift gate blocks undocumented env reads).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = new URL("../../qa-artifacts/MEH-1686", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

// MEH-1686: /stats is mocked so the LOADED branch renders deterministically.
// The strip's two data-dependent numbers would otherwise be 0 in a sandbox
// with no backend, which renders the skeleton branch instead of the subject.
const STATS = { producers_count: 42, categories_count: 9 };

const browser = await chromium.launch({
  executablePath: process.argv[3] || "/opt/pw-browsers/chromium",
});

const results = [];
const record = (label, value) => {
  results.push(`${label}: ${JSON.stringify(value)}`);
  console.log(label, value);
};

for (const [name, viewport] of [
  ["375", { width: 375, height: 900 }],
  ["1440", { width: 1440, height: 950 }],
]) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  await page.route(/\/stats(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STATS),
    })
  );
  await page.goto(BASE + "/he", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1500);

  // ── #1 + #2 — strip geometry
  const strip = page.locator("section.border-y").first();
  const metrics = await strip.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
      borderTopWidth: cs.borderTopWidth,
      borderTopColor: cs.borderTopColor,
      borderBottomWidth: cs.borderBottomWidth,
      height: Math.round(el.getBoundingClientRect().height),
      lines: [...el.querySelectorAll("p")].map((p) => p.textContent.trim()),
    };
  });
  record(`strip-${name}`, metrics);
  await strip.screenshot({ path: `${OUT}/strip-${name}.png` });
  await page.screenshot({ path: `${OUT}/home-${name}.png` });

  // ── #3 — Header pill, at rest (scrollY < 60) and scrolled, blur on vs off
  const pill = page.locator("header nav").first();
  for (const [state, scrollY] of [
    ["rest", 0],
    ["scrolled", 600],
  ]) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(700);
    const style = await pill.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { backdropFilter: cs.backdropFilter, background: cs.backgroundColor };
    });
    record(`pill-${state}-${name}`, style);
    await pill.screenshot({ path: `${OUT}/pill-${state}-${name}.png` });
  }

  await ctx.close();
}

fs.writeFileSync(`${OUT}/probe-results.txt`, results.join("\n") + "\n");
await browser.close();
