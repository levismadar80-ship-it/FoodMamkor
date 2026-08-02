/**
 * MEH-1843 self-QA harness — the verified-badge popover body per doc type.
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1843-verified-popover.mjs [baseURL] [chromiumPath]
 * The backend is unreachable from the CC sandbox, so the producer API is
 * intercepted at the Playwright layer and served a fixture.
 * REUSES: frontend/e2e/qa-meh1577-delivery-fee.mjs (manual QA-harness pattern).
 *
 * WHY A VISUAL PASS AND NOT JUST THE VITEST CASES: the retired sentence was one
 * short line; every replacement is longer, and the popover is a fixed `w-64`.
 * The vitest suite asserts the STRINGS against the real ICU formatter but says
 * nothing about whether a longer Hebrew line wraps cleanly inside that width at
 * 375px. That is the question these shots exist to answer.
 *
 * It also PRINTS the rendered body text per case, so the run is readable as
 * evidence without opening the PNGs — a green screenshot job that nobody looks
 * at is exactly the "candidate baseline" trap.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = new URL("../../qa-artifacts/MEH-1843", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const base = {
  id: 123,
  name: "חוות הזית",
  slug: null,
  description: "שמן זית ומוצרי בוטיק מהחווה",
  city: "עתלית",
  phone: "0501234567",
  categories: [],
  images: [],
  is_approved: true,
  verification_tier: "verified",
  verified_at: "2026-06-05",
  locations: [],
  delivery_areas: [],
};

const browser = await chromium.launch({
  executablePath: process.argv[3] || "/opt/pw-browsers/chromium",
});

async function shot(name, viewport, producer) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (/\/api\/producers\/123$/.test(url)) return route.fulfill({ json: producer });
    if (/\/api\/producers(\?|$)/.test(url)) return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto(`${BASE}/producer/123`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1200);

  // Open the seal popover (it mounts its content only when open).
  const seal = page.locator('[data-badge="verified"]').first();
  await seal.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);

  const pop = page.getByTestId("badge-tooltip-verified").first();
  const text = await pop.textContent().catch(() => "ABSENT");
  // Overflow probe: the body must not exceed its own popover box.
  const overflow = await pop
    .evaluate((el) => el.scrollWidth > el.clientWidth + 1)
    .catch(() => null);
  console.log(`${name.padEnd(30)} overflow-x=${overflow}  body=${JSON.stringify(text)}`);

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  await ctx.close();
}

const M = { width: 375, height: 812 };
const D = { width: 1440, height: 900 };

const cases = [
  ["license", { verification_doc_type: "license" }],
  ["exemption", { verification_doc_type: "exemption" }],
  ["cosmetics", { verification_doc_type: "cosmetics" }],
  // Control: no date → the clause must vanish, not render an empty stub.
  ["license-nodate", { verification_doc_type: "license", verified_at: null }],
];

for (const [name, patch] of cases) {
  await shot(`${name}-375`, M, { ...base, ...patch });
}
await shot("license-1440", D, { ...base, verification_doc_type: "license" });

await browser.close();
