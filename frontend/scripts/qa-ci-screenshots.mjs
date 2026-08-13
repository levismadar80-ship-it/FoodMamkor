/**
 * Module:   qa-ci-screenshots
 * Purpose:  MEH-1516 — capture mobile + desktop screenshots of the core public
 *           routes on every PR, so a reviewer looks at images in the PR
 *           instead of opening a phone or a Vercel preview.
 * Touches:  Nothing. Read-only navigation against the CI runner's own
 *           `next start` server (already up for the E2E suite), which proxies
 *           `/api/*` to the real Railway staging backend — same as every
 *           unmocked spec under frontend/e2e/flows/**.
 * Does NOT: select routes per-PR from the diff. This is a FIXED core-route
 *           set (Phase 0 decision, MEH-1516 comment thread) — simpler than
 *           diff→route mapping, which does not exist anywhere in this repo
 *           and could silently under-capture. If a PR needs a route this list
 *           doesn't cover, that is a case for a dedicated qa-*.mjs script
 *           (see qa-meh1872-capture.mjs for the pattern), not this one.
 * Usage:    node scripts/qa-ci-screenshots.mjs
 *           Requires `next start` already serving on $QA_BASE_URL
 *           (default http://localhost:3000).
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE_URL || "http://localhost:3000";
const OUT = "qa-artifacts/ci-screenshots";

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

// Fixed core-route set. No locale prefix — `he` is the default under
// `localePrefix: "as-needed"` (frontend/i18n/routing.js:6).
const ROUTES = [
  { path: "/", file: "home" },
  { path: "/producers", file: "producers" },
  { path: "/map", file: "map" },
  // ruach-hasadeh is the seeded flagship demo (DEMO_SLUG,
  // backend/scripts/seed_demo_business.py) — always present on staging.
  { path: "/ruach-hasadeh", file: "producer-detail" },
  { path: "/login", file: "login" },
  { path: "/register", file: "register" },
];

async function shot(browser, { path, file, vp }) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "he-IL",
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("cookie_consent", "accepted");
  });
  const outPath = `${OUT}/${file}-${vp.name}.png`;
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`  captured ${file}-${vp.name}.png`);
    return { file, vp: vp.name, path: outPath, ok: true };
  } catch (err) {
    console.log(`  FAILED ${file}-${vp.name}.png — ${err.message}`);
    return { file, vp: vp.name, path: outPath, ok: false, error: err.message };
  } finally {
    await context.close();
  }
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });

  const results = [];
  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      results.push(await shot(browser, { ...route, vp }));
    }
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} captured — ${OUT}`);
  if (failed.length) {
    console.log(`${failed.length} FAILED: ${failed.map((f) => `${f.file}-${f.vp}`).join(", ")}`);
  }

  // Manifest for the workflow step to read back without re-parsing stdout.
  const { writeFileSync } = await import("node:fs");
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify(results, null, 2));

  // Never fail the job — this is review evidence, not a gate (matches the
  // acceptance criteria: "no change to pass/fail semantics").
  process.exit(0);
})();
