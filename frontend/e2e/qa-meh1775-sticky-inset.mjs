/**
 * MEH-1775 self-QA — the cookie banner must not obscure the registration CTA.
 *
 * WHAT IT ASSERTS, AND WHY IT IS SHAPED THIS WAY
 * ----------------------------------------------
 * The obvious assertion here is "`<body>` carries the shared-inset class". That
 * is the assertion this file deliberately does NOT make. Per
 * .claude/rules/workflow.md §3.6, a test that asserts the prescribed CHANGE was
 * applied passes an inert fix by construction — swap the class for one that
 * computes to the wrong value and it still goes green. So the assertion is
 * geometric and end-state: with the banner up, does the «הבא» button's border
 * box intersect the banner's border box? That question has the same answer no
 * matter how the fix is spelled, and it is the thing SC 2.4.11 actually forbids.
 *
 * Drives the REAL /register/producer page in Chromium against a `next start`
 * server, /api/** fulfilled from fixtures (the CC sandbox has no backend and
 * cannot reach Railway — CLAUDE.md "Known Bug Patterns").
 *
 * Reaching step 2 (STEP.DETAILS = the screen in Sapir's 29/07 screenshot) needs
 * no backend: RegisterProducerClient.jsx:181-187 initialises `step` to DETAILS
 * synchronously whenever `localStorage.token` is present, precisely so the auth
 * context loading async cannot flicker step 1. Seeding that key is therefore
 * using the component's own documented entry path, not simulating one.
 *
 * DISCRIMINATION (MEH-1619). --break replays the pre-fix state by forcing
 * `body { padding-bottom: 5rem }` — the literal computed value of the old
 * `pb-20 md:pb-0`. That is the exact condition the fix changed and nothing else,
 * so a red there is evidence for THIS diff rather than for "something moved".
 * Both runs are required in the PR body; run --break FIRST, because a harness
 * that cannot produce a red is not evidence when it produces a green.
 *
 * Run:  node e2e/qa-meh1775-sticky-inset.mjs [--break]
 *
 * REUSES: e2e/qa-meh1851-grass-fed.mjs (route-fixture + dual-viewport harness,
 *         he.json-sourced chrome strings, env-noise filter).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

// Chrome strings come from he.json, never literals: a rename would otherwise
// leave the harness silently interacting with nothing while still exiting 0.
const HE = JSON.parse(fs.readFileSync(new URL("../messages/he.json", import.meta.url), "utf8"));
const R = HE.auth.register.producer;
const PREFLIGHT_CTA = R.preflight.cta;
const NEXT_CTA = R.actions.next;
const ACCEPT_ALL = HE.modals.cookie_banner.accept_all;

const BREAK = process.argv.includes("--break");
const OUT = "../qa-artifacts/MEH-1775";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const USER = { id: 7, email: "demo-owner@example.com", role: "user", name: "דנה" };
const CATEGORIES = [{ id: 5, name: "בשר ודגים" }, { id: 6, name: "מאפים" }];

const failures = [];
const consoleErrors = [];

// Proven-environmental console noise: /_vercel/speed-insights is served by
// Vercel's edge, so under `next start` it 404s to HTML and Chromium refuses the
// MIME type. Matched on the originating URL, and on a FIXED EXTERNAL PATH —
// never on anything about the element under test, which would convert "the CTA
// is gone" into "nothing to report". Every other console error still fails.
const SPEED_INSIGHTS = "/_vercel/speed-insights";
const isEnvNoise = (m) =>
  (m.location()?.url || "").includes(SPEED_INSIGHTS) || m.text().includes(SPEED_INSIGHTS);

/** Do two border boxes overlap? Touching edges is fine; overlap is the failure. */
const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function openStepTwo(browser, width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
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
      : path === "/categories" ? CATEGORIES
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" && !isEnvNoise(m)) consoleErrors.push(`[${width}] ${m.text()}`);
  });

  // token → step 2 (RegisterProducerClient.jsx:183). cookieConsent deliberately
  // NOT set: the banner being up is the whole subject of this harness.
  await page.addInitScript(() => localStorage.setItem("token", "qa-fixture-token"));
  await page.goto(`${BASE}/register/producer`, { waitUntil: "networkidle" });

  // MEH-994 pre-flight gate — the wizard is behind this CTA.
  await page.getByRole("button", { name: PREFLIGHT_CTA }).first().click();
  await page.waitForTimeout(400);

  if (BREAK) {
    // Replay the pre-fix reservation exactly: `pb-20 md:pb-0` computed to 5rem
    // on mobile and 0 on desktop. setProperty with "important" is required —
    // the Tailwind arbitrary-value class is a normal declaration on the same
    // element, so a plain inline write would still lose to nothing but is
    // clearer stated explicitly.
    // BOTH halves of the pre-fix state, or the replay is not the pre-fix state:
    // `pb-20 md:pb-0` on <body> (5rem / 0), and NO scroll-padding-bottom at all
    // (the property did not exist anywhere in frontend/ before this diff —
    // verified by grep on origin/staging).
    await page.evaluate((w) => {
      document.body.style.setProperty("padding-bottom", w < 768 ? "5rem" : "0px", "important");
      document.documentElement.style.setProperty("scroll-padding-bottom", "0px", "important");
    }, width);
    await page.waitForTimeout(200);
  }
  return { ctx, page };
}

async function check(browser, label, width, height) {
  const { ctx, page } = await openStepTwo(browser, width, height);

  const banner = page.locator(".cookie-banner");
  const next = page.getByRole("button", { name: NEXT_CTA }).first();

  if (!(await banner.isVisible())) {
    failures.push(`[${label}] cookie banner not rendered — harness cannot test the overlap`);
    await ctx.close();
    return;
  }
  // Guard against the control vanishing: a missing CTA must FAIL, never skip.
  if ((await next.count()) === 0) {
    failures.push(`[${label}] «${NEXT_CTA}» button not found on step 2`);
    await ctx.close();
    return;
  }

  // Reach the CTA the way SC 2.4.11 is actually specified: by FOCUS. Park the
  // page at the top first so focus() has to scroll, then let the browser bring
  // the control in — that scroll is the one `scroll-padding-bottom` governs, and
  // technique C43 exists precisely because without it the browser aligns the
  // element to the VIEWPORT edge, which is under a fixed layer.
  //
  // Two earlier instruments were wrong and both reported the pre-fix state as
  // CLEAN, which is why this comment is long:
  //   · scrollIntoViewIfNeeded() stops the moment the element is inside the
  //     viewport — at 375×812 that parked the CTA at y=584, above the banner
  //     band at 640..732. No overlap existed to find.
  //   · scrollTo(document.body.scrollHeight) overshot: the CTA is not the last
  //     element on the page, so the document bottom scrolls it off the TOP
  //     (y=-205).
  // The viewport is not the visible area once a fixed layer is over it, and the
  // distance between those two is the whole bug.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await next.focus();
  await page.waitForTimeout(350);

  const bannerBox = await banner.boundingBox();
  const nextBox = await next.boundingBox();
  const hit = overlaps(nextBox, bannerBox);
  const insetPx = await page.evaluate(() => getComputedStyle(document.body).paddingBottom);
  const bannerH = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--cookie-banner-h").trim());

  console.log(
    `[${label}] overlap=${hit} bodyPadBottom=${insetPx} --cookie-banner-h=${bannerH || "(unset)"} ` +
    `cta.y=${Math.round(nextBox.y)}..${Math.round(nextBox.y + nextBox.height)} ` +
    `banner.y=${Math.round(bannerBox.y)}..${Math.round(bannerBox.y + bannerBox.height)}`);

  if (hit) failures.push(`[${label}] «${NEXT_CTA}» is obscured by the cookie banner (SC 2.4.11)`);

  await page.screenshot({ path: `${OUT}/${label}-1-banner-up.png`, fullPage: false });

  // Dismissing must RELEASE the reservation — no permanent dead gap.
  await page.getByRole("button", { name: ACCEPT_ALL }).first().click();
  await page.waitForTimeout(400);
  const afterPad = await page.evaluate(() => getComputedStyle(document.body).paddingBottom);
  const expected = width < 768 ? 80 : 0;
  const actual = parseFloat(afterPad);
  console.log(`[${label}] dismissed: bodyPadBottom=${afterPad} (expected ~${expected}px)`);
  if (Math.abs(actual - expected) > 1) {
    failures.push(`[${label}] dead gap after dismiss: ${afterPad}, expected ~${expected}px`);
  }
  await page.screenshot({ path: `${OUT}/${label}-2-dismissed.png`, fullPage: false });
  await ctx.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  // 375×667 is the iPhone SE/8 box and the SHORT-viewport case: the shorter the
  // window, the more of the form is below the fold and the likelier the focused
  // CTA lands in the banner's band. 812 is the taller modern-phone box, 1440×900
  // desktop (BottomNav gone, banner flush at bottom-0).
  await check(browser, "375x667", 375, 667);
  await check(browser, "375x812", 375, 812);
  await check(browser, "1440", 1440, 900);
  await browser.close();

  console.log("console errors:", consoleErrors.length ? consoleErrors : "none");
  console.log(BREAK ? "MODE: --break (pre-fix replay — MUST fail)" : "MODE: normal (MUST pass)");
  const bad = failures.length > 0 || consoleErrors.length > 0;
  if (bad) failures.forEach((f) => console.log("FAIL:", f));
  // Under --break the harness is proving it CAN go red, so a red is the pass.
  if (BREAK) {
    console.log(bad ? "OK — pre-fix state detected as a failure (discriminates)" : "BROKEN HARNESS — pre-fix state reported clean");
    process.exit(bad ? 0 : 1);
  }
  console.log(bad ? "FAILED" : "PASS — CTA clear of the banner at every viewport checked");
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
