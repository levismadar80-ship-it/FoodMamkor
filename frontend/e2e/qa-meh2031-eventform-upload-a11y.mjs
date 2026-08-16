/**
 * MEH-2031 — EventForm upload control: keyboard reachability + upload announcement.
 *
 * This harness exists because the jsdom suite CANNOT settle the question it is
 * named for. jsdom loads no Tailwind, so `hidden` and `sr-only` compute
 * identically there and `.focus()` succeeds either way — the unit case asserts a
 * class contract, and says so. Here a real stylesheet exists, so the two
 * assertions below measure RENDERED BEHAVIOUR:
 *
 *   1. getComputedStyle(input).display !== "none"
 *   2. input.focus() actually lands (document.activeElement === input)
 *
 * (2) is the discriminating one: a display:none element cannot become
 * activeElement, so it goes red against the pre-fix markup for exactly the
 * reason the fix exists — not because a class string changed.
 *
 * Artifact generation, NOT a spec: playwright.config.ts testMatch covers
 * e2e/flows + e2e/visual only, so this never runs in the CI suite. Same
 * placement as the MEH-2012 harness it reuses.
 *
 * Run manually:  node e2e/qa-meh2031-eventform-upload-a11y.mjs
 * REUSES: e2e/qa-meh2012-experience-image-upload.mjs (context + auth + mocks).
 */
import { chromium, devices } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2031";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const CLOUD_URL = "https://res.cloudinary.com/demo/image/upload/v1/mehamakor/qa.jpg";

const OWNER = {
  id: 43,
  name: "דמו בעלת עסק",
  email: "owner@example.com",
  role: "producer",
  is_verified: true,
  email_verified: true,
};

const PIXEL5 = devices["Pixel 5"].viewport;
const VIEWPORTS = [
  { tag: "390", width: 390, height: 844 },
  { tag: "pixel5", width: PIXEL5.width, height: PIXEL5.height },
  { tag: "1440", width: 1440, height: 900 },
];

let failures = 0;
const ran = [];
function check(ok, label, detail) {
  ran.push(label);
  console.log(`    ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function newContext(browser, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("token", "qa-owner-token");
    localStorage.setItem("cookieConsent", "all");
  });

  // Catch-all FIRST: Playwright resolves routes in REVERSE registration order,
  // so a catch-all registered last shadows every specific mock above it. That
  // cost a full debugging cycle on the MEH-2014 harness and it surfaces as
  // "the feature did nothing", not as a routing error.
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");

    if (path === "/upload/image") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: CLOUD_URL }),
      });
    }
    if (path === "/auth/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(OWNER),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: path.startsWith("/cities") ? "[]" : "{}",
    });
  });
  return ctx;
}

const FILE_INPUT = 'input[type="file"]';
const PREVIEW = 'img[src*="cloudinary"]';

async function shoot(page, vpTag, name) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}-${vpTag}.png`, fullPage: false });
}

async function checkNoHorizontalScroll(page, label) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check(
    m.scrollWidth <= m.clientWidth,
    `no horizontal scroll — ${label}`,
    `scrollWidth=${m.scrollWidth} clientWidth=${m.clientWidth}`,
  );
}

async function run(browser, vp) {
  console.log(`\n  === ${vp.tag} (${vp.width}x${vp.height}) ===`);
  const ctx = await newContext(browser, vp);
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(`${BASE}/he/producer/dashboard/events/new`, { waitUntil: "domcontentloaded" });
  // `state: "attached"`, NOT the default "visible". This is the whole subject:
  // against the pre-fix markup the input IS display:none, so a visible-wait
  // never resolves and the harness dies on a TimeoutError before reaching a
  // single named assertion — a probe that crashes instead of reporting the
  // defect it exists to measure. Measured: the default form timed out with
  // `38 × locator resolved to hidden <input … class="…hidden">`, which is the
  // right diagnosis buried in the wrong failure mode. Waiting for attachment
  // lets the display/focus checks below run and report FAIL properly.
  await page.waitForSelector(FILE_INPUT, { state: "attached", timeout: 20_000 });

  const dir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
  check(dir === "rtl", "document direction is RTL", `dir=${dir}`);
  await checkNoHorizontalScroll(page, "empty form");

  // ---- THE POINT OF THIS HARNESS -----------------------------------------
  const display = await page.locator(FILE_INPUT).evaluate((el) => getComputedStyle(el).display);
  check(display !== "none", "the file input is not display:none", `display=${display}`);

  const focusable = await page.locator(FILE_INPUT).evaluate((el) => {
    el.focus();
    return document.activeElement === el;
  });
  check(focusable, "the file input can take keyboard focus (WCAG 2.1.1)");

  // The other half: focus must be VISIBLE. focus-within on the wrapper is what
  // draws it, so sample the wrapper's computed border while the input has focus.
  const ring = await page.locator(FILE_INPUT).evaluate((el) => {
    el.focus();
    const wrap = el.closest("label");
    const cs = getComputedStyle(wrap);
    return { borderColor: cs.borderColor, boxShadow: cs.boxShadow };
  });
  // Asserts boxShadow ALONE, deliberately. This read
  // `boxShadow !== "none" || borderColor !== ""` for one run, and the control
  // caught it signing off on the broken state: borderColor is ALWAYS a
  // non-empty string, so the `||` let it carry the assertion and the case
  // reported PASS with `boxShadow=none` against pre-fix markup that has no
  // focus ring at all. That is the exact `||` shape .claude/rules/testing.md
  // warns about — either cue can carry it, so losing the other is undetectable.
  // `focus-within:ring-2` renders as a box-shadow, so that is the cue to name.
  check(
    ring.boxShadow !== "none",
    "the wrapper renders a visible focus indicator",
    `boxShadow=${ring.boxShadow}`,
  );
  await shoot(page, vp.tag, "1-upload-control-focused");

  // ---- uploaded state: the preview must carry a non-empty alt --------------
  await page.setInputFiles(FILE_INPUT, {
    name: "cover.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00]),
  });
  await page.waitForSelector(PREVIEW, { timeout: 15_000 });

  const alt = await page.locator(PREVIEW).first().getAttribute("alt");
  check(Boolean(alt && alt.trim()), "the preview carries a non-empty alt", `alt=${JSON.stringify(alt)}`);
  check((await page.locator(PREVIEW).count()) === 1, "exactly one preview thumbnail");
  await shoot(page, vp.tag, "2-uploaded");
  await checkNoHorizontalScroll(page, "uploaded");

  check(pageErrors.length === 0, `0 page errors (${vp.tag})`, JSON.stringify(pageErrors));
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const vp of VIEWPORTS) await run(browser, vp);
  await browser.close();
  // Derived, not hand-written: adding a case moves this number on its own.
  console.log(`\n${ran.length} checks ran, ${failures} failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
