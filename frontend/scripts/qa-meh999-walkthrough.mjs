/**
 * Module:   qa-meh999-walkthrough
 * Purpose:  MEH-999 dogfood audit, chunk 1 — walk the producer lifecycle's first
 *           three tasks at 390x844 and MEASURE convenience, not correctness.
 * Touches:  local stack only (next :3000 -> proxy -> uvicorn :8000 -> scratch
 *           Postgres). Never staging, never production.
 * Does NOT: judge. Every number here is measured; the severity call belongs to the
 *           report, and the report must label it as CC's judgement rather than a
 *           user's. This file emits facts only.
 * Related:  frontend/scripts/qa-meh999-capture.mjs (the proven capture path this
 *           extends), docs/UX-AUDIT-PLAYBOOK.md (severity scale).
 * History:  MEH-999 (creation).
 *
 * WHAT "CONVENIENCE" MEANS AS A NUMBER
 *   The card asks for taps-to-action, scrolls-to-action, fields below the fold and
 *   whether a submit tells the owner what happens next. Those are countable. The
 *   feeling of using it is not, and this script does not pretend otherwise.
 *
 *   usage: node qa-meh999-walkthrough.mjs [baseUrl] [outDir] <password> [chromePath]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const OUT = process.argv[3] || "/tmp/meh999-walk";
const PASSWORD = process.argv[4] || "";
// chromium-#### is versioned and moves when @playwright/test upgrades.
const CHROME = process.argv[5] || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const EMAIL = "ux-audit-meh999@example.com";

if (!PASSWORD) {
  console.error("usage: node qa-meh999-walkthrough.mjs [baseUrl] [outDir] <password> [chromePath]");
  process.exit(2);
}

const VIEWPORT = { width: 390, height: 844 };
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
try {
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "he-IL", deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  /** Taps are counted by instrumenting the click, so the number cannot drift from what ran. */
  let taps = 0;
  const tap = async (locator) => { taps += 1; await locator.click(); };
  const resetTaps = () => { taps = 0; };

  const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); return `${n}.png`; };

  /** Viewport-level shot: the ONLY way to tell a fixed overlay from a fullPage artifact. */
  const shotViewport = async (n) => {
    await page.screenshot({ path: `${OUT}/${n}-viewport.png`, fullPage: false });
    return `${n}-viewport.png`;
  };

  const metrics = () =>
    page.evaluate(() => {
      const d = document.documentElement;
      return {
        pageHeight: d.scrollHeight,
        viewportH: window.innerHeight,
        screensToScroll: +(d.scrollHeight / window.innerHeight).toFixed(2),
        hScroll: d.scrollWidth > d.clientWidth + 1,
        inputs: document.querySelectorAll("input,select,textarea").length,
        buttons: document.querySelectorAll("button").length,
      };
    });

  /** Distance from the top of the page to an element, in viewport-heights. */
  const foldDepth = (sel) =>
    page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const top = el.getBoundingClientRect().top + window.scrollY;
      return { px: Math.round(top), screens: +(top / window.innerHeight).toFixed(2) };
    }, sel);

  const report = { measuredAt: null, tasks: {} };

  // ---------------------------------------------------------------- TASK 1
  // Register a producer. Fresh anonymous context state -- this is the first
  // screen a business owner ever sees.
  resetTaps();
  const t1Start = Date.now();
  await page.goto(`${BASE}/he/register/producer`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const t1m = await metrics();
  const t1Submit = await foldDepth('button[type="submit"]');
  report.tasks.register = {
    url: page.url(),
    loadMs: Date.now() - t1Start,
    ...t1m,
    submitButtonAt: t1Submit,
    requiredFieldsVisibleWithoutScroll: await page.evaluate(() => {
      const vh = window.innerHeight;
      const all = [...document.querySelectorAll("input,select,textarea")];
      return all.filter((e) => e.getBoundingClientRect().top < vh).length;
    }),
    shot: await shot("t1-register"),
    shotViewport: await shotViewport("t1-register"),
  };

  // ---------------------------------------------------------------- LOGIN
  resetTaps();
  await page.goto(`${BASE}/he/login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  // NOT button[type="submit"] -- /login has TWO of them: the login button and the
  // footer newsletter signup (aria-label "להירשם"). page.click() is non-strict and
  // silently takes the first DOM match, which is how the sibling capture script
  // gets away with the loose selector; locator.click() is strict and surfaced it.
  // Pinned to the testid so a DOM-order change cannot silently retarget the login.
  await tap(page.locator('[data-testid="login-submit"]'));
  await page.waitForTimeout(2500);
  report.tasks.login = { tapsToSubmit: taps, landedOn: page.url() };

  // ---------------------------------------------------------------- TASK 2
  // Complete profile. The card's question is how far the owner travels from the
  // dashboard overview to the first editable field.
  resetTaps();
  const t2Start = Date.now();
  await page.goto(`${BASE}/he/producer/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const overview = await metrics();

  // Find the edit affordance by visible text rather than a testid, because the
  // owner finds it by reading, and a testid would prove nothing about discoverability.
  const editTab = page.getByRole("link", { name: /עריכה/ }).first();
  const editTabAlt = page.getByRole("button", { name: /עריכה/ }).first();
  let editReachable = false;
  if (await editTab.count()) { await tap(editTab); editReachable = true; }
  else if (await editTabAlt.count()) { await tap(editTabAlt); editReachable = true; }
  await page.waitForTimeout(2000);

  const t2m = await metrics();
  report.tasks.completeProfile = {
    overviewScreens: overview.screensToScroll,
    overviewHScroll: overview.hScroll,
    editReachable,
    tapsFromOverviewToEdit: taps,
    editUrl: page.url(),
    ...t2m,
    firstInputAt: await foldDepth("input,textarea,select"),
    shot: await shot("t2-edit"),
    shotViewport: await shotViewport("t2-edit"),
  };

  // ---------------------------------------------------------------- TASK 3
  // Add a product. Measured as: can the owner reach a product-add affordance,
  // and how many taps from the dashboard overview.
  resetTaps();
  await page.goto(`${BASE}/he/producer/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const productAffordances = await page.evaluate(() => {
    const hit = [];
    for (const el of document.querySelectorAll("a,button")) {
      const t = (el.innerText || "").trim();
      if (/מוצר|קטלוג/.test(t)) hit.push({ tag: el.tagName, text: t.slice(0, 40), href: el.getAttribute("href") });
    }
    return hit;
  });
  report.tasks.addProduct = {
    affordancesFoundOnOverview: productAffordances.length,
    affordances: productAffordances.slice(0, 8),
    shot: await shot("t3-overview-products"),
  };

  // -------------------------------------------------- COOKIE-BANNER QUESTION
  // Open item: the banner appears mid-page in fullPage captures. fullPage renders
  // a fixed element at its scroll position, so that alone cannot distinguish a
  // real overlap from a capture artifact. Measure position:fixed directly.
  report.cookieBanner = await page.evaluate(() => {
    const texts = [...document.querySelectorAll("div,section,aside")].filter((e) =>
      /עוגיות|cookie/i.test((e.innerText || "").slice(0, 200)),
    );
    if (!texts.length) return { present: false };
    const el = texts[0];
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      present: true,
      position: cs.position,
      zIndex: cs.zIndex,
      inViewport: r.top < window.innerHeight && r.bottom > 0,
      rect: { top: Math.round(r.top), height: Math.round(r.height) },
    };
  });

  report.measuredAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
