/**
 * MEH-2013 self-QA — the two ExperienceForm fields labelled `*` and enforced
 * nowhere: `city`, and `location_type` (which additionally shipped preselected
 * as "בבית פרטי").
 *
 * Drives the REAL /he/experiences/new page in Chromium against a `next start`
 * server, with every /api/** call fulfilled from fixtures (the CC sandbox has
 * no backend and cannot reach Railway — CLAUDE.md "Known Bug Patterns").
 *
 * Four states per viewport (375 + 1440):
 *   1. fresh-form              — neither pill selected
 *   2. submit-no-location-error — location error, form not submitted
 *   3. submit-empty-city-error  — city error, form not submitted
 *   4. valid-fill               — everything filled, POST /experiences fires
 *
 * Beyond the pixels it asserts what a screenshot cannot: the pill's
 * `aria-pressed` state, `document.activeElement` after each blocked submit,
 * whether POST /experiences was actually reached, and the page-error count
 * (which must be 0 in every state).
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh2013-experience-required.mjs
 * REUSES: e2e/qa-meh1809-form-validation.mjs (harness shape).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2013";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה" };
const PRODUCER = {
  id: 42,
  name: "מאפיית שדה",
  is_approved: true,
  status: "approved",
  categories: [],
  products: [],
  images: [],
};
const VIEWPORTS = [
  { tag: "375", width: 375, height: 812 },
  { tag: "1440", width: 1440, height: 900 },
];

let failures = 0;
function check(ok, label, detail) {
  console.log(`    ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function newPage(browser, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
  });

  const posted = [];
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    if (req.method() === "POST" && path === "/experiences") {
      posted.push(JSON.parse(req.postData() || "{}"));
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "11111111-1111-1111-1111-111111111111" }),
      });
    }
    if (req.method() === "POST" && path === "/events") {
      posted.push(JSON.parse(req.postData() || "{}"));
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "22222222-2222-2222-2222-222222222222" }),
      });
    }
    const body =
      path === "/auth/me" ? USER
      : path === "/experiences/validate" ? { status: "APPROVED" }
      : path === "/producers/me" ? PRODUCER
      : path === "/producers/me/dashboard" ? { producer: PRODUCER }
      : path.startsWith("/cities") ? []
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  const page = await ctx.newPage();
  // Page errors are the assertion the ticket asks for in every state.
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem("token", "qa-fixture-token");
    // Pre-consent so the cookie banner does not cover the lower fields.
    localStorage.setItem("cookieConsent", "all");
  });
  return { ctx, page, pageErrors, posted };
}

const focusedId = (page) => page.evaluate(() => document.activeElement?.id || "(none)");
const errorTexts = (page) =>
  page.$$eval(".text-error", (n) => n.map((x) => x.textContent.trim()).filter(Boolean));
const pressed = (page, label) =>
  page.getByRole("button", { name: label, exact: true }).first().getAttribute("aria-pressed");

async function shoot(page, vpTag, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}-${vpTag}.png`, fullPage: true });
}

async function run(browser, vp) {
  console.log(`\n== /he/experiences/new @ ${vp.width}px ==`);
  const { ctx, page, pageErrors, posted } = await newPage(browser, vp);
  await page.goto(`${BASE}/he/experiences/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const submit = () => page.getByRole("button", { name: /שלחו לאישור/ }).click();

  // ---- 1. fresh form: neither pill selected -------------------------------
  await shoot(page, vp.tag, "1-fresh-form");
  const home0 = await pressed(page, "בבית פרטי");
  const public0 = await pressed(page, "מקום ציבורי");
  check(home0 === "false" && public0 === "false", "fresh form preselects neither pill",
    `home=${home0} public=${public0}`);

  // ---- 2. submit with no location type -----------------------------------
  await page.locator("#experience-title").fill("סדנת גבינות עיזים");
  await page.locator("#experience-description")
    .fill("סדנה בת שלוש שעות להכנת גבינות עיזים מחלב טרי מהרפת שלנו, למתחילות ולמתקדמות.");
  await page.locator("#experience-date").fill("2026-09-01");
  await page.locator("#experience-city").fill("תל אביב");
  await submit();
  await shoot(page, vp.tag, "2-submit-no-location-error");
  let errs = await errorTexts(page);
  check(errs.includes("חובה לבחור סוג מיקום"), "location error shown", JSON.stringify(errs));
  check(posted.length === 0, "form NOT submitted", `${posted.length} POST(s)`);
  check(await focusedId(page) === "experience-location-type", "focus moved to the pill row",
    `#${await focusedId(page)}`);

  // ---- 3. submit with an empty city --------------------------------------
  await page.getByRole("button", { name: "בבית פרטי", exact: true }).click();
  await page.locator("#experience-city").fill("");
  await submit();
  await shoot(page, vp.tag, "3-submit-empty-city-error");
  errs = await errorTexts(page);
  check(errs.includes("חובה לבחור עיר"), "city error shown", JSON.stringify(errs));
  check(posted.length === 0, "form NOT submitted", `${posted.length} POST(s)`);
  check(await focusedId(page) === "experience-city", "focus moved to the city input",
    `#${await focusedId(page)}`);

  // ---- 4. valid fill ------------------------------------------------------
  await page.locator("#experience-city").fill("  תל אביב  ");
  await page.getByRole("button", { name: "מקום ציבורי", exact: true }).click();
  await shoot(page, vp.tag, "4-valid-fill");
  check(await pressed(page, "מקום ציבורי") === "true", "chosen pill reports pressed");
  await submit();
  await page.waitForTimeout(600);
  check(posted.length === 1, "POST /experiences fired", `${posted.length} POST(s)`);
  if (posted.length) {
    check(posted[0].city === "תל אביב", "city sent trimmed", JSON.stringify(posted[0].city));
    check(posted[0].location_type === "public", "location_type sent",
      JSON.stringify(posted[0].location_type));
  }

  // ---- page errors: 0 in every state -------------------------------------
  check(pageErrors.length === 0, "0 page errors across all states", JSON.stringify(pageErrors));

  await ctx.close();
}

// MEH-2013 §2ד — the SAME class in the event form: "עיר *" enforced nowhere,
// and "קטגוריה *" pre-filled with "אחר" so a required field was satisfied by a
// catch-all nobody chose. The server DID require category, but the form is
// noValidate, so the only failure path was a raw 422 with no message.
async function runEvents(browser, vp) {
  console.log(`\n== /he/producer/dashboard/events/new @ ${vp.width}px ==`);
  const { ctx, page, pageErrors, posted } = await newPage(browser, vp);
  await page.goto(`${BASE}/he/producer/dashboard/events/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const submit = () => page.locator('button[type="submit"]').first().click();
  const errorTextsNow = () => errorTexts(page);

  // ---- 1. fresh form: no category preselected ----------------------------
  await shoot(page, vp.tag, "5-event-fresh-form");
  const cat0 = await page.locator("#category").inputValue();
  check(cat0 === "", 'fresh form has no category preselected (was "אחר")', `value=${JSON.stringify(cat0)}`);
  const placeholderDisabled = await page.locator('#category option[value=""]').isDisabled();
  check(placeholderDisabled, "placeholder option is disabled");

  // ---- 2. submit with no category ----------------------------------------
  await page.locator("#title").fill("יום פתוח במאפייה");
  await page.locator("#event_date").fill("2026-09-01");
  await page.locator("#city").fill("תל אביב");
  await submit();
  await page.waitForTimeout(300);
  await shoot(page, vp.tag, "6-event-no-category-error");
  let errs = await errorTextsNow();
  check(errs.includes("חובה לבחור קטגוריה"), "category error shown", JSON.stringify(errs));
  check(posted.length === 0, "form NOT submitted", `${posted.length} POST(s)`);
  check(await focusedId(page) === "category", "focus moved to the category select", `#${await focusedId(page)}`);

  // ---- 3. submit with an empty city --------------------------------------
  await page.locator("#category").selectOption("שוק");
  await page.locator("#city").fill("");
  await submit();
  await page.waitForTimeout(300);
  await shoot(page, vp.tag, "7-event-empty-city-error");
  errs = await errorTextsNow();
  check(errs.includes("חובה לבחור עיר"), "city error shown", JSON.stringify(errs));
  check(posted.length === 0, "form NOT submitted", `${posted.length} POST(s)`);

  // ---- 4. valid fill ------------------------------------------------------
  await page.locator("#city").fill("  תל אביב  ");
  await shoot(page, vp.tag, "8-event-valid-fill");
  await submit();
  await page.waitForTimeout(700);
  check(posted.length === 1, "POST /events fired", `${posted.length} POST(s)`);
  if (posted.length) {
    check(posted[0].city === "תל אביב", "city sent trimmed", JSON.stringify(posted[0].city));
    check(posted[0].category === "שוק", "category sent", JSON.stringify(posted[0].category));
  }

  check(pageErrors.length === 0, "0 page errors across all states", JSON.stringify(pageErrors));
  await ctx.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const vp of VIEWPORTS) await run(browser, vp);
  for (const vp of VIEWPORTS) await runEvents(browser, vp);
  await browser.close();
  console.log(`\nScreenshots in ${OUT}`);
  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
