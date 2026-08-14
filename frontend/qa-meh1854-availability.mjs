/**
 * MEH-1854 chunk 1 — post-merge visual check for the availability read path.
 *
 * WHY THIS EXISTS: the PR merged with its YELLOW self-QA screenshots NOT
 * produced, and the intended substitute (checking staging after merge) is
 * unavailable — staging.mehamakor.online returns 302 -> vercel.com/sso-api on
 * every path (Vercel Deployment Protection), measured 2026-08-14. This runs the
 * same check against a local `next start` instead.
 *
 * WHAT IT PROVES: the two regressions the PR fixes, on a real rendered card.
 *   B  legacy-only availability_status:"full"  -> muted dot   (before: NO dot)
 *   C  enum-only availability_state:"available_today" -> Friday pill (before: NO pill)
 *
 * CONTROLS — every one of these aborts rather than writing a reassuring file.
 * A capture harness that photographs an error boundary and exits 0 is the
 * documented failure here (#2894 wrote five files, logged five successes, and
 * every image showed the BottomNav). Each control below fired at least once
 * during development or is pinned against a state known to produce output.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Hardcoded — see the note in qa-meh1854-mockapi.mjs. An env read here reds the
// required Env drift gate as an undocumented variable.
const BASE = "http://localhost:3000";
const OUT = "qa-artifacts/MEH-1854";

// The matrix. Each row names the state it exercises and what the OLD code did.
const FIXTURES = [
  {
    id: 9001,
    name: "א · enum full_this_week",
    slug: "qa-enum-full",
    availability_state: "full_this_week",
    expectDot: true,
    expectPill: false,
    note: "enum path — worked before too (control, not evidence)",
  },
  {
    id: 9002,
    name: "ב · legacy full (REGRESSION)",
    slug: "qa-legacy-full",
    availability_state: null,
    availability_status: "full",
    expectDot: true,
    expectPill: false,
    note: "THE REGRESSION — old chain dropped the 'full' rung, rendered NO dot",
  },
  {
    id: 9003,
    name: "ג · enum available_today (REGRESSION)",
    slug: "qa-enum-today",
    availability_state: "available_today",
    is_available_today: false,
    expectDot: true,
    expectPill: true,
    note: "THE REGRESSION — pill read the legacy flag directly, rendered NO pill",
  },
  {
    id: 9004,
    name: "ד · legacy is_available_today",
    slug: "qa-legacy-today",
    availability_state: null,
    is_available_today: true,
    expectDot: true,
    expectPill: true,
    note: "fallback path — the live path for every un-backfilled row",
  },
];

// The payload itself lives in qa-meh1854-mockapi.mjs — it has to be served by
// the API the SERVER fetches, not by this process. FIXTURES above is kept only
// for the expected count and the per-state reading table.

const fail = (msg) => {
  console.error(`\n[CONTROL FAILED] ${msg}`);
  console.error("Every reading in this run is void. No artifact is trustworthy.\n");
  process.exit(1);
};

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  // The image ships chromium-1194; this repo's @playwright/test expects -1234.
  // Per the sandbox guidance, point at the installed binary rather than running
  // `playwright install` (which is disabled here).
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const results = [];

  // TWO SURFACES, because one page cannot carry both readings:
  //   /producers renders the dot but NEVER the Friday pill — `fridayMode` is
  //   not plumbed into that page at all (its only consumers are
  //   HomeClient.jsx:83/:223 -> HomeProducersGrid.jsx:232). Asserting a pill
  //   there would fail for the right reason on the wrong page.
  //   home renders both, and fetches its feed CLIENT-side, so the same mock
  //   API serves it via NEXT_PUBLIC_API_URL.
  const SURFACES = [
    { path: "/producers", pill: false },
    { path: "/", pill: true },
  ];

  for (const { path, pill: pillSurface } of SURFACES)
  for (const width of [375, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });

    // Force Friday mode deterministically via the override the helper already
    // supports (lib/friday-mode.js:6) — no date faking, no clock mocking.
    await ctx.addInitScript(() => {
      try {
        window.localStorage.setItem("friday_mode_override", "1");
      } catch {
        /* ignore */
      }
    });

    // NO page.route() here, deliberately. Two reasons, both measured:
    //   1. /producers is SERVER-rendered, so a browser-side route never sees
    //      the feed request at all — that is what qa-meh1854-mockapi.mjs is
    //      for (start it on :4010 and run next with NEXT_PUBLIC_API_URL
    //      pointed at it).
    //   2. A `**/producers**` pattern also matches the DOCUMENT navigation to
    //      /producers, so fulfilling it with a JSON array replaces the page
    //      itself with raw JSON — zero cards, which is exactly how CONTROL 2
    //      below reported this harness broken twice before the stub was cut.
    const page = await ctx.newPage();
    // `he` is the default locale, so next-intl 307s /he/producers -> /producers.
    // Going straight to the canonical path avoids a redirect mid-capture.
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });

    // CONTROL 0 — is Friday mode actually ON? addInitScript's localStorage
    // write is inside a try/catch (both here and in lib/friday-mode.js:6), so a
    // failed write produces NO error and simply renders no pill — which reads
    // exactly like the regression this harness exists to detect. Assert the
    // flag, and re-set + reload if the init script did not take.
    let flag = await page.evaluate(() => {
      try {
        return window.localStorage.getItem("friday_mode_override");
      } catch {
        return "THREW";
      }
    });
    if (flag !== "1") {
      await page.evaluate(() => window.localStorage.setItem("friday_mode_override", "1"));
      await page.reload({ waitUntil: "domcontentloaded" });
      flag = await page.evaluate(() => window.localStorage.getItem("friday_mode_override"));
    }
    if (flag !== "1") {
      fail(`friday_mode_override is ${JSON.stringify(flag)} on ${path} — every pill reading below would be a false negative`);
    }

    await page
      .waitForSelector('[data-testid="producer-card"]', { timeout: 20_000 })
      .catch(() => {});
    // Home fetches its feed client-side; the cards can mount a tick before the
    // fridayMode effect (use-home-page.js:187) has re-rendered them.
    await page.waitForTimeout(1_500);

    // CONTROL 1 — error boundary. #2894 photographed one and exited 0.
    const boundary = await page.getByText("משהו השתבש").count();
    if (boundary > 0) fail(`error boundary rendered on ${path} at ${width}px`);

    // CONTROL 2 — did the stub actually intercept? Zero cards means every
    // per-card assertion below passes for the wrong reason.
    const cards = await page.locator('[data-testid="producer-card"]').count();
    if (cards < FIXTURES.length) {
      fail(
        `expected ${FIXTURES.length} cards on ${path}, found ${cards} at ${width}px — ` +
          `the mock feed did not reach the page, so no card reading is meaningful`
      );
    }

    // CONTROL 3 — no horizontal overflow.
    const docW = await page.evaluate(() => document.documentElement.scrollWidth);
    if (docW > width) fail(`horizontal overflow on ${path} at ${width}px: ${docW} > ${width}`);

    // THE READING. Per fixture, does the rendered card carry the dot / the
    // Friday pill? This is what the PR's two regressions are about, and it is
    // strictly stronger than reading a PNG — it names the element instead of
    // asking a human to spot a 8px circle.
    const readings = [];
    for (const f of FIXTURES) {
      // Identify the card by its OWN link (ProducerCard.jsx:204 — `/${slug}`),
      // not by matching its display text. A text filter would silently match
      // two cards the moment two fixture names share a substring.
      const card = page
        .locator('[data-testid="producer-card"]')
        .filter({ has: page.locator(`a[href^="/${f.slug}"]`) });
      const n = await card.count();
      if (n !== 1) fail(`fixture ${f.slug}: expected 1 card, matched ${n} on ${path} at ${width}px`);

      const dot = (await card.locator('[data-testid="availability-dot"]').count()) > 0;
      // "מגיעה היום" = he.json:899, the `producer.card.badges.available_today`
      // key ProducerCard.jsx:588 actually renders. NOT the "זמין היום" at
      // he.json:4095 — that is a different namespace (a filter tooltip), and
      // using it made every pill read false while the pills were on screen.
      const pill = (await card.getByText("מגיעה היום", { exact: true }).count()) > 0;
      // The pill is a home-only element, so /producers expects false for every
      // fixture — that is the page's real contract, not a skipped assertion.
      const expectPill = pillSurface ? f.expectPill : false;
      readings.push({ fixture: f.slug, dot, pill, expectDot: f.expectDot, expectPill });
    }
    const wrong = readings.filter((r) => r.dot !== r.expectDot || r.pill !== r.expectPill);
    if (wrong.length) {
      console.error(JSON.stringify(readings, null, 2));
      fail(`${wrong.length} fixture(s) rendered the wrong availability on ${path} at ${width}px`);
    }

    // Scroll the fixtures into frame FIRST. `fullPage: false` captures the
    // viewport, and on home the cards sit well below the hero — the first
    // version of this capture photographed the hero and showed none of the
    // dots or pills it was taken to evidence.
    const tag = path === "/" ? "home" : "producers";
    await page.locator('[data-testid="producer-card"]').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(400); // let scroll-linked animation settle
    await page.screenshot({ path: `${OUT}/availability-${tag}-${width}.png`, fullPage: false });
    results.push({ surface: path, width, cards, boundary, docW, readings });
    await ctx.close();
  }

  await browser.close();
  console.log(JSON.stringify({ ok: true, results }, null, 2));
  const n = results.reduce((a, r) => a + r.readings.length, 0);
  console.log(
    `\n${n} readings across ${results.length} surface/width combinations, all matching.\n` +
      "The dot/pill assertions are made in the DOM above, so this exit code IS a\n" +
      "reading — but it is only evidence because it was shown going red first:\n" +
      "removing the 'full' rung from lib/availability.js reds qa-legacy-full's dot,\n" +
      "and pointing isAvailableToday back at the legacy column reds qa-enum-today's\n" +
      "pill. Re-run that construction before trusting a future green.\n"
  );
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
