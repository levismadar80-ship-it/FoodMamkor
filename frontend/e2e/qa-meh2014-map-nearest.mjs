/**
 * MEH-2014 PR 1 self-QA — "מרחק" as a trigger, and a fix that survives the tab.
 *
 * Drives the REAL /map page in Chromium against a `next start` server, with
 * every /api/** call fulfilled from fixtures (the CC sandbox has no backend and
 * cannot reach Railway — CLAUDE.md "Known Bug Patterns").
 *
 * Geolocation is driven through Playwright's real permission machinery
 * (`grantPermissions` + `setGeolocation`, and a context with permissions
 * withheld for the denial path) rather than by stubbing `navigator.geolocation`
 * — the point of this ticket is the browser's own prompt path, and a stub would
 * be a green with a second possible cause.
 *
 * VIEWPORT ASYMMETRY, discovered by this harness and NOT a defect in the diff:
 * the sort <select> lives in the desktop shell only (MapClient.jsx `hidden
 * lg:grid`) — mobile has no sort control at all, and never did (MEH-1864 put it
 * in the desktop sidebar). So the sort states are desktop-only by construction.
 *
 * What this DID expose was a real gap in the first cut of MEH-2014: the clear
 * affordance had been placed beside the select, i.e. desktop-only — while a
 * mobile visitor CAN write a location via the NearMePill. That would have left
 * every mobile user with a fix that now outlives the tab and no way to remove
 * it: strictly worse than the session-scoped behaviour being replaced. The
 * control is now rendered in both shells, and the 375px run below asserts it.
 *
 * Four states per viewport (375 + 1440):
 *   1. no-location-fresh          — "מרחק" enabled, nothing stored, no prompt on load
 *   2. permission-granted-sorted  — choosing it stores a fix and the sort sticks
 *   3. permission-denied-message  — Hebrew message naming the manual way out,
 *                                   select reverts, nothing stored
 *   4. after-clear                — the clear affordance empties storage and
 *                                   drops the now-meaningless sort
 *
 * Plus the claim a screenshot cannot make: the fix survives a **tab close**,
 * reproduced by discarding the page and opening a new one in a fresh context
 * that shares the same storage origin.
 *
 * Run manually:  node e2e/qa-meh2014-map-nearest.mjs
 * REUSES: e2e/qa-meh2013-experience-required.mjs (harness shape).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2014";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const ORIGIN = "http://localhost:3100";

// Tel Aviv-ish, and two producers far enough apart that a distance sort has a
// visible, checkable order.
const GEO = { latitude: 32.0853, longitude: 34.7818 };
const PRODUCERS = [
  { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "מאפיית הצפון", slug: "north", city: "חיפה",
    lat: 32.794, lng: 34.9896, categories: [], images: [], is_approved: true, status: "approved" },
  { id: "bbbbbbbb-0000-0000-0000-000000000002", name: "מאפיית תל אביב", slug: "tlv", city: "תל אביב",
    lat: 32.0853, lng: 34.7818, categories: [], images: [], is_approved: true, status: "approved" },
];

const VIEWPORTS = [
  { tag: "375", width: 375, height: 812 },
  { tag: "1440", width: 1440, height: 900 },
];

let failures = 0;
function check(ok, label, detail) {
  console.log(`    ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function newContext(browser, vp, { grant }) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
    geolocation: GEO,
    // Withholding the permission is what makes the denial path REAL: Chromium
    // rejects with code 1 exactly as it would for a user who clicked Block.
    permissions: grant ? ["geolocation"] : [],
  });

  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const body =
      path === "/producers" ? PRODUCERS
      : path === "/categories" ? []
      : path.startsWith("/cities") ? []
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return ctx;
}

async function openMap(ctx) {
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem("cookieConsent", "all"));
  await page.goto(`${BASE}/he/map`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  return { page, pageErrors };
}

const SORT = 'select[aria-label="מיון בתי עסק"]';
// BOTH shells are in the DOM at all times — one is CSS-hidden (`hidden lg:grid`
// / `lg:hidden`) — so the bare testid resolves to 2 elements at every viewport.
// Scope to the visible one, and assert the COUNT separately: `:visible` alone
// would also pass a real double-mount, which is the failure mode this style of
// locator is known for (MEH-1771/1792).
const CLEAR = '[data-testid="clear-user-location"]';
const CLEAR_VISIBLE = `${CLEAR}:visible`;

async function checkExactlyOneVisibleClear(page, label) {
  const inDom = await page.locator(CLEAR).count();
  const visible = await page.locator(CLEAR_VISIBLE).count();
  check(visible === 1, label, `${visible} visible of ${inDom} in DOM (one shell each)`);
}
const stored = (page) =>
  page.evaluate(() => window.localStorage.getItem("user_location"));

async function shoot(page, vpTag, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}-${vpTag}.png`, fullPage: false });
}

async function run(browser, vp) {
  console.log(`\n== /he/map @ ${vp.width}px ==`);
  const isDesktop = vp.width >= 1024; // Tailwind `lg` — the shell boundary.

  // ---- 1 + 2: permission GRANTED context --------------------------------
  const granted = await newContext(browser, vp, { grant: true });
  let { page, pageErrors } = await openMap(granted);

  check((await stored(page)) === null, "nothing stored on load (no prompt on page load)");
  await shoot(page, vp.tag, "1-no-location-fresh");

  let fix;
  if (isDesktop) {
    const disabled = await page.locator(`${SORT} option[value="nearest"]`).isDisabled();
    check(disabled === false, '"מרחק" is never disabled', `disabled=${disabled}`);
    await page.selectOption(SORT, "nearest");
    await page.waitForTimeout(900);
    await shoot(page, vp.tag, "2-permission-granted-sorted");
    fix = await stored(page);
    check(fix !== null, "granted → fix persisted to localStorage", String(fix));
    check((await page.locator(SORT).inputValue()) === "nearest", "select stays on מרחק");
  } else {
    // No sort control on this shell. Seed a fix the way mobile actually gets
    // one (the NearMePill's writer) so the clear + persistence states below
    // are exercised on the viewport where they matter most.
    await page.evaluate(() => {
      window.localStorage.setItem("user_location", JSON.stringify({ lat: 32.0853, lng: 34.7818 }));
      window.dispatchEvent(new CustomEvent("mehamakor:user-location"));
    });
    await page.waitForTimeout(400);
    await shoot(page, vp.tag, "2-permission-granted-sorted");
    fix = await stored(page);
    check(fix !== null, "mobile: a fix can be held (NearMePill path)", String(fix));
    await checkExactlyOneVisibleClear(page,
      "mobile: exactly one clear affordance is visible (the gap this run found)");
  }

  // The claim a screenshot cannot make: survives a tab close. Closing the page
  // and opening a new one in the SAME context is the browser-level equivalent
  // of closing the tab — sessionStorage would be gone here, localStorage is not.
  await page.close();
  const reopened = await granted.newPage();
  await reopened.goto(`${BASE}/he/map`, { waitUntil: "networkidle" });
  await reopened.waitForTimeout(800);
  const afterReopen = await reopened.evaluate(() =>
    window.localStorage.getItem("user_location"),
  );
  check(afterReopen === fix, "fix survives a tab close (localStorage, not sessionStorage)",
    String(afterReopen));

  // ---- 4: clear affordance (same context, location present) --------------
  await checkExactlyOneVisibleClear(reopened, "exactly one clear affordance is visible");
  await reopened.locator(CLEAR_VISIBLE).click();
  await reopened.waitForTimeout(500);
  await shoot(reopened, vp.tag, "4-after-clear");
  check((await reopened.evaluate(() => window.localStorage.getItem("user_location"))) === null,
    "clear empties the stored location");
  if (isDesktop) {
    check((await reopened.locator(SORT).inputValue()) === "newest",
      "clearing drops the now-meaningless nearest sort",
      await reopened.locator(SORT).inputValue());
  }
  // After clearing there must be NOTHING to click — the affordance disappears
  // with the thing it clears.
  check((await reopened.locator(CLEAR_VISIBLE).count()) === 0,
    "clear affordance disappears once there is nothing to clear");
  check(pageErrors.length === 0, "0 page errors (granted context)", JSON.stringify(pageErrors));
  await granted.close();

  // ---- 3: permission DENIED context (desktop only — needs the select) -----
  if (!isDesktop) {
    console.log("    SKIP  denial path: no sort control on the mobile shell");
    return;
  }
  const denied = await newContext(browser, vp, { grant: false });
  ({ page, pageErrors } = await openMap(denied));
  await page.selectOption(SORT, "nearest");
  await page.waitForTimeout(1200);
  await shoot(page, vp.tag, "3-permission-denied-message");

  const toastText = await page.locator("body").innerText();
  const denialShown = toastText.includes("לא ניתן גישה למיקום");
  check(denialShown, "denial shows the Hebrew message");
  check(toastText.includes("עיר"), "the message names the manual alternative (city)");
  check(!/GeolocationPositionError|User denied|denied Geolocation/i.test(toastText),
    "the browser's English error text never reaches the user");
  check((await stored(page)) === null, "nothing stored on denial");
  check((await page.locator(SORT).inputValue()) !== "nearest",
    "select reverted to its previous value",
    await page.locator(SORT).inputValue());
  check(pageErrors.length === 0, "0 page errors (denied context)", JSON.stringify(pageErrors));
  await denied.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const vp of VIEWPORTS) await run(browser, vp);
  await browser.close();
  console.log(`\nScreenshots in ${OUT}`);
  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
