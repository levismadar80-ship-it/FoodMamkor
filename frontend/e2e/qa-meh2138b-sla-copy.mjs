/**
 * MEH-2138 chunk B self-QA — the two approval-SLA promises.
 *
 * A copy-only change across two unrelated surfaces, so the risk is not "does
 * it compile" but three things a JSON diff cannot show:
 *   1. Does the new string REACH the surface? A key edited at the wrong
 *      nesting level type-checks fine and renders the raw key path.
 *   2. Is the OLD promise really gone from that surface? A stale duplicate
 *      elsewhere in the tree would keep rendering "24 hours" while the diff
 *      looks complete.
 *   3. Does it FIT? Hebrew «מאושר עד 3 ימי עסקים — בדרך כלל מהר יותר» is 44
 *      chars against the old 27, on a `text-xs` line inside a recipe card at
 *      375px. A promise the reader cannot finish reading is not a promise.
 *
 * CASE 0 is a control with a known answer and runs FIRST on each surface: it
 * asserts the probe reads a DIFFERENT, known string from the same node family
 * (a recipe whose status is not `pending` must NOT show the ETA line at all).
 * If the probe reports the ETA string there too, it is not reading what it
 * thinks and every later PASS is void.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh2138b-sla-copy.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2138b";
const BASE = "http://localhost:3000";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const EXPECTED_ETA = "מאושר עד 3 ימי עסקים — בדרך כלל מהר יותר";
const EXPECTED_SUBTITLE =
  "כל ההגשות עוברות אישור צוות מהמקור. נחזור עד 3 ימי עסקים";
// The promises this chunk retires. Asserted ABSENT, because "the new string is
// present" and "the old string is gone" are different claims and only the
// second one catches a duplicated key still rendering somewhere on the page.
const RETIRED = ["24 שעות", "24–48", "24-48"];

let failures = 0;
const ran = [];
const check = (label, ok, detail) => {
  ran.push(label);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const recipe = (over = {}) => ({
  id: 900 + (over.id || 0),
  title: "חלה קלועה של סבתא",
  description: "מתכון מחמצת שעובר במשפחה",
  moderation_status: "pending",
  moderation_notes: null,
  is_published: false,
  image_url: null,
  ...over,
});

async function stub(page, recipes) {
  // Registered FIRST: Playwright matches routes in REVERSE registration order,
  // so a catch-all added last swallows every specific handler after it.
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.route("**/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        email: "owner@mehamakor.online",
        name: "בעלת עסק",
        role: "producer",
      }),
    })
  );
  // EXACT pathname, never `**/producers/me**` — that glob also matches a dozen
  // subroutes, and answering them all with the same body makes the page call
  // `.map` on an object and render its error boundary, which reads exactly
  // like "the element is missing".
  await page.route(
    (url) => url.pathname.endsWith("/producers/me"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "11111111-1111-1111-1111-111111111111",
          name: "מאפיית הבוקר",
          slug: "morning-bakery",
          status: "approved",
          categories: [],
          products: [],
          images: [],
          locations: [],
          delivery_areas: [],
        }),
      })
  );
  await page.route(
    (url) => url.pathname.endsWith("/producers/me/recipes"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(recipes),
      })
  );
  await page.addInitScript(() => localStorage.setItem("token", "qa-token"));
}

async function open(browser, width, path, recipes) {
  const page = await browser.newPage({
    viewport: { width, height: width === 375 ? 812 : 900 },
  });
  await stub(page, recipes);
  page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("CONSOLE:", m.text().slice(0, 300));
  });
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  return page;
}

/** Dump what the page actually rendered — a missing element and a redirect,
 *  an auth gate or an error boundary are indistinguishable from a locator. */
async function diagnostic(page, why) {
  const seen = await page.evaluate(() => ({
    url: location.href,
    testids: [...document.querySelectorAll("[data-testid]")]
      .map((n) => n.dataset.testid)
      .slice(0, 40),
    text: document.body.innerText.slice(0, 400),
  }));
  console.error(`DIAGNOSTIC (${why}):`, JSON.stringify(seen, null, 1));
}

async function shoot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/${name}-viewport.png` });
  console.log(`      screenshots → ${OUT}/${name}{,-viewport}.png`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });

  // ───────────────────── surface 1: recipes dashboard ─────────────────────
  //
  // case 0 — the control. A recipe that is NOT pending must render no ETA line
  // at all. If the probe finds one, it is matching some other node and every
  // assertion below is void.
  const ctl = await open(browser, 1440, "/producer/dashboard/recipes", [
    recipe({ id: 1, moderation_status: "approved", is_published: true }),
  ]);
  const ctlCount = await ctl.locator('[data-testid="recipe-pending-eta"]').count();
  if (ctlCount !== 0) await diagnostic(ctl, "control found an ETA line on a non-pending recipe");
  check(
    "0. CONTROL: an APPROVED recipe renders no pending-ETA line",
    ctlCount === 0,
    ctlCount === 0
      ? ""
      : `found ${ctlCount} — ⛔ the probe is not reading the ETA line; every PASS below is VOID`
  );
  await ctl.close();

  for (const width of [375, 1440]) {
    const page = await open(browser, width, "/producer/dashboard/recipes", [
      recipe({ id: 2 }),
    ]);
    const el = page.locator('[data-testid="recipe-pending-eta"]').first();
    const found = (await el.count()) > 0;
    if (!found) await diagnostic(page, `${width}: no pending-ETA line`);
    check(`${width} recipes: the pending recipe renders an ETA line`, found);

    const r = found
      ? await el.evaluate((n) => ({
          text: n.textContent.trim(),
          clipped: n.scrollWidth > n.clientWidth + 1,
          scrollW: n.scrollWidth,
          clientW: n.clientWidth,
        }))
      : {};
    check(
      `${width} recipes: it is the NEW approved string, byte-for-byte`,
      r.text === EXPECTED_ETA,
      `got=${JSON.stringify(r.text)}`
    );
    check(
      `${width} recipes: not a raw key path (the key resolved)`,
      !!r.text && !r.text.includes("pending_eta") && !r.text.includes("recipes."),
      `got=${JSON.stringify(r.text)}`
    );
    check(
      `${width} recipes: the line is not clipped — the reader can finish it`,
      r.clipped === false,
      `scrollWidth=${r.scrollW} clientWidth=${r.clientW}`
    );

    const body = await page.evaluate(() => document.body.innerText);
    const stale = RETIRED.filter((s) => body.includes(s));
    check(
      `${width} recipes: the retired 24-hour promise is GONE from the page`,
      stale.length === 0,
      stale.length ? `still present: ${stale.join(" · ")}` : ""
    );

    await shoot(page, `recipes-pending-eta-${width}`);
    await page.close();
  }

  // ───────────────────── surface 2: /experiences/new ──────────────────────
  for (const width of [375, 1440]) {
    const page = await open(browser, width, "/experiences/new", []);
    const body = await page.evaluate(() => document.body.innerText);
    const hasNew = body.includes(EXPECTED_SUBTITLE);
    if (!hasNew) await diagnostic(page, `${width}: subtitle not found`);
    check(
      `${width} experiences/new: the NEW subtitle renders byte-for-byte`,
      hasNew,
      hasNew ? "" : "not found in body text"
    );
    const stale = RETIRED.filter((s) => body.includes(s));
    check(
      `${width} experiences/new: the retired 24–48h promise is GONE`,
      stale.length === 0,
      stale.length ? `still present: ${stale.join(" · ")}` : ""
    );
    await shoot(page, `experiences-new-subtitle-${width}`);
    await page.close();
  }

  await browser.close();
  console.log(
    `\n${failures === 0 ? "PASS" : "FAIL"} — ${ran.length} assertions, ${failures} failed`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
