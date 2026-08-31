/**
 * MEH-2230 Phase 0 — REPRODUCTION ATTEMPT, not a fix.
 *
 * Question (card §3): at 375, does the /admin/producers kebab panel for a LOW
 * row open below the fold, and does scrolling to it close it?
 *
 * Drives the REAL /he/admin/producers page in Chromium against `next start`,
 * every /api/** call fulfilled from fixtures (house pattern — see
 * qa-meh1701-admin-mobile-badge.mjs).
 *
 * CONTROLS, run FIRST and failing loudly (card §3.4): if the table or the
 * triggers are absent, every "panel is off-screen" reading below is void —
 * "off-screen" and "never opened" are indistinguishable otherwise.
 *
 * Run: node e2e/qa-meh2230-admin-kebab-viewport.mjs
 */
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const ADMIN = { id: 1, email: "admin@example.com", role: "admin", name: "ספיר" };
const N_ROWS = 15;

const producers = Array.from({ length: N_ROWS }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  name: `חוות בדיקה ${i + 1}`,
  slug: `test-farm-${i + 1}`,
  city: "תל אביב",
  status: "approved",
  images: [],
  categories: [],
  created_at: "2026-08-01T10:00:00Z",
  submitted_for_review_at: "2026-08-01T10:00:00Z",
  business_days_waiting: 1,
  ambassador: false,
  risk_score: null,
  risk_reasoning: null,
  _completeness: 100,
}));

let failures = 0;
const check = (ok, label, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures += 1;
};

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
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
  await page.goto(`${BASE}/he/admin/producers`, { waitUntil: "load" });
  await page.waitForTimeout(2000);

  const vh = await page.evaluate(() => window.innerHeight);

  // ---------- CONTROL 1: the triggers exist at all ----------
  const triggers = page.locator('button[aria-haspopup="menu"][aria-label="פעולות נוספות"]');
  const nTriggers = await triggers.count();
  check(nTriggers > 0, `CONTROL: kebab triggers present (found ${nTriggers})`);
  if (nTriggers === 0) {
    console.log("\n⛔ CONTROL FAILED — the page did not render kebab triggers.");
    console.log("   Every measurement below would be void. Aborting.");
    await browser.close();
    process.exit(1);
  }
  console.log(`INFO  viewport height = ${vh}px, ${nTriggers} kebab triggers rendered`);
  const tBox = await triggers.first().boundingBox();
  console.log(`INFO  first trigger box: x=${tBox.x.toFixed(0)} y=${tBox.y.toFixed(0)} (x<0 => the actions column is off-screen on the inline axis at 375)`);

  // NOTE (measured, not assumed): the kebab column sits at x<0 inside the
  // table's overflow-x-auto at 375 — the first row's trigger boxes at
  // x=-168. Playwright's .click() therefore scrolls it into view, and that
  // scroll fires AdminRowMenu's capture-phase `handleReflow` -> setOpen(false),
  // so a normal .click() can never leave the panel open. We dispatch the click
  // directly on the element to isolate the VERTICAL question this card asks.
  const openAndMeasure = async (idx, label) => {
    // Guard: nothing may be open before we open ours, or we would measure the
    // PREVIOUS panel and report it as this one. (This fired on the first run —
    // both rows reported byte-identical geometry, which is what exposed it.)
    const stale = await page.locator('[role="menu"]').count();
    if (stale !== 0) {
      console.log(`FAIL  ${label}: ${stale} panel(s) already open before clicking — measurement void`);
      failures += 1;
      return { opened: false, label, stale: true };
    }
    const tb = await triggers.nth(idx).boundingBox();
    await triggers.nth(idx).evaluate((el) => el.click());
    await page.waitForTimeout(300);
    console.log(`INFO  ${label}: trigger y=${tb.y.toFixed(0)} bottom=${(tb.y + tb.height).toFixed(0)}`);
    const menu = page.locator('[role="menu"]');
    if ((await menu.count()) === 0) return { opened: false, label };
    const box = await menu.first().boundingBox();
    return { opened: true, label, ...box, overflow: box.y + box.height - vh };
  };

  // ---------- CONTROL 2: a TOP row must be fully inside the viewport ----------
  const top = await openAndMeasure(0, "top row");
  check(top.opened, "CONTROL: top-row panel opens");
  if (top.opened) {
    check(
      top.overflow <= 0,
      "CONTROL: top-row panel fits inside the viewport",
      `y=${top.y.toFixed(0)} h=${top.height.toFixed(0)} bottom=${(top.y + top.height).toFixed(0)} vh=${vh} overflow=${top.overflow.toFixed(0)}px`,
    );
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  console.log(`INFO  after Escape, open panels = ${await page.locator('[role="menu"]').count()}`);

  // ---------- SUBJECT: the LAST row, in the REAL user flow ----------
  // The last row's trigger sits at y~2085 on an 812 viewport — the user must
  // scroll to it before it can be clicked at all. Measuring it unscrolled
  // reports the trigger's own off-screen position, not the panel's fit, so we
  // scroll it into view FIRST (which also closes any open menu — that is the
  // capture-phase handler doing its job) and only then open it.
  await triggers.nth(nTriggers - 1).evaluate((el) =>
    el.scrollIntoView({ block: "end", behavior: "instant" }),
  );
  await page.waitForTimeout(400);
  const last = await openAndMeasure(nTriggers - 1, "last row (scrolled into view)");
  check(last.opened, "SUBJECT: last-row panel opens");
  if (last.opened) {
    const clipped = last.overflow > 0;
    console.log(
      `${clipped ? "REPRO" : "no-repro"}  last-row panel: y=${last.y.toFixed(0)} h=${last.height.toFixed(0)} ` +
      `bottom=${(last.y + last.height).toFixed(0)} vh=${vh} overflow=${last.overflow.toFixed(0)}px`,
    );

    // ---------- scroll-closes-it ----------
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(300);
    const stillOpen = (await page.locator('[role="menu"]').count()) > 0;
    console.log(`INFO  after scrolling 200px, panel still open? ${stillOpen ? "YES" : "NO (closed)"}`);
    if (clipped && !stillOpen) {
      console.log("REPRO  the escape route is closed: panel below the fold AND scroll dismisses it.");
    }
  }

  console.log(`\n${failures === 0 ? "controls OK" : failures + " control failure(s)"}`);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
