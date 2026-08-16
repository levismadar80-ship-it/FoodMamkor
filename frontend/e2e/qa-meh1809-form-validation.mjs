/**
 * MEH-1809 self-QA — unified submit validation across the three dashboard forms.
 *
 * Drives the REAL pages in Chromium against a `next start` server, with every
 * /api/** call fulfilled from fixtures (the CC sandbox has no backend and cannot
 * reach Railway — CLAUDE.md "Known Bug Patterns"). Mobile 390px only, which is
 * the viewport the ticket is about: the old top-of-form banner sat outside it.
 *
 * Per form it captures three states and prints what it measured:
 *   1. rest        — the untouched form
 *   2. all-errors  — after an empty submit: EVERY required message at once
 *   3. one-fixed   — after correcting the first field: only its message went
 *
 * It also reports document.activeElement after the empty submit, since "focus
 * moved to the first invalid field" is not visible in a screenshot.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh1809-form-validation.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-1809";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה" };
const PROFILE = {
  id: 42,
  name: "מאפיית שדה",
  is_approved: true,
  status: "approved",
  categories: [],
  products: [],
  images: [],
  has_physical_location: true,
  offers_delivery: false,
};

async function newPage(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
  });

  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const body =
      path === "/auth/me" ? USER
      : path === "/producers/me" ? PROFILE
      : path === "/producers/me/dashboard" ? { producer: PROFILE }
      : path === "/producers/me/products" ? []
      : path === "/producers/me/analytics" ? {}
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("token", "qa-fixture-token");
    // Pre-consent so the cookie banner does not sit over the lower fields —
    // it covered the price error in the first capture run.
    localStorage.setItem("cookieConsent", "all");
  });
  return { ctx, page };
}

// The id of whatever currently holds focus — the assertion a screenshot cannot make.
const focusedId = (page) => page.evaluate(() => document.activeElement?.id || "(none)");

// Count how many error messages are on screen. ui/Input renders them as
// .text-error, which is also what the ExperienceForm textarea path uses.
const errorTexts = (page) =>
  page.$$eval(".text-error", (nodes) => nodes.map((n) => n.textContent.trim()).filter(Boolean));

async function shoot(page, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

async function report(page, form, stage) {
  const errs = await errorTexts(page);
  console.log(`  [${form}] ${stage}: ${errs.length} error(s) on screen -> ${JSON.stringify(errs)}`);
  return errs;
}

async function qaProducts(browser) {
  console.log("\n== ProductsSection (/producer/dashboard/edit) ==");
  const { ctx, page } = await newPage(browser);
  // Products sits in the `profile` group; #products deep-links + expands it.
  await page.goto(`${BASE}/producer/dashboard/edit?group=profile#products`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(800);

  // Open the add form via the empty-state CTA (catalog is empty in the fixture).
  await page.getByRole("button", { name: /הוסיפו מוצר ראשון/ }).first().click();
  await page.waitForTimeout(400);
  await shoot(page, "products-1-rest");
  await report(page, "products", "rest");

  await page.locator("#new-product-name").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: /^הוסיפו מוצר$/ }).last().click();
  await shoot(page, "products-2-all-errors");
  await report(page, "products", "after empty submit");
  console.log(`  [products] focus after submit = #${await focusedId(page)}`);

  await page.locator("#new-product-name").fill("לחם מחמצת");
  await shoot(page, "products-3-one-fixed");
  await report(page, "products", "after fixing name");

  await ctx.close();
}

async function qaEvent(browser) {
  console.log("\n== EventForm (/producer/dashboard/events/new) ==");
  const { ctx, page } = await newPage(browser);
  await page.goto(`${BASE}/producer/dashboard/events/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await shoot(page, "event-1-rest");
  await report(page, "event", "rest");

  // Push price/participants out of range too, so the capture shows all four.
  await page.locator("#price").fill("-5");
  await page.locator("#max_participants").fill("0");
  await page.getByRole("button", { name: /פרסמו אירוע/ }).click();
  await shoot(page, "event-2-all-errors");
  await report(page, "event", "after empty submit");
  console.log(`  [event] focus after submit = #${await focusedId(page)}`);

  await page.locator("#title").fill("יום פתוח במחלבה");
  await shoot(page, "event-3-one-fixed");
  await report(page, "event", "after fixing title");

  await ctx.close();
}

async function qaExperience(browser) {
  console.log("\n== ExperienceForm (/experiences/new) ==");
  const { ctx, page } = await newPage(browser);
  await page.goto(`${BASE}/experiences/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await shoot(page, "experience-1-rest");
  await report(page, "experience", "rest");

  await page.locator("#experience-duration").fill("5");
  await page.locator("#experience-price").fill("-1");
  await page.locator("#experience-max-participants").fill("0");
  await page.getByRole("button", { name: /שלחו לאישור/ }).click();
  await shoot(page, "experience-2-all-errors");
  await report(page, "experience", "after empty submit");
  console.log(`  [experience] focus after submit = #${await focusedId(page)}`);

  await page.locator("#experience-title").fill("סדנת גבינות");
  await shoot(page, "experience-3-one-fixed");
  await report(page, "experience", "after fixing title");

  await ctx.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  await qaProducts(browser);
  await qaEvent(browser);
  await qaExperience(browser);
  await browser.close();
  console.log("\nScreenshots in", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
