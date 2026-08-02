/**
 * MEH-1825 self-QA — the delivery-day axis on /producers.
 *
 * Drives the REAL /producers page in Chromium against a `next start` server,
 * with GET /api/producers intercepted so the grid is deterministic and the
 * request PARAMS are observable. The params are the point: the acceptance
 * criteria are all about which of delivery_city / delivery_day reach the API,
 * and a screenshot cannot show that.
 *
 * Run:  node e2e/qa-meh1825-producers-day-axis.mjs [--base http://localhost:3100]
 *
 * The city precondition is asserted in BOTH directions, because a check that
 * only ever sees the happy path cannot tell a working precondition from an
 * absent one: a day WITH a city must be sent, and a day WITHOUT a city must
 * not be — same page, same component, opposite expectation.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:3100";
const OUT = "../qa-artifacts/MEH-1825";
mkdirSync(OUT, { recursive: true });

const PRODUCER = {
  id: 1,
  name: "משק דמו",
  slug: "demo",
  city: "חיפה",
  description: "פירות וירקות מהשדה",
  categories: [],
  products: [],
  status: "approved",
  is_verified: true,
  offers_delivery: true,
  has_physical_location: true,
};

const results = [];
function check(label, pass, detail = "") {
  results.push({ label, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

/** Every GET /producers the page fired, as parsed query objects. */
function makeContextRecorder() {
  return { calls: [] };
}

async function newPage(browser, width, height, rec) {
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
    const u = new URL(req.url());
    const path = u.pathname.replace(/^\/api/, "");
    if (path === "/producers") {
      rec.calls.push(Object.fromEntries(u.searchParams.entries()));
    }
    const body =
      path === "/producers" ? [PRODUCER]
      : path === "/auth/me" ? null
      : [];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
      headers: { "x-total-count": "1" },
    });
  });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function dismissCookies(page) {
  const accept = page.getByRole("button", { name: "קבלו הכל" });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await page.waitForTimeout(300);
  }
}

async function run(browser, width, tag) {
  const rec = makeContextRecorder();
  const { ctx, page } = await newPage(browser, width, 900, rec);

  // ---- 1. Ghost state: /producers with no city at all -------------------
  await page.goto(`${BASE}/he/producers`, { waitUntil: "networkidle" });
  await dismissCookies(page);

  const row = page.getByTestId("delivery-day-row");
  check(`[${tag}] day row is mounted on /producers`, await row.count() === 1);
  check(
    `[${tag}] no city → ghost row + hint`,
    (await row.getAttribute("data-ghost")) === "true" &&
      (await page.getByTestId("delivery-day-hint").count()) === 1,
  );
  await page.screenshot({ path: `${OUT}/producers-day-ghost-${tag}.png`, fullPage: false });

  // A ghost tap must NOT filter — it routes into the city modal instead.
  // `force: true` is REQUIRED and is not a workaround for a broken control:
  // Playwright's actionability model treats aria-disabled="true" as disabled
  // and refuses the click, but MEH-1771 chose aria-disabled over the disabled
  // attribute exactly so these pills stay focusable and clickable — a real
  // browser dispatches the event and the handler opens LocationModal. Without
  // force, this check would time out on correct code.
  rec.calls.length = 0;
  await page.getByTestId("delivery-day-pill-שישי").click({ force: true });
  await page.waitForTimeout(500);
  check(
    `[${tag}] ghost tap opens the city modal (the hint's prerequisite)`,
    await page.getByRole("dialog").isVisible().catch(() => false),
  );
  check(
    `[${tag}] ghost tap fires no delivery_day request`,
    rec.calls.every((c) => !("delivery_day" in c)),
    JSON.stringify(rec.calls),
  );

  // ---- 2. City set → the day actually filters ---------------------------
  await page.goto(`${BASE}/he/producers?city=${encodeURIComponent("חיפה")}`, {
    waitUntil: "networkidle",
  });
  await dismissCookies(page);
  check(
    `[${tag}] city set → row leaves ghost state`,
    (await page.getByTestId("delivery-day-row").getAttribute("data-ghost")) === "false",
  );

  rec.calls.length = 0;
  await page.getByTestId("delivery-day-pill-שלישי").click();
  await page.waitForTimeout(900);

  const withDay = rec.calls.find((c) => c.delivery_day === "שלישי");
  check(
    `[${tag}] day tap sends delivery_city + delivery_day`,
    !!withDay && withDay.delivery_city === "חיפה",
    JSON.stringify(rec.calls),
  );
  check(
    `[${tag}] URL carries delivery_day after the tap`,
    new URL(page.url()).searchParams.get("delivery_day") === "שלישי",
    page.url(),
  );
  check(
    `[${tag}] tapped pill reads aria-pressed=true`,
    (await page.getByTestId("delivery-day-pill-שלישי").getAttribute("aria-pressed")) === "true",
  );
  await page.screenshot({ path: `${OUT}/producers-day-active-${tag}.png`, fullPage: false });

  // ---- 3. Toggle off ----------------------------------------------------
  await page.getByTestId("delivery-day-pill-שלישי").click();
  await page.waitForTimeout(900);
  check(
    `[${tag}] re-tap clears the day from the URL`,
    new URL(page.url()).searchParams.get("delivery_day") === null,
    page.url(),
  );

  // ---- 4. Deep link with a day but NO city → day ignored ----------------
  await page.goto(`${BASE}/he/producers?delivery_day=${encodeURIComponent("שלישי")}`, {
    waitUntil: "networkidle",
  });
  await dismissCookies(page);
  check(
    `[${tag}] day without city hydrates as ghost (precondition)`,
    (await page.getByTestId("delivery-day-row").getAttribute("data-ghost")) === "true" &&
      (await page.getByTestId("delivery-day-pill-שלישי").getAttribute("aria-pressed")) === "false",
  );

  // ---- 5. Invalid day in the URL → dropped, never sent ------------------
  rec.calls.length = 0;
  await page.goto(
    `${BASE}/he/producers?city=${encodeURIComponent("חיפה")}&delivery_day=${encodeURIComponent("יום-שאינו-קיים")}`,
    { waitUntil: "networkidle" },
  );
  await dismissCookies(page);
  check(
    `[${tag}] invalid delivery_day is never sent to the API`,
    rec.calls.length > 0 && rec.calls.every((c) => !("delivery_day" in c)),
    JSON.stringify(rec.calls),
  );

  await ctx.close();
}

// The CC sandbox ships chromium build 1194 while this repo's playwright pins a
// newer one; point at the pre-installed binary rather than downloading.
// Overridden with --chromium <path>, NOT an env var: the "Env drift" gate scans
// for process.env reads and would require documenting a local-only QA knob in
// .env.example, which is not part of the app's configuration surface.
const CHROMIUM = process.argv.includes("--chromium")
  ? process.argv[process.argv.indexOf("--chromium") + 1]
  : "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--ssl-version-max=tls1.2"],
});
await run(browser, 375, "375");
await run(browser, 1440, "1440");
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
