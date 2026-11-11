/**
 * MEH-2927 (B3a) — the 1280 Chromium half of the step-change evidence.
 *
 * The 390 frames in qa-artifacts/MEH-2927/ cover the phone, where the finding
 * came from. Rule 38 gate 2 also asks for 1280, and the desktop case is not
 * merely "the phone but wider": the frames are shorter relative to the
 * viewport, so a step change that keeps the scroll offset may leave the new
 * step's heading visible anyway — which is exactly the state this measures.
 *
 * Captured from a LOCAL production build (`next start`). Vercel returns
 * `Ignored` for a commit with no `[preview]` token (deployment.md), so there
 * is no preview URL for this branch and the PR says so rather than citing one.
 *
 * Run from frontend/:  node e2e/qa-meh2927-step-scroll-1280.mjs
 *   QA_BASE_URL / PLAYWRIGHT_CHROMIUM_PATH override the target and the browser.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3100";
const OUT = process.argv[2] || "qa-artifacts/MEH-2927"; // repo root
mkdirSync(OUT, { recursive: true });

const CATEGORIES = [
  { id: 1, name: "ירקות", slug: "veg", icon: "🥬" },
  { id: 3, name: "לחמים ואפייה", slug: "bread", icon: "🍞" },
];

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-sandbox"],
});

const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  locale: "he-IL",
});
await ctx.route("**/categories*", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(CATEGORIES) }),
);
await ctx.route("**/cities*", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(["זכרון יעקב"]) }),
);

const page = await ctx.newPage();
await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
await page.locator('[data-testid="register-preflight-start"]').click();
await page.locator('[data-testid="register-account-name"]').fill("דנה בדיקה");
await page.locator('[data-testid="register-account-email"]').fill(`dana.1280.${Date.now()}@example.com`);
await page.locator('[data-testid="register-account-password"]').fill("Str0ngPassw0rd!x");

// Scroll to the bottom first — what a person filling the last field has done.
await page.locator('[data-testid="register-account-next"]').scrollIntoViewIfNeeded();
const beforeY = await page.evaluate(() => window.scrollY);
await page.screenshot({ path: `${OUT}/06-step1-bottom-1280.png` });

await page.locator('[data-testid="register-account-next"]').click();
await page.locator('[data-testid="register-frame-details"]').waitFor({ timeout: 15000 });
await page.waitForTimeout(400);
const afterY = await page.evaluate(() => window.scrollY);
const heading = await page.locator('[data-testid="register-hero-heading"]').boundingBox();
await page.screenshot({ path: `${OUT}/07-step2-on-entry-1280-AFTER.png` });

console.log(
  `1280x800 — scrollY before the advance: ${beforeY}, after: ${afterY}; ` +
    `step heading y=${heading ? heading.y.toFixed(0) : "not rendered"}`,
);
const ok = afterY === 0 && heading && heading.y >= 0;
console.log(ok ? "OK — the new step opens at its top" : "MISMATCH — the new step did not open at the top");

await browser.close();
process.exit(ok ? 0 : 1);
