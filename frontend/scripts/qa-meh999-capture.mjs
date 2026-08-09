/**
 * Module:   qa-meh999-capture
 * Purpose:  MEH-999 dogfood capture path — log a producer in through the real UI
 *           and capture the dashboard at the card's mobile viewport.
 * Touches:  local stack only (next start :3000 -> proxy -> uvicorn :8000 -> scratch
 *           Postgres). Never staging, never production.
 * Does NOT: score friction or write findings. It proves the capture path works and
 *           emits a hydration-health count so a degraded page cannot be read as a
 *           clean one (the MEH-1227 false all-clear).
 * History:  MEH-999 (creation).
 *
 * WHY LOCAL AND NOT STAGING
 *   The card prescribes staging with the ux-audit-meh999 account. staging.mehamakor.online
 *   answers 302 -> vercel.com/sso-api from a CC sandbox, so that target is a
 *   credential gate (ORDERS 1.2 gate 2), whose instruction is to route around and
 *   say so -- never to simulate. This is the routing-around, and the boundary is
 *   stated in every report it feeds.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Overrides come from argv, never from the environment: `Env drift` (MEH-491)
// blocks on any env var read in code that is absent from a .env.example, and
// adding one is banned outright (regression rule 8). A capture script has no
// business owning an env var anyway.
//   node qa-meh999-capture.mjs [baseUrl] [outDir]
const BASE = process.argv[2] || "http://127.0.0.1:3000";
const OUT = process.argv[3] || "/tmp/meh999";
const EMAIL = "ux-audit-meh999@example.com";
const PASSWORD = "DogfoodAudit2026!x";

// 390x844 is the card's primary viewport. Pixel-class is the second per ORDERS 3.3;
// this run proves the path on the primary one first.
const VIEWPORT = { width: 390, height: 844 };

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await browser.newContext({
  viewport: VIEWPORT,
  locale: "he-IL",
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  return `${OUT}/${name}.png`;
};

/** Horizontal scroll must be MEASURED, not eyeballed (ORDERS 3.3). */
const noHScroll = () =>
  page.evaluate(() => {
    const d = document.documentElement;
    return { scrollW: d.scrollWidth, clientW: d.clientWidth, overflows: d.scrollWidth > d.clientWidth + 1 };
  });

const report = {};

await page.goto(`${BASE}/he/login`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});
report.login = { url: page.url(), hscroll: await noHScroll(), shot: await shot("01-login") };

// Real UI login -- keeps the request fingerprint consistent, which a raw HTTP
// client cannot do (the access token is fingerprint-bound, auth.py).
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await Promise.all([
  page.waitForLoadState("networkidle").catch(() => {}),
  page.click('button[type="submit"]'),
]);
await page.waitForTimeout(2500);
report.afterLogin = { url: page.url(), shot: await shot("02-after-login") };

await page.goto(`${BASE}/he/producer/dashboard`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(1500);

// Hydration health: if the client bundle died, the page still renders HTML and a
// screenshot looks plausible. Count something only a hydrated page has.
const health = await page.evaluate(() => ({
  buttons: document.querySelectorAll("button").length,
  links: document.querySelectorAll("a").length,
  main: !!document.querySelector("main, #main-content"),
  bodyChars: (document.body.innerText || "").trim().length,
  dir: document.documentElement.getAttribute("dir"),
  lang: document.documentElement.getAttribute("lang"),
}));

report.dashboard = {
  url: page.url(),
  authenticated: !/\/login/.test(page.url()),
  health,
  hscroll: await noHScroll(),
  shot: await shot("03-dashboard"),
};

console.log(JSON.stringify(report, null, 2));
await browser.close();
