/**
 * MEH-1643 self-QA harness — hero delivery-CTA screenshots + interaction probe.
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1643-hero-delivery-cta.mjs [baseURL] [chromiumPath]
 * Captures 375px + 1440px in both label states (no city / saved user_city)
 * and verifies the no-city click opens the LocationModal.
 * REUSES: frontend/e2e/qa-meh1619-visual-noop.mjs (manual QA-harness pattern).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = new URL("../../qa-artifacts/MEH-1643", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

// CC-sandbox chromium path by default (see .claude/rules/testing.md — the
// sandbox pre-installs at /opt/pw-browsers); override via argv[3], NOT an env
// var (the MEH-491 env-drift gate blocks undocumented process.env reads).
const browser = await chromium.launch({ executablePath: process.argv[3] || "/opt/pw-browsers/chromium" });

async function shot(name, viewport, city) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  if (city) {
    await page.addInitScript((c) => localStorage.setItem("user_city", c), city);
  }
  await page.goto(BASE + "/", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1500);
  const cta = page.getByTestId("hero-delivery-cta");
  await cta.scrollIntoViewIfNeeded().catch(() => {});
  console.log(name, "CTA text:", JSON.stringify(await cta.textContent().catch(() => "MISSING")));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  await ctx.close();
}

await shot("home-375-no-city", { width: 375, height: 812 }, null);
await shot("home-1440-no-city", { width: 1440, height: 900 }, null);
await shot("home-375-with-city", { width: 375, height: 812 }, "חיפה");
await shot("home-1440-with-city", { width: 1440, height: 900 }, "חיפה");

// Interaction probe: no saved city → CTA click must open the LocationModal.
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: "he" });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(1000);
await page.getByTestId("hero-delivery-cta").click();
await page.waitForTimeout(800);
const modalCount = await page.locator('[role="dialog"]').count();
const popularVisible = await page.locator("text=ערים פופולריות").isVisible().catch(() => false);
console.log("modal opened after CTA click (no city):", modalCount > 0 || popularVisible);
await page.screenshot({ path: `${OUT}/home-375-modal-open.png`, fullPage: false });
await ctx.close();

await browser.close();
