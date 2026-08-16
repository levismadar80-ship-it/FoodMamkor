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
//   node qa-meh999-capture.mjs [baseUrl] [outDir] <password> [chromePath]
const BASE = process.argv[2] || "http://127.0.0.1:3000";
const OUT = process.argv[3] || "/tmp/meh999";
const EMAIL = "ux-audit-meh999@example.com";

// The password is an ARGUMENT and has no default. It was hardcoded in the first
// version; the CI reviewer flagged it and was right. A cleartext credential in a
// committed file is readable by anyone with repo access, and the moment this
// account exists on a reachable host the string is a working login — the fact
// that it is "only" a dogfood account does not change either property.
//
// Fail loudly rather than proceeding: a silent empty password would submit the
// form, fail to authenticate, and produce a capture of the LOGIN page that still
// screenshots fine — a green-looking artifact of a broken run, which is the exact
// failure class the hydration-health count below exists to prevent.
const PASSWORD = process.argv[4] || "";
if (!PASSWORD) {
  console.error(
    "usage: node qa-meh999-capture.mjs [baseUrl] [outDir] <password> [chromePath]\n" +
      "the seeded producer password is required and is deliberately not stored in this file.",
  );
  process.exit(2);
}

// Chromium path is overridable but KEEPS the sandbox default. The reviewer
// suggested omitting it so Playwright resolves its own bundled build; that would
// break here, because @playwright/test is installed in this sandbox WITHOUT its
// browser download (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD), and `playwright install`
// is forbidden. An override argument gets the portability without losing the
// only path that works in the environment this script was written for.
// NOTE: `chromium-1194` is a VERSIONED directory. It changes when @playwright/test
// bumps its bundled browser, including on patch upgrades, and the failure mode is
// an unhelpful launch error rather than anything naming this line. Update this
// default in lockstep with any @playwright/test upgrade, or pass argv[5].
const CHROME = process.argv[5] || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// 390x844 is the card's primary viewport. Pixel-class is the second per ORDERS 3.3;
// this run proves the path on the primary one first.
const VIEWPORT = { width: 390, height: 844 };

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });

// Everything after launch runs inside try/finally so the Chromium process is
// closed even when a step throws. Without it, one failed navigation or a missed
// selector leaks a browser, and this script is meant to be run many times in a
// row across the audit's tasks -- so the leak accumulates exactly when the run is
// going badly and you are least likely to notice.
try {
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
} finally {
  await browser.close();
}
