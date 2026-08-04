/**
 * MEH-1830 self-QA — the renamed time cards.
 *
 * Drives the REAL dashboard pages in Chromium against a `next start` server,
 * with every /api/** call fulfilled from fixtures (the CC sandbox has no
 * backend and cannot reach Railway — CLAUDE.md "Known Bug Patterns").
 *
 * WHAT THIS DOCUMENTS, AND WHAT IT DOES NOT.
 * The ticket asked for the three time cards under ONE "זמנים וזמינות" section.
 * That did not ship: cards 1 and 2 are accordions on the EDIT TAB, card 3 is a
 * live radiogroup on the HUB page — a different route, fed by a different
 * endpoint. Co-locating them is a cross-page move of a live control, which the
 * ticket's own scope bars ("שינוי מבני מעבר לקיבוץ+labels → STOP").
 * So this harness captures the two surfaces SEPARATELY and says so in the file
 * names — `edit-tab-*` and `hub-*`. A single-section screenshot would be a
 * picture of something that does not exist.
 *
 * Captures 375px + 1440px of both surfaces and asserts every locked string
 * appears VERBATIM, plus the absence of the two retired card titles.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh1830-times-copy.mjs
 *
 * REUSES: e2e/qa-meh1544-order-window.mjs (route-fixture + dual-viewport harness).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-1830";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// The copy this ticket locks. Asserted verbatim — a paraphrase is a failure.
const LOCKED = {
  hoursTitle: "שעות פתיחה",
  hoursHelper: "מתי העסק פתוח פיזית. מופיע במפה ובעמוד העסק.",
  orderTitle: "מתי מקבלים הזמנות",
  orderHelper: 'הלו"ז השבועי הקבוע. יום שלא מסומן — סגור להזמנות באותו יום.',
  orderWhatsThis:
    "כמו שעות פתיחה — רק להזמנות. קבוע ושבועי, משתנה רק כשמשנים אותו. מופיע בעמוד העסק כסטטוס ורצועת ימים.",
  availTitle: "מצב נוכחי",
  availHelper: 'עדכון זמני שגובר על הלו"ז — כמו פתק על הדלת.',
  availWhatsThis:
    "חריג זמני — עמוסה השבוע, בהפסקה, או זמינה היום. גובר על הלו\"ז הקבוע ומוצג ללקוחות בכרטיסיה ובעמוד העסק.",
};

// The two titles the rename retires. Must not appear as a card title anywhere.
const RETIRED = ["חלון הזמנות", "מצב זמינות"];

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
  order_window: { sun: { open: "09:00", close: "14:00" }, mon: { open: "09:00", close: "14:00" } },
  availability_state: "full_this_week",
};

const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה" };

const results = [];
function check(label, pass, detail = "") {
  results.push({ label, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function newCtx(browser, width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
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
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return ctx;
}

async function dismissCookies(page) {
  const accept = page.getByRole("button", { name: "קבלו הכל" });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await page.waitForTimeout(300);
  }
}

/** Edit tab — cards 1 and 2, both accordions expanded in turn. */
async function captureEditTab(browser, width, height, tag) {
  const ctx = await newCtx(browser, width, height);
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("token", "qa-fixture-token"));
  await page.goto(`${BASE}/producer/dashboard/edit?group=location`, { waitUntil: "networkidle" });
  await dismissCookies(page);

  // Card 1 — שעות פתיחה
  await page.getByRole("button", { name: new RegExp(LOCKED.hoursTitle) }).first().click();
  await page.waitForTimeout(400);
  const hoursBody = await page.locator("#hours").innerText().catch(() => "");
  check(`[${tag}] card 1 helper verbatim`, hoursBody.includes(LOCKED.hoursHelper));

  // The accordion is single-open (`openKey`), so opening card 2 below collapses
  // card 1. Capture card 1 now — otherwise the artifact documents only half of
  // what shipped.
  fs.mkdirSync(OUT, { recursive: true });
  await page.locator("#hours").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/edit-tab-hours-open-${tag}.png`, fullPage: true });

  // Card 2 — מתי מקבלים הזמנות
  const orderBtn = page.getByRole("button", { name: new RegExp(LOCKED.orderTitle) }).first();
  check(`[${tag}] card 2 title verbatim (accordion is reachable by the NEW label)`,
        await orderBtn.count() > 0);
  await orderBtn.click();
  await page.waitForTimeout(400);
  await page.locator("#order-window").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const orderBody = await page.locator("#order-window").innerText().catch(() => "");
  check(`[${tag}] card 2 helper verbatim`, orderBody.includes(LOCKED.orderHelper));

  // WhatsThis is a collapsed disclosure. `data-testid` sits ON the trigger
  // button (WhatsThis.jsx:32), not on a wrapper — so click the testid element
  // itself. The panel stays mounted with `hidden`, so innerText excludes it
  // while closed: that gives a free negative control, asserted first. Without
  // it, "the text is present" would pass even if the toggle were dead.
  const beforeWt = await page.locator("#order-window").innerText().catch(() => "");
  check(`[${tag}] card 2 WhatsThis is COLLAPSED before the click (probe control)`,
        !beforeWt.includes(LOCKED.orderWhatsThis));
  await page.getByTestId("whats-this-order-window").click();
  await page.waitForTimeout(250);
  const afterWt = await page.locator("#order-window").innerText().catch(() => "");
  check(`[${tag}] card 2 WhatsThis verbatim`, afterWt.includes(LOCKED.orderWhatsThis));

  // Order on the page: hours must precede order-window. Document-absolute Y —
  // boundingBox() is viewport-relative, and the scrollIntoViewIfNeeded above
  // pushes #hours off the top, which made an earlier version of this probe
  // report a spurious failure with a negative y.
  const docY = (sel) =>
    page.evaluate((s) => {
      const el = document.querySelector(s);
      return el ? el.getBoundingClientRect().top + window.scrollY : -1;
    }, sel);
  const hoursY = await docY("#hours");
  const orderY = await docY("#order-window");
  check(`[${tag}] order: hours before order-window`, hoursY >= 0 && orderY > hoursY,
        `hours y=${Math.round(hoursY)} order y=${Math.round(orderY)} (document-absolute)`);

  const full = await page.innerText("body");
  for (const term of RETIRED) {
    check(`[${tag}] retired title "${term}" absent as a card title on the edit tab`,
          !new RegExp(`^\\s*${term}\\s*$`, "m").test(full));
  }

  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/edit-tab-order-open-${tag}.png`, fullPage: true });
  await ctx.close();
}

/** Hub page — card 3, the live availability radiogroup. */
async function captureHub(browser, width, height, tag) {
  const ctx = await newCtx(browser, width, height);
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("token", "qa-fixture-token"));
  await page.goto(`${BASE}/producer/dashboard`, { waitUntil: "networkidle" });
  await dismissCookies(page);
  await page.waitForTimeout(500);

  const body = await page.innerText("body");
  check(`[${tag}] card 3 title verbatim ("${LOCKED.availTitle}")`, body.includes(LOCKED.availTitle));
  check(`[${tag}] card 3 helper verbatim`, body.includes(LOCKED.availHelper));

  // Same disclosure shape as card 2 — negative control first, then the click.
  check(`[${tag}] card 3 WhatsThis is COLLAPSED before the click (probe control)`,
        !body.includes(LOCKED.availWhatsThis));
  await page.getByTestId("whats-this-availability").click();
  await page.waitForTimeout(250);
  const after = await page.innerText("body");
  check(`[${tag}] card 3 WhatsThis verbatim`, after.includes(LOCKED.availWhatsThis));

  check(`[${tag}] retired title "מצב זמינות" absent as visible text on the hub`,
        !after.includes("מצב זמינות"));

  // The pills are explicitly out of scope — assert they are untouched.
  for (const pill of ["פתוח להזמנות", "זמין היום", "עמוס השבוע", "בהפסקה"]) {
    check(`[${tag}] pill unchanged: ${pill}`, after.includes(pill));
  }

  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/hub-${tag}.png`, fullPage: true });
  await ctx.close();
}

const browser = await chromium.launch({ executablePath: CHROME });
console.log("MEH-1830 self-QA — renamed time cards\n");
console.log("edit tab (cards 1 + 2):");
await captureEditTab(browser, 375, 812, "375");
await captureEditTab(browser, 1440, 900, "1440");
console.log("\nhub page (card 3):");
await captureHub(browser, 375, 812, "375");
await captureHub(browser, 1440, 900, "1440");
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
if (failed.length) {
  console.log("FAILURES:");
  for (const f of failed) console.log(`  - ${f.label}`);
  process.exit(1);
}
console.log(`screenshots → ${OUT}/`);
