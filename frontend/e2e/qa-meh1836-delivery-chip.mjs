/**
 * MEH-1836 self-QA — the משלוח chip on the real staging surface, 375x667.
 *
 * Proves the nationwide fix end-to-end: a business with delivery_nationwide=true
 * and ZERO delivery_areas rows was invisible to this chip before the fix and
 * must be visible now.
 *
 * Run: node e2e/qa-meh1836-delivery-chip.mjs [baseURL]
 *
 * Sandbox notes (both are documented repo constraints, not guesses):
 *  - TLS is capped at 1.2 — the sandbox's Chromium offers a TLS-1.3 ClientHello
 *    that the Vercel edge drops, which surfaces as ERR_CONNECTION_CLOSED and
 *    looks like the site is down (.claude/rules/testing.md).
 *  - Vercel deployment protection is bypassed with the automation secret.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "https://staging.mehamakor.online";
const SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const OUT = new URL("../../qa-artifacts/MEH-1836", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--ssl-version-max=tls1.2"],
});

const ctx = await browser.newContext({
  viewport: { width: 375, height: 667 },
  locale: "he",
  extraHTTPHeaders: SECRET
    ? { "x-vercel-protection-bypass": SECRET, "x-vercel-set-bypass-cookie": "true" }
    : {},
});
const page = await ctx.newPage();

// Record every producers API call so the run reports what it actually hit
// rather than what it assumed — and so a blocked host is visible, not silent.
const api = [];
page.on("request", (r) => {
  if (/\/producers/.test(r.url())) api.push(r.url());
});
page.on("requestfailed", (r) => {
  if (/\/producers/.test(r.url()))
    console.log(`  REQUEST FAILED: ${r.url()} — ${r.failure()?.errorText}`);
});

const url = `${BASE}/he/producers`;
console.log(`→ ${url}`);
const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => {
  console.log(`  goto threw: ${e.message.split("\n")[0]}`);
  return null;
});
console.log(`  status=${resp?.status() ?? "n/a"}`);
await page.waitForTimeout(2500);

/** Names of the rendered producer cards, in DOM order. */
async function names() {
  return page
    .locator('[data-testid="producer-card"], article a[href*="/producer"], a[data-producer-card]')
    .evaluateAll((els) =>
      els
        .map((e) => (e.querySelector("h2,h3")?.textContent || e.textContent || "").trim().split("\n")[0])
        .filter(Boolean),
    );
}

// Dismiss the cookie banner — it overlays the result list, and a screenshot
// whose evidence is hidden behind a consent sheet proves nothing.
await page
  .getByRole("button", { name: /קבלו הכל|רק הכרחיים/ })
  .first()
  .click({ timeout: 5000 })
  .catch(() => console.log("  (no cookie banner to dismiss)"));
await page.waitForTimeout(600);

const before = await names();
console.log(`  cards BEFORE chip: ${before.length}`);
await page.screenshot({ path: `${OUT}/producers-375-before.png` });

// The chip row is horizontally scrollable; getByRole finds it regardless.
const chip = page.getByRole("button", { name: /משלוח/ }).first();
const chipCount = await chip.count().catch(() => 0);
console.log(`  משלוח chip found: ${chipCount > 0}`);
if (chipCount > 0) {
  await chip.click().catch((e) => console.log(`  chip click failed: ${e.message.split("\n")[0]}`));
  await page.waitForTimeout(3000);
}

const after = await names();
console.log(`  cards AFTER chip:  ${after.length}`);
// Scroll the result list into frame — the nationwide business's NAME is the
// evidence, not the chip's active state.
await page
  .locator('[data-testid="producer-card"], article a[href*="/producer"]')
  .first()
  .scrollIntoViewIfNeeded()
  .catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/producers-375-delivery-on.png` });
await page.screenshot({ path: `${OUT}/producers-375-delivery-on-full.png`, fullPage: true });

console.log(`\n  API calls seen (${api.length}):`);
[...new Set(api)].slice(0, 8).forEach((u) => console.log(`    ${u}`));
console.log(`\n  BEFORE: ${JSON.stringify(before.slice(0, 20))}`);
console.log(`  AFTER:  ${JSON.stringify(after.slice(0, 20))}`);

await ctx.close();
await browser.close();
