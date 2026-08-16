/**
 * MEH-1842 self-QA — the two MEH-1830 remnants.
 *
 * Drives the REAL dashboard pages in Chromium against a `next start` server,
 * with every /api/** call fulfilled from fixtures (the CC sandbox has no
 * backend and cannot reach Railway — CLAUDE.md "Known Bug Patterns").
 *
 * Two things under test:
 *   1. HUB — the availability radiogroup's COMPUTED ACCESSIBLE NAME is exactly
 *      "מצב נוכחי". This is the assertion that matters; that the attribute
 *      changed from aria-label to aria-labelledby is not evidence on its own.
 *      Playwright's getByRole(name:) matches the computed name, so a resolving
 *      locator IS the accessibility-tree check.
 *   2. EDIT TAB — the order-window empty state renders the new copy, and the
 *      retired "חלון הזמנות" phrasing is gone from it.
 *
 * WHY THE HEADING TEXT IS WRAPPED IN A SPAN (the non-obvious half): the <p>
 * holding the heading ALSO holds InfoTooltip, whose trigger is a button with
 * its own aria-label. Pointing aria-labelledby at the <p> folds that button's
 * name into the computation, giving "מצב נוכחי מה ההבדל בין המצבים?" — which
 * the exact-name lookup rejects. `--prove-p` reproduces exactly that, so the
 * assertion is shown discriminating rather than asserted to.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh1842-times-remnants.mjs
 *                node e2e/qa-meh1842-times-remnants.mjs --prove-p
 *
 * REUSES: e2e/qa-meh1830-times-copy.mjs (route-fixture + dual-viewport harness).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-1842";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// When set, re-point the label at the <p> (heading + InfoTooltip) in the live
// DOM to show the exact-name assertion going red. Nothing is rebuilt.
const PROVE_P = process.argv.includes("--prove-p");

const EXPECTED_GROUP_NAME = "מצב נוכחי";
const EMPTY_NEW = "עוד לא הגדרת מתי את מקבלת הזמנות. סמני ימים ושעות — והם יופיעו בעמוד העסק שלך.";
const EMPTY_RETIRED = "לא הגדרת חלון הזמנות";

const PROFILE = {
  id: 42,
  name: "מאפיית שדה",
  slug: "sade-bakery",
  status: "approved",
  is_approved: true,
  categories: [{ id: 2, name: "לחמים ואפייה" }],
  products: [],
  images: [],
  has_physical_location: true,
  offers_delivery: false,
  opening_hours: "Sun-Thu 09:00-18:00",
  // null = the opt-in default, which is the empty state this ticket re-words.
  order_window: null,
  availability_state: "accepting_orders",
};

const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה" };

const results = [];
function check(label, pass, detail = "") {
  results.push({ label, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function newPage(browser, width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    if (!req.url().includes("/api/")) return route.continue();
    const path = new URL(req.url()).pathname.replace(/^\/api/, "");
    if (req.method() !== "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    const body =
      path === "/auth/me" ? USER
      : path === "/producers/me" ? PROFILE
      : path === "/producers/me/dashboard" ? { producer: PROFILE }
      : path === "/producers/me/analytics" ? {}
      : [];
    return route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify(body),
    });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("token", "qa-fixture-token"));
  return { ctx, page };
}

async function dismissCookies(page) {
  const accept = page.getByRole("button", { name: "קבלו הכל" });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await page.waitForTimeout(300);
  }
}

/** 1 — hub: the radiogroup's computed accessible name. */
async function checkAccessibleName(browser, width, tag) {
  const { ctx, page } = await newPage(browser, width, 812);
  await page.goto(`${BASE}/producer/dashboard`, { waitUntil: "networkidle" });
  await dismissCookies(page);
  await page.waitForTimeout(400);

  if (PROVE_P) {
    // The rejected implementation: label from the <p>, which also holds the
    // InfoTooltip button. Applied in the live DOM so no rebuild is needed.
    await page.evaluate(() => {
      const span = document.getElementById("availability-heading");
      const p = span?.closest("p");
      const group = document.querySelector('[role="radiogroup"]');
      if (p && group) {
        span.removeAttribute("id");
        p.id = "availability-heading-p";
        group.setAttribute("aria-labelledby", "availability-heading-p");
      }
    });
    await page.waitForTimeout(150);
  }

  // getByRole(name:) matches the COMPUTED accessible name, so this locator
  // resolving is the accessibility-tree assertion — not a DOM attribute read.
  const byRole = page.getByRole("radiogroup", { name: EXPECTED_GROUP_NAME, exact: true });
  const resolved = await byRole.count();
  check(
    `[${tag}] getByRole('radiogroup', { name: '${EXPECTED_GROUP_NAME}' }) resolves`,
    resolved === 1,
    `matched ${resolved}`,
  );

  // Report what the tree actually computed, so a failure names the cause.
  // (page.accessibility was removed in current Playwright; ariaSnapshot is the
  // supported way to read the resolved role/name off the element.)
  const aria = await page.locator('[role="radiogroup"]').ariaSnapshot().catch((e) => `(unavailable: ${e.message})`);
  console.log(`     aria snapshot (first line): ${String(aria).split("\n")[0]}`);

  // The attribute swap itself — necessary, not sufficient.
  const attrs = await page.evaluate(() => {
    const el = document.querySelector('[role="radiogroup"]');
    return el ? { label: el.getAttribute("aria-label"), labelledby: el.getAttribute("aria-labelledby") } : null;
  });
  check(`[${tag}] no aria-label left on the radiogroup`, attrs?.label === null,
        `aria-label=${JSON.stringify(attrs?.label ?? null)}`);

  // Pills untouched (explicitly out of scope).
  const body = await page.innerText("body");
  for (const pill of ["פתוח להזמנות", "זמין היום", "עמוס השבוע", "בהפסקה"]) {
    check(`[${tag}] pill unchanged: ${pill}`, body.includes(pill));
  }

  fs.mkdirSync(OUT, { recursive: true });
  if (!PROVE_P) await page.screenshot({ path: `${OUT}/hub-availability-${tag}.png`, fullPage: false });
  await ctx.close();
}

/** 2 — edit tab: the order-window empty state, at 375px. */
async function checkEmptyState(browser, width, tag) {
  const { ctx, page } = await newPage(browser, width, 812);
  await page.goto(`${BASE}/producer/dashboard/edit?group=location`, { waitUntil: "networkidle" });
  await dismissCookies(page);

  await page.getByRole("button", { name: /מתי מקבלים הזמנות/ }).first().click();
  await page.waitForTimeout(400);
  await page.locator("#order-window").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  const card = await page.locator("#order-window").innerText().catch(() => "");
  check(`[${tag}] empty-state new copy verbatim`, card.includes(EMPTY_NEW));
  check(`[${tag}] retired "${EMPTY_RETIRED}" absent from the card`, !card.includes(EMPTY_RETIRED));

  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/order-window-empty-${tag}.png`, fullPage: false });
  await ctx.close();
}

const browser = await chromium.launch({ executablePath: CHROME });
console.log(`MEH-1842 self-QA${PROVE_P ? "  [--prove-p: label from the <p>, expect RED]" : ""}\n`);
console.log("hub — accessible name:");
await checkAccessibleName(browser, 375, "375");
if (!PROVE_P) {
  console.log("\nedit tab — order-window empty state:");
  await checkEmptyState(browser, 375, "375");
}
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
if (failed.length) {
  console.log("FAILURES:");
  for (const f of failed) console.log(`  - ${f.label}`);
  process.exit(1);
}
console.log(`screenshots → ${OUT}/`);
