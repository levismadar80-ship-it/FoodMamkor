/**
 * MEH-2405 self-QA — dashboard kashrut card: the quiet row that tells the
 * owner an approved badge has no certificate behind it (so it is plain text,
 * not tappable, on the public page — MEH-1672).
 *
 * Drives the REAL dashboard edit page against a `next start` server on :3100,
 * with every /api/** call fulfilled from fixtures. Captures 375px + 1440px:
 *   1-missing  — badge approved, no cert on file → one row per badge (two here)
 *   2-covered  — badge approved, approved request carries a cert → no row
 *
 * Not part of the Playwright suite; run manually:
 *   node e2e/qa-meh2405-kashrut-cert-nudge.mjs
 *
 * REUSES: e2e/qa-meh2264-special-hours.mjs (route-fixture + dual-viewport harness).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2405";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium";

const PROFILE = {
  id: 42,
  name: "מחלבת השדה",
  slug: "machlevet-hasade",
  status: "approved",
  is_approved: true,
  categories: [{ id: 2, name: "מחלבות" }],
  products: [],
  images: [],
  kashrut_badges: ["badatz", "chalak"],
  kashrut_verified_at: "2026-10-01T09:00:00Z",
  kashrut_expires_at: null,
};
const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה" };
const COVERED = [
  { id: "a1", producer_id: 42, badge_code: "badatz", status: "approved", cert_url: "https://x/c1.jpg", created_at: "2026-10-01T09:00:00Z" },
  { id: "a2", producer_id: 42, badge_code: "chalak", status: "approved", cert_url: "https://x/c2.jpg", created_at: "2026-10-01T09:00:00Z" },
];

const failures = [];
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

async function open(browser, width, height, requests) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL", reducedMotion: "reduce" });
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const body =
      path === "/auth/me" ? USER
      : path === "/producers/me" ? PROFILE
      : path === "/producers/me/dashboard" ? { producer: PROFILE }
      : path === "/producers/me/kashrut-requests" ? requests
      : path === "/producers/me/analytics" ? {}
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("token", "qa-fixture-token");
    localStorage.setItem("cookieConsent", "all");
  });
  await page.goto(`${BASE}/producer/dashboard/edit?group=trust`, { waitUntil: "load" });
  // The trust group lands collapsed; open the «אישורים ותעודות» card.
  const header = page.getByRole("button", { name: /אישורים ותעודות/ }).first();
  await header.waitFor({ timeout: 30_000 });
  if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
  await page.locator("#kashrut").waitFor({ timeout: 30_000 });
  await page.locator("#kashrut").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  return { ctx, page };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const [label, width, height] of [["375", 375, 812], ["1440", 1440, 1000]]) {
    {
      const { ctx, page } = await open(browser, width, height, []);
      const rows = page.getByTestId("kashrut-missing-cert");
      await rows.first().waitFor({ timeout: 10_000 }).catch(() => {});
      const texts = await rows.allTextContents();
      check(`[${label}] missing: two rows`, texts.length === 2, texts.join(" | "));
      await page.locator("#kashrut").screenshot({ path: `${OUT}/kashrut-${label}-1-missing.png` });
      await ctx.close();
    }
    {
      const { ctx, page } = await open(browser, width, height, COVERED);
      await page.waitForTimeout(500);
      const n = await page.getByTestId("kashrut-missing-cert").count();
      check(`[${label}] covered: no row`, n === 0, `${n} rows`);
      await page.locator("#kashrut").screenshot({ path: `${OUT}/kashrut-${label}-2-covered.png` });
      await ctx.close();
    }
  }
  await browser.close();
  if (failures.length) {
    console.log(`\n${failures.length} FAIL`);
    process.exit(1);
  }
  console.log("\nall checks passed");
}
main();
