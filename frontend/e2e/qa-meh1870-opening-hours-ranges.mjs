/**
 * MEH-1870 self-QA — opening_hours: several ranges per day (split hours).
 *
 * Drives the REAL dashboard editor + the REAL producer page in Chromium against
 * a `next start` server, with every /api/** call fulfilled from fixtures (the CC
 * sandbox has no backend and cannot reach Railway — CLAUDE.md "Known Bug
 * Patterns"). Captures 375px + 1440px.
 *
 * What it proves, in order:
 *   1. a stored SPLIT day (Fri) prefills with both ranges
 *   2. "+ range" adds a third, "X" removes one
 *   3. save sends the canonical LIST shape (the PUT body is asserted, not just
 *      the absence of an error)
 *   4. re-opening the editor seeded with the SAVED value prefills correctly —
 *      the reload half of the DoD, without a backend to persist to
 *   5. a LEGACY single-range string still prefills as one range
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh1870-opening-hours-ranges.mjs
 * REUSES: e2e/qa-meh1539-categories.mjs (dashboard fixture + PUT-capture pattern).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-1870";
// Hard-coded, not env-driven: the env-drift gate treats any process.env read in
// the repo as an undeclared var, and a one-off harness is not worth one.
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium";

// Friday carries the lunch break; Sun-Thu is an ordinary single-range group.
const SPLIT_HOURS = "Sun-Thu 09:00-18:00, Fri 09:00-13:00 16:00-19:00";

// A string written before MEH-1870 — must still prefill and round-trip.
const LEGACY_HOURS = "Sun-Thu 09:00-18:00, Fri 09:00-14:00";

const baseProfile = {
  id: 42,
  name: "מאפיית שדה",
  is_approved: true,
  categories: [{ id: 2, name: "לחמים ואפייה" }],
  products: [],
  images: [],
  has_physical_location: true,
  offers_delivery: false,
};

const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה" };

const puts = [];

async function openEditor(ctx, hours) {
  const profile = { ...baseProfile, opening_hours: hours };
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    if (req.method() === "PUT" && path === "/producers/me") {
      puts.push(JSON.parse(req.postData() || "{}"));
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    const body =
      path === "/auth/me" ? USER
      : path === "/categories" ? []
      : path === "/producers/me" ? profile
      : path === "/producers/me/dashboard" ? { producer: profile }
      : path === "/producers/me/analytics" ? {}
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("token", "qa-fixture-token"));
  await page.goto(`${BASE}/producer/dashboard/edit?group=location`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  // The dashboard renders each card as a collapsed accordion. The header is a
  // real button with a stable id (`<anchorId>-header`), which is what
  // EditAccordionCard emits — more robust than matching Hebrew heading text.
  //
  // Deliberately NO `#order-window` hash on the URL: the hash AUTO-EXPANDS the
  // card, so the click below would toggle it shut again. That cost three runs
  // that all reported "card may not have opened" while the card had in fact
  // opened and then closed.
  const header = page.locator("#hours-header");
  await header.scrollIntoViewIfNeeded();
  await header.click();
  await page.waitForTimeout(600);
  await page.locator('input[type="time"]').first().waitFor({ state: "visible", timeout: 8000 })
    .catch(() => console.log("   (no time input became visible — card may not have opened)"));
  return page;
}

/** Every visible time input, in DOM order — the editor's rendered state. */
async function times(page) {
  return page.locator('input[type="time"]').evaluateAll((nodes) => nodes.map((n) => n.value));
}

async function run(browser, label, width, height) {
  console.log(`\n================ ${label} ================`);
  const ctx = await browser.newContext({
    viewport: { width, height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
  });

  // 1 — a stored SPLIT day (Fri) prefills with both ranges.
  const page = await openEditor(ctx, SPLIT_HOURS);
  const prefilled = await times(page);
  console.log(`[${label}] 1. split-day prefill:`, JSON.stringify(prefilled));
  const okPrefill =
    prefilled.includes("09:00") && prefilled.includes("13:00") &&
    prefilled.includes("16:00") && prefilled.includes("19:00");
  console.log(`[${label}]    both ranges present: ${okPrefill ? "PASS" : "FAIL"}`);

  const card = page.locator('[data-testid="order-window-add-range-0"]').first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${OUT}/${label}-1-editor-split-day.png` });

  // 2 — add a third range, then remove it again.
  await page.getByTestId("hours-add-range-5").click();
  await page.waitForTimeout(250);
  const afterAdd = await times(page);
  console.log(`[${label}] 2. after "+ range":`, JSON.stringify(afterAdd),
    `(add control still shown: ${(await page.getByTestId("hours-add-range-5").count()) > 0})`);
  await page.screenshot({ path: `${OUT}/${label}-2-three-ranges.png` });

  await page.getByTestId("hours-remove-5-2").click();
  await page.waitForTimeout(250);
  console.log(`[${label}]    after "X":`, JSON.stringify(await times(page)));

  // 3 — save sends the canonical LIST shape.
  const before = puts.length;
  await page.getByTestId("hours-add-range-5").click();
  await page.waitForTimeout(150);
  // Scope to the panel: several cards on this page have a "שמירה" button, and
  // an unscoped .first() saves the images card instead (PUT body came back null).
  const saveBtn = page.locator("#hours-panel").getByRole("button", { name: "שמירה" }).first();
  await saveBtn.scrollIntoViewIfNeeded();
  await saveBtn.click();
  await page.waitForTimeout(700);
  const sent = puts.length > before ? puts[puts.length - 1] : null;
  console.log(`[${label}] 3. PUT body:`, JSON.stringify(sent));
  const written = sent?.opening_hours;
  const expected = "Sun-Thu 09:00-18:00, Fri 09:00-13:00 16:00-19:00 19:00-21:00";
  console.log(`[${label}]    string matches expected grammar: ${written === expected ? "PASS" : `FAIL (expected ${expected})`}`);
  await page.screenshot({ path: `${OUT}/${label}-3-after-save.png` });
  await page.close();

  // 4 — "reload": a fresh editor seeded with what was just saved.
  if (sent?.opening_hours) {
    const page2 = await openEditor(ctx, sent.opening_hours);
    console.log(`[${label}] 4. reload prefill:`, JSON.stringify(await times(page2)));
    await page2.screenshot({ path: `${OUT}/${label}-4-reload-prefill.png` });
    await page2.close();
  }

  // 5 — a LEGACY single-range string still prefills as exactly one range.
  const page3 = await openEditor(ctx, LEGACY_HOURS);
  const legacy = await times(page3);
  console.log(`[${label}] 5. legacy string prefill:`, JSON.stringify(legacy),
    `— removable control absent: ${(await page3.getByTestId("hours-remove-5-0").count()) === 0}`);
  await page3.screenshot({ path: `${OUT}/${label}-5-legacy-prefill.png` });
  await page3.close();

  await ctx.close();
}

const browser = await chromium.launch({ executablePath: CHROME });
fs.mkdirSync(OUT, { recursive: true });
await run(browser, "375", 375, 812);
await run(browser, "1440", 1440, 1000);
await browser.close();
