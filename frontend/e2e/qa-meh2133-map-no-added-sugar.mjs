/**
 * Self-QA for the no_added_sugar /map wiring.
 *
 * The defect: /map listed the chip in TOGGLE_CHIPS and FilterSheet rendered
 * it, while chipStateToParams emitted no param — so toggling it returned the
 * UNFILTERED set, silently. The fix removes one pinned flag.
 *
 * WHAT THIS HARNESS PROVES, and why it is built this way:
 *
 * The screenshot is NOT the evidence. A screenshot shows a chip looking
 * pressed, which it did while broken too. The evidence is the REQUEST URL —
 * whether `no_added_sugar=true` reaches the API at all — so every /api call is
 * recorded and printed, and the fixture only narrows when the param is
 * present. A run against the pinned code records the toggle, records no param,
 * and returns all three businesses.
 *
 * CONTROL, run first: `vegan` is a sibling diet axis on the same surface that
 * ALWAYS emitted. If toggling vegan does not produce a param either, the
 * harness is broken and every "no param" result below is worthless rather than
 * a finding.
 *
 * Every /api/** call is fulfilled from fixtures — the CC sandbox cannot reach
 * Railway (CLAUDE.md "Known Bug Patterns").
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual).
 * Run manually, against a `next start` on 3100:
 *     node e2e/qa-meh2133-map-no-added-sugar.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2133";
// Hard-coded, not env-driven: the Env-drift gate counts any process.env read
// in the repo as an undeclared var (regression rule 8, MEH-1539 precedent).
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const CATEGORIES = [
  { id: 1, name: "חלב וגבינות" },
  { id: 2, name: "לחמים ואפייה" },
  { id: 3, name: "דבש" },
];

const base = (id, name, slug, lat, lng, cat) => ({
  id,
  name,
  slug,
  city: "תל אביב",
  lat,
  lng,
  categories: [cat],
  is_approved: true,
  status: "approved",
  is_verified: false,
  has_physical_location: true,
  location_precision: "exact",
  images: [],
  avg_rating: 4.5,
  reviews_count: 4,
});

// Exactly one of the three carries no-added-sugar products. The fixture below
// filters on that, so "narrowed" is 3 -> 1 and is observable in the card list.
const ALL = [
  { ...base("11111111-1111-4111-8111-111111111111", "מחלבת השדה", "machlevet", 32.07, 34.78, CATEGORIES[0]), has_no_added_sugar_products: false },
  { ...base("22222222-2222-4222-8222-222222222222", "מאפיית רוח", "maafiya", 32.08, 34.79, CATEGORIES[1]), has_no_added_sugar_products: false },
  { ...base("33333333-3333-4333-8333-333333333333", "כוורת דבש טהור", "kaveret", 32.09, 34.77, CATEGORIES[2]), has_no_added_sugar_products: true },
];

const requests = [];

function fixtureFor(url) {
  const u = new URL(url);
  const path = u.pathname.replace(/^\/api/, "");
  if (path === "/categories") return CATEGORIES;
  if (!path.startsWith("/producers")) return [];
  // The whole point: the fixture narrows ONLY when the backend param arrives.
  let rows = ALL;
  if (u.searchParams.get("no_added_sugar") === "true") {
    rows = rows.filter((p) => p.has_no_added_sugar_products);
  }
  if (u.searchParams.get("vegan") === "true") {
    rows = []; // the control axis; emptiness is enough to see it landed
  }
  return rows;
}

async function toggleChip(page, key) {
  const chip = page.locator(`[data-testid="chip-${key}"]:visible`).first();
  await chip.waitFor({ state: "visible", timeout: 10_000 });
  await chip.click();
  await page.waitForTimeout(1200);
}

async function openSheet(page) {
  const btn = page.locator('button[aria-controls="filter-sheet-panel"]:visible').first();
  await btn.waitFor({ state: "visible", timeout: 20_000 });
  await btn.click();
  await page.waitForTimeout(700);
}

function paramsSeenSince(mark, name) {
  return requests
    .slice(mark)
    .filter((u) => u.includes("/producers"))
    .filter((u) => new URL(u).searchParams.get(name) === "true");
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const summary = [];

  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
  });

  // MEH-1539 gotcha: the "**/api/**" glob does not match here — use "**/*"
  // plus an explicit URL check.
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    requests.push(url);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixtureFor(url)),
    });
  });

  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.addInitScript(() => {
    try {
      // Value must be "all" | "essential" (CookieBanner.jsx:11); a wrong value
      // leaves the banner up and it intercepts pointer events at z-1100.
      localStorage.setItem("cookieConsent", "essential");
    } catch {}
  });

  await page.goto(`${BASE}/map`, { waitUntil: "domcontentloaded" });
  await page.locator(".leaflet-container:visible").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(2500);

  const countCards = async () => page.locator('[data-testid="map-card"]:visible').count();

  const cardsBefore = await countCards();
  await page.screenshot({ path: `${OUT}/map-375-1-unfiltered.png` });

  // ── CONTROL FIRST ─────────────────────────────────────────────────────────
  // vegan always emitted, before and after this change. If it does not land,
  // the harness cannot see params at all and nothing below means anything.
  await openSheet(page);
  let mark = requests.length;
  await toggleChip(page, "vegan");
  const controlHits = paramsSeenSince(mark, "vegan");
  await toggleChip(page, "vegan"); // back off, so the real test starts clean
  await page.waitForTimeout(800);

  // ── THE SUBJECT ───────────────────────────────────────────────────────────
  await page.screenshot({ path: `${OUT}/map-375-2-sheet-open.png` });
  mark = requests.length;
  await toggleChip(page, "no_added_sugar");
  const subjectHits = paramsSeenSince(mark, "no_added_sugar");
  await page.screenshot({ path: `${OUT}/map-375-3-toggled-on.png` });

  // Close the sheet so the narrowed card list is what the screenshot shows.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  const cardsFiltered = await countCards();
  await page.screenshot({ path: `${OUT}/map-375-4-narrowed.png` });

  // ── REMOVAL RESTORES ──────────────────────────────────────────────────────
  await openSheet(page);
  await toggleChip(page, "no_added_sugar");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  const cardsRestored = await countCards();
  await page.screenshot({ path: `${OUT}/map-375-5-restored.png` });

  summary.push({
    controlVeganParamRequests: controlHits.length,
    subjectNoAddedSugarParamRequests: subjectHits.length,
    exampleSubjectUrl: subjectHits[0] ?? null,
    cardsBefore,
    cardsFiltered,
    cardsRestored,
    pageErrors: pageErrors.length,
  });

  await ctx.close();
  await browser.close();

  console.log("\n=== MEH-2133 /map no_added_sugar — 375px ===");
  console.log(JSON.stringify(summary[0], null, 2));

  const s = summary[0];
  const verdicts = [
    ["CONTROL vegan param observed (harness can see params at all)", s.controlVeganParamRequests > 0],
    ["no_added_sugar=true reached the API", s.subjectNoAddedSugarParamRequests > 0],
    ["result set NARROWED while filtered", s.cardsFiltered < s.cardsBefore],
    ["result set RESTORED after removing the filter", s.cardsRestored === s.cardsBefore],
    ["no page errors", s.pageErrors === 0],
  ];
  let ok = true;
  for (const [label, pass] of verdicts) {
    if (!pass) ok = false;
    console.log(`${pass ? "PASS" : "FAIL"}  ${label}`);
  }
  if (!s.controlVeganParamRequests) {
    console.log(
      "\n!! CONTROL FAILED — the harness never observed a param it KNOWS is emitted.\n" +
        "   Every other result in this run is void, including the reassuring ones.",
    );
  }
  console.log(ok ? "\nALL PASS" : "\nFAILURES ABOVE");
  process.exit(ok ? 0 : 1);
})();
