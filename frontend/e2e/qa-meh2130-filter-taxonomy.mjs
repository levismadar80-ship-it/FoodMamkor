/**
 * MEH-2130 self-QA — the משלוח + איסוף עצמי pair across all three surfaces.
 *
 * Route-mocked against a local `next start` (MEH-1591 pattern): the CC sandbox
 * cannot reach Railway or staging (MEH-2090), so every /api/** call is fulfilled
 * from fixtures here. That makes the run deterministic and offline — and it is
 * why this file asserts LAYOUT and PRESENCE only. It is not evidence about the
 * backend, and it is Chromium-only, so it is not engine evidence either
 * (workflow rule 23 carve-out (e)).
 *
 * Run:  node e2e/qa-meh2130-filter-taxonomy.mjs
 * Out:  qa-artifacts/MEH-2130/*.png  (compress before committing — MEH-1156)
 *
 * CONTROL FIRST. Every assertion below is a presence check, and a presence
 * check on a page that failed to render reports the reassuring answer
 * (.claude/rules/testing.md — "a probe whose null output is also its reassuring
 * output"). So the harness first proves the page actually rendered by requiring
 * a chip row with a KNOWN pre-existing chip on it; if that control fails, every
 * later null in the run is void and the script says so and exits non-zero.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
// The repo's pinned @playwright/test wants a Chromium build the sandbox image
// does not carry, and the download host is proxy-blocked (MEH-2090). The image
// ships a working Chromium at this stable symlink, so point at it explicitly
// rather than downloading. Harmless on CI, which resolves its own binary.
const EXECUTABLE_PATH = process.env.QA_CHROMIUM ?? "/opt/pw-browsers/chromium";
const OUT = "qa-artifacts/MEH-2130";

const CATEGORIES = [
  { id: 1, name: "ירקות ופירות", emoji: "" },
  { id: 2, name: "חלב וגבינות", emoji: "" },
];

// Enough businesses to satisfy every runtime data gate the listing applies
// (OPEN_NOW_CHIP_MIN / DIET_CHIP_MIN = 5), so a chip missing from a screenshot
// means the taxonomy did not offer it — never that a gate quietly hid it.
const PRODUCERS = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  name: `בית עסק ${i + 1}`,
  slug: `business-${i + 1}`,
  description: "תיאור קצר של בית העסק לצורכי בדיקה.",
  city: "תל אביב",
  categories: [CATEGORIES[i % 2]],
  image_url: null,
  is_verified: i % 3 === 0,
  kashrut_verified_at: i % 4 === 0 ? "2026-01-01T00:00:00Z" : null,
  delivers: i % 2 === 0,
  offers_pickup: i % 2 === 1,
  has_delivery: i % 2 === 0,
  pickup_points: i % 2 === 1,
  has_no_added_sugar_products: true,
  has_vegan_products: true,
  order_window: i < 8 ? { opens_at: "08:00", closes_at: "20:00" } : null,
  avg_rating: null,
  reviews_count: 0,
  days_since_created: 100,
  latitude: 32.07 + i * 0.01,
  longitude: 34.78 + i * 0.01,
}));

async function mockApi(page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname.replace(/^\/api/, "");
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (p.startsWith("/categories")) return json(CATEGORIES);
    if (p.startsWith("/producers/random")) return json(PRODUCERS[0]);
    if (p.startsWith("/producers")) return json(PRODUCERS);
    if (p.startsWith("/stats")) return json({ producers_count: 12, categories_count: 2 });
    return json([]);
  });
}

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

const failures = [];
const ran = [];
function check(name, ok, detail = "") {
  ran.push(name);
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Land on a page and settle it, without ever gating on the network going quiet
 * (`networkidle` is banned in this repo — .claude/rules/testing.md, MEH-215).
 * Gates on the thing we care about instead: the grid section existing and being
 * attached. The retry loop is for hydration, which can swap the node under a
 * scroll call — the error this replaces was exactly that.
 */
async function landOnGrid(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const grid = page.locator("#producers-grid");
  await grid.waitFor({ state: "attached", timeout: 15_000 });
  await page.waitForTimeout(1500); // hydration; the node can be re-mounted
  // Put the TOP of the section just below the sticky header, so the chip row
  // and the applied-filter strip — the actual subject of this ticket — are in
  // frame. `scrollIntoViewIfNeeded` alone parks the section wherever it fits
  // and had been photographing the empty-state block 600px further down: a
  // capture that exits 0 while showing none of the thing under test
  // (the #2786 lesson — six PNGs, six successes, an error boundary).
  await grid.evaluate((el) => {
    const HEADER = 96;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - HEADER });
  });
  await page.waitForTimeout(600);
}

/** Is the element's box inside the current viewport (i.e. will it be in the shot)? */
async function inViewport(page, locator, vp) {
  const box = await locator.boundingBox();
  if (!box) return false;
  return box.y >= 0 && box.y + box.height <= vp.height && box.x >= 0 && box.width > 0;
}

async function shoot(page, file) {
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: false });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXECUTABLE_PATH });

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await mockApi(page);

    // ── home ───────────────────────────────────────────────────────────
    await landOnGrid(page, `${BASE}/he`);

    const homeChips = page.locator("#producers-grid button, #producers-grid [role='button']");
    const homeText = await page.locator("#producers-grid").innerText();

    // CONTROL — a chip that existed BEFORE this change must be on the row. If
    // this fails the page did not render and every null below is meaningless.
    check(
      "CONTROL home chip row rendered (pre-existing chip present)",
      homeText.includes("רישוי מאומת"),
      `${await homeChips.count()} buttons in the grid section`,
    );

    check("home shows משלוח", homeText.includes("משלוח"));
    check("home shows איסוף עצמי (NEW — MEH-2130)", homeText.includes("איסוף עצמי"));
    // The attribute row is a HORIZONTAL SCROLLER (ChipScrollRow), and at 375px
    // the pair sits past the fold of it — the same place `verified` has always
    // sat, so this is the row's existing behaviour and not something MEH-2130
    // introduced. Scroll the row to its inline-end so the shot shows the chip;
    // without this the capture is honest about the DOM and useless as evidence.
    await page.getByRole("button", { name: "איסוף עצמי" }).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    // A text assertion proves the chip is in the DOM; it says nothing about
    // whether the SCREENSHOT shows it. Assert the pixel fact separately, or the
    // artifact and the claim it supports come apart.
    check(
      "the איסוף עצמי chip is inside the captured viewport",
      await inViewport(page, page.getByRole("button", { name: "איסוף עצמי" }).first(), vp),
    );
    await shoot(page, `home-${vp.name}`);

    // Applied-filter strip: arrive with a filter active and prove it is removable.
    await landOnGrid(page, `${BASE}/he?pickup_points=1`);
    const tag = page.locator('[data-testid="home-active-filter-pickup_points"]');
    check(
      "home hydrates ?pickup_points=1 into a REMOVABLE applied-filter tag",
      (await tag.count()) === 1,
      `count=${await tag.count()}`,
    );
    await shoot(page, `home-applied-filter-${vp.name}`);
    if ((await tag.count()) === 1) {
      await tag.first().click();
      await page.waitForTimeout(900);
      check(
        "clicking the × removes the tag AND the URL param",
        (await tag.count()) === 0 && !new URL(page.url()).searchParams.has("pickup_points"),
        page.url(),
      );
    }

    // ── /producers ─────────────────────────────────────────────────────
    await page.goto(`${BASE}/he/producers`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.locator('[data-testid="producers-filters-button"]').click();
    await page.waitForTimeout(700);
    const sheet = await page.locator("#filter-sheet-panel").innerText();
    check("/producers sheet CONTROL (pre-existing chip present)", sheet.includes("רישוי מאומת"));
    check("/producers sheet shows משלוח", sheet.includes("משלוח"));
    check("/producers sheet shows איסוף עצמי (NEW — MEH-2130)", sheet.includes("איסוף עצמי"));
    // The sheet scrolls, and the service group is last (diet → quality →
    // service), so the pair is below the fold on a 375px panel. Bring it into
    // frame for the same reason as the home row above: a shot that does not
    // contain the subject is not evidence for it.
    const pickupRow = page
      .locator("#filter-sheet-panel")
      .getByText("איסוף עצמי", { exact: true })
      .first();
    await pickupRow.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    check(
      "the /producers sheet pickup row is inside the captured viewport",
      await inViewport(page, pickupRow, vp),
    );
    await shoot(page, `producers-sheet-${vp.name}`);

    // ── /map (must be UNCHANGED) ───────────────────────────────────────
    await page.goto(`${BASE}/he/map`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const mapText = await page.locator("body").innerText();
    check("/map CONTROL (page rendered)", mapText.includes("סינון"));
    check("/map still promotes the pair in ServiceChipRow", mapText.includes("משלוח") && mapText.includes("איסוף עצמי"));
    await shoot(page, `map-${vp.name}`);

    await ctx.close();
  }

  await browser.close();

  // Derived, never stated — adding a check() call moves this number by itself
  // (.claude/rules/testing.md: derive counts, never state them).
  console.log(`\n${ran.length} assertions ran, ${failures.length} failed`);
  if (failures.length) {
    console.error("FAILURES:\n  " + failures.join("\n  "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
