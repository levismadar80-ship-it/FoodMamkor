/**
 * MEH-2070 (A-narrow) — does the decision actually hold on the real pages?
 *
 * Three questions, all measured against the REAL /he/admin/** pages in
 * Chromium against `next start`, every /api/** call fulfilled from fixtures
 * (house pattern — qa-meh2230-admin-kebab-viewport.mjs).
 *
 *   1. At 375, is the ACTIONS column on-screen? MEH-2230 measured the kebab
 *      triggers at x = -168 — outside the viewport on the INLINE axis, inside
 *      the table's overflow-x-auto — and deferred it as a layout decision.
 *      That is this ticket's decision, so x >= 0 is the assertion.
 *   2. Is the desktop-only banner ABSENT on the approvals queue (the one
 *      surface a phone must finish work on) and PRESENT elsewhere under /admin?
 *   3. Is it invisible at 1440, so the primary surface pays nothing?
 *
 * CONTROLS run FIRST and fail loudly. Without them "the banner is absent" and
 * "the page never rendered" are the same reading — the null that is also the
 * reassuring answer.
 *
 * Run: node e2e/qa-meh2070-admin-mobile.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE_URL || "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
// Repo-root relative: the harness is run from frontend/, and qa-artifacts/
// lives at the repo root where the 2 MB CI cap (MEH-1156) reads it.
const OUT = "../qa-artifacts/MEH-2070";
const ADMIN = { id: 1, email: "admin@example.com", role: "admin", name: "ספיר" };
const BANNER = '[data-testid="admin-desktop-only-notice"]';

const producers = Array.from({ length: 6 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  name: `חוות בדיקה ${i + 1}`,
  slug: `test-farm-${i + 1}`,
  city: "תל אביב",
  status: "approved",
  images: [], categories: [],
  created_at: "2026-08-01T10:00:00Z",
  submitted_for_review_at: "2026-08-01T10:00:00Z",
  business_days_waiting: 1,
  ambassador: false, risk_score: null, risk_reasoning: null, _completeness: 100,
}));

let failures = 0;
const check = (ok, label, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures += 1;
};

async function newCtx(browser, width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height }, locale: "he-IL",
    timezoneId: "Asia/Jerusalem", reducedMotion: "reduce",
  });
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const body =
      path === "/auth/me" ? ADMIN
      : path === "/admin/producers" ? producers
      : path === "/admin/dashboard" ? { stats: { pending_moderation_count: 0, pending_kashrut_requests: 0 } }
      : {};
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("token", "qa-fixture-token"));
  return { ctx, page };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });

  // ═══════════ 375 — the approvals queue ═══════════
  const m = await newCtx(browser, 375, 812);
  await m.page.goto(`${BASE}/he/admin/producers`, { waitUntil: "load" });
  await m.page.waitForTimeout(2500);

  // ---------- CONTROL: the table rendered rows at all ----------
  const triggers = m.page.locator('button[aria-haspopup="menu"][aria-label="פעולות נוספות"]');
  const nTriggers = await triggers.count();
  check(nTriggers > 0, `CONTROL: kebab triggers present (found ${nTriggers})`);
  if (nTriggers === 0) {
    console.log("\n⛔ CONTROL FAILED — the page rendered no rows. Every reading below is void.");
    await browser.close();
    process.exit(1);
  }

  // ---------- Q1: the actions column is ON-SCREEN at 375 ----------
  const tBox = await triggers.first().boundingBox();
  console.log(`INFO  first kebab trigger: x=${tBox.x.toFixed(0)} y=${tBox.y.toFixed(0)} w=${tBox.width.toFixed(0)}`);
  check(tBox.x >= 0, "actions column starts inside the viewport (was x=-168 before MEH-2070)", `x=${tBox.x.toFixed(0)}`);
  check(tBox.x + tBox.width <= 375, "actions column ENDS inside the viewport", `right=${(tBox.x + tBox.width).toFixed(0)}`);

  // ---------- Q1b: the scroll container no longer overflows ----------
  const overflow = await m.page.evaluate(() => {
    const el = document.querySelector("table")?.parentElement;
    return el ? { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth } : null;
  });
  console.log(`INFO  table scroller: scrollWidth=${overflow?.scrollWidth} clientWidth=${overflow?.clientWidth}`);
  check(overflow && overflow.scrollWidth <= overflow.clientWidth + 1,
    "table no longer overflows horizontally at 375",
    `${overflow?.scrollWidth} <= ${overflow?.clientWidth}`);

  // ---------- Q2a: NO banner on the approvals queue ----------
  check((await m.page.locator(BANNER).count()) === 0,
    "approvals queue carries NO desktop-only banner (it is the mobile-ready surface)");
  await m.page.screenshot({ path: `${OUT}/admin-producers-375.png`, fullPage: false });

  // ---------- Q2b: banner IS present on a non-approvals admin screen ----------
  await m.page.goto(`${BASE}/he/admin/settings`, { waitUntil: "load" });
  await m.page.waitForTimeout(2000);
  const bannerM = m.page.locator(BANNER);
  check((await bannerM.count()) === 1, "non-approvals admin screen shows the banner at 375");
  if (await bannerM.count()) {
    check(await bannerM.first().isVisible(), "banner is actually visible at 375");
    console.log(`INFO  banner copy: «${(await bannerM.first().innerText()).trim()}»`);
  }
  await m.page.screenshot({ path: `${OUT}/admin-settings-375.png`, fullPage: false });
  await m.ctx.close();

  // ═══════════ 1440 — the banner must not appear ═══════════
  const d = await newCtx(browser, 1440, 900);
  await d.page.goto(`${BASE}/he/admin/settings`, { waitUntil: "load" });
  await d.page.waitForTimeout(2000);
  const bannerD = d.page.locator(BANNER);
  // CONTROL: the desktop page rendered — otherwise "banner hidden" is vacuous.
  const sidebar = await d.page.locator("nav").count();
  check(sidebar > 0, `CONTROL: desktop admin chrome rendered (nav count ${sidebar})`);
  check((await bannerD.count()) === 0 || !(await bannerD.first().isVisible()),
    "banner is NOT visible at 1440 (md:hidden — desktop pays nothing)");
  await d.page.screenshot({ path: `${OUT}/admin-settings-1440.png`, fullPage: false });
  await d.ctx.close();

  await browser.close();
  console.log(`\n${failures === 0 ? "QA PASS" : `QA FAIL — ${failures} failure(s)`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
