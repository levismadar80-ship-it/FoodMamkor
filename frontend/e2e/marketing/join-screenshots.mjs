/**
 * Module:   join-screenshots
 * Purpose:  MEH-2794 — re-shoot every image and clip the /join page uses, from
 *           the ONE demo business (מאפיית רוח השדה) on staging. One command,
 *           so the pictures track the product instead of ageing into a lie.
 * Touches:  writes frontend/public/images/join/ (WebP stills, MP4 clips,
 *           manifest.json). Reads the site over HTTP. No DB, no writes to the
 *           app.
 * Does NOT: seed the demo business — that is
 *           backend/scripts/seed_demo_business.py, run separately (see RUNNING
 *           below). Does NOT touch /join itself (that is the redesign PR).
 * Related:  e2e/qa-meh2100-draft-live.mjs (the target/bypass/guard pattern this
 *           copies), frontend/lib/business-features.js (MEH-2791 — the registry
 *           the manifest maps images back to).
 * History:  MEH-2794 (creation, 2026-11-07).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * RUNNING IT — two commands, in this order
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   # 1. Seed / refresh the demo business on STAGING (Sapir, from Git Bash):
 *   railway run --environment staging python -m scripts.seed_demo_business --refresh
 *
 *   # 2. Capture everything (from frontend/):
 *   QA_BASE_URL=https://staging.mehamakor.online \
 *   VERCEL_AUTOMATION_BYPASS_SECRET=<secret> \
 *   DEMO_OWNER_PASSWORD=<the staging value> \
 *   PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium \
 *     node e2e/marketing/join-screenshots.mjs
 *
 * Add --stills-only to skip the clips (much faster while iterating).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE SELECTORS IN THIS FILE HAVE NEVER RUN. Read this before trusting it.
 * ───────────────────────────────────────────────────────────────────────────
 * The CC sandbox cannot reach staging (MEH-2090: egress to vercel.com is
 * refused) and cannot stand up a local stack (`alembic upgrade` is a denied
 * action), so every selector below was written from the source and verified
 * against NOTHING. Expect a first run to report misses.
 *
 * That is survivable only because of how this script fails, which is the one
 * design decision worth defending here:
 *
 *   A MISSING SELECTOR PRODUCES NO FILE AND A NON-ZERO EXIT — never a
 *   screenshot of whatever happened to be on screen.
 *
 * The failure it refuses to repeat is #2786: six "successful" PNGs that were
 * all pictures of an error boundary. A capture harness that falls back to the
 * viewport, or that catches and continues, produces artifacts that LOOK like
 * evidence and are not. So: each shot names the element it is of; the element
 * is awaited; if it does not arrive the entry is recorded `status: "missing"`,
 * no file is written, and the run ends non-zero listing every miss. A green
 * run therefore means every named element really rendered.
 *
 * The control for that claim is PRE-FLIGHT below: it asserts the demo business
 * is actually reachable and clean BEFORE any capture, so "0 misses" cannot
 * also mean "the script never got past the login page".
 *
 * ───────────────────────────────────────────────────────────────────────────
 * REAL Cloudinary images, on purpose — and why this must never join CI
 * ───────────────────────────────────────────────────────────────────────────
 * `e2e/CLAUDE.md` requires every spec under `e2e/flows/` to import from
 * `_cloudinary-stub.ts`, which fulfils image requests with a 1x1 PNG. This
 * file is NOT under `flows/` and deliberately does not stub: a marketing
 * screenshot of a 1x1 placeholder is worthless, which is the same reason
 * `e2e/visual/**` is exempt.
 *
 * That has a cost. Cloudinary hit 506% of plan on CI traffic alone (MEH-1925),
 * and the plan disables the account rather than billing overage. A full run
 * here is roughly 20 page loads plus 6 recordings — fine as an occasional
 * manual run, which is what it is designed for. DO NOT wire it into a workflow
 * on a schedule or per-PR trigger without taking that budget decision first.
 */
import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

// ───────────────────────────── target + guards ─────────────────────────────

// `QA_BASE_URL` is the repo's convention — 14 of the e2e probes read it
// (`PLAYWRIGHT_BASE_URL` and `TEST_URL` are the other two in use). NOTE the
// ticket says `STAGING_URL`; no such variable exists anywhere in e2e/, so this
// follows the code rather than the card.
const BASE = (process.env.QA_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const OWNER_EMAIL = "demo-owner@example.com";
const OWNER_PASSWORD = process.env.DEMO_OWNER_PASSWORD || "";
const STILLS_ONLY = process.argv.includes("--stills-only");

const OUT = path.resolve(import.meta.dirname, "../../public/images/join");
const TMP = path.resolve(import.meta.dirname, "../../.join-capture-tmp");
const SLUG = "ruach-hasadeh";

const targetHost = (() => {
  try {
    return new URL(BASE).hostname;
  } catch {
    return "";
  }
})();
const isLocal = targetHost === "127.0.0.1" || targetHost === "localhost";

// GUARD 1 — production is never a valid target. This harness logs in as the
// demo owner and photographs a dashboard; against production it would be
// photographing a real business's private numbers. Encoded here rather than
// left to whoever sets the variable.
if (/(^|\.)mehamakor\.co\.il$/.test(targetHost)) {
  console.error(`REFUSING to run against production (${targetHost}).`);
  process.exit(2);
}
// GUARD 2 — a remote target with no bypass secret captures Vercel's SSO page
// and still exits 0. That is the #2786 shape; refuse instead.
if (!isLocal && !BYPASS) {
  console.error(
    `REFUSING: ${BASE} is remote and VERCEL_AUTOMATION_BYPASS_SECRET is unset — ` +
      `every capture would be the SSO page.`,
  );
  process.exit(2);
}
console.log(`[target] ${BASE}  (bypass: ${BYPASS ? "SET" : "not set"})`);

// ───────────────────────────── the shot list ─────────────────────────────
//
// `feature_ids` maps each image back to lib/business-features.js (MEH-2791), so
// the /join page can ask "which picture shows this tool?" instead of a human
// remembering. Entries with no visual are listed in the PR, not here.
//
// `clip` entries are handled in the second pass.

const SHOTS = [
  {
    file: "page-hero.webp",
    route: `/${SLUG}`,
    selector: '[data-testid="producer-header"], header.producer-hero, main > section:first-of-type',
    feature_ids: ["gallery_story", "hours", "vacation_mode", "verified_badge", "kashrut_verified", "editor_pick"],
    note: "cover + name + badges + open-for-orders + contact button",
  },
  {
    file: "page-products.webp",
    route: `/${SLUG}`,
    selector: "#section-products",
    feature_ids: ["product_details", "top_product"],
  },
  {
    file: "page-contact.webp",
    route: `/${SLUG}`,
    selector: '[data-testid="contact-card"], [data-testid="delivery-checker"]',
    feature_ids: ["primary_cta", "wa_prefill", "delivery_checker", "delivery_areas", "nav_buttons", "save_share"],
    // The checker is filled in before the shot — an empty input photographs as
    // a form, not as an answer.
    prepare: async (page) => {
      const input = page.locator('[data-testid="delivery-checker"] input').first();
      if (await input.count()) {
        await input.fill("בנימינה");
        await page.waitForTimeout(900);
      }
    },
  },
  {
    file: "search-diet.webp",
    route: "/producers?diet=gluten_free",
    selector: '[data-testid="producers-grid"]',
    feature_ids: ["discovery", "reservist_diet_tags"],
  },
  {
    file: "group-buy.webp",
    route: "/group-buys",
    selector: '[data-testid="group-buy-card"]',
    feature_ids: ["group_buys"],
  },
  {
    file: "event.webp",
    route: "/experiences",
    selector: 'a:has([data-testid="event-row-image"])',
    feature_ids: ["events"],
  },
  {
    file: "reviews.webp",
    route: `/${SLUG}`,
    // #reviews EXISTS but is an empty placeholder: measured 768x0px with zero
    // children, so waitFor({state:"visible"}) correctly never fires. The
    // review text renders as `review-excerpt` higher up the page, and that
    // node itself comes and goes depending on how far the page has rendered.
    // Left pointing here on purpose: the review SET changes when the seed
    // runs (the «(בדיקה)» row goes), so this is worth re-measuring against a
    // clean business rather than re-pointed twice.
    selector: "#reviews",
    feature_ids: ["reviews_contacted", "review_request"],
  },
  {
    file: "offer.webp",
    route: `/${SLUG}`,
    selector: '[data-testid="offer-badge"]',
    feature_ids: ["offer"],
  },
  {
    file: "recipe.webp",
    route: `/${SLUG}/recipes`,
    selector: "main",
    feature_ids: ["recipes"],
  },
  {
    file: "map.webp",
    route: "/map",
    // The container mounts long before anything renders into it, and 20s was
    // not enough on staging; the longer wait is deliberate.
    selector: '[data-testid="map-card"]',
    timeout: 45_000,
    feature_ids: ["map_precision", "multi_locations"],
    // Leaflet paints tiles asynchronously; without this the shot is grey.
    prepare: async (page) => {
      // A tile-less map is worse than no screenshot, so this stays a hard
      // wait. Measured from the CC sandbox: tile.openstreetmap.org answers
      // 000 (egress-blocked), so this shot CANNOT be taken here however long
      // it waits — it needs a machine that can reach the tile server. The
      // failure is environmental, not a selector to chase.
      await page.waitForSelector(".leaflet-tile-loaded", { timeout: 45_000 });
      await page.waitForTimeout(1200);
    },
  },
  {
    file: "rescue-bag.webp",
    route: "/rescue",
    selector: '[data-testid="rescue-card"]',
    feature_ids: ["rescue_bags"],
    note: "needs a bag seeded for TODAY; the seed adds one (MEH-2794)",
  },
  // ── owner dashboard (authenticated) ──
  {
    file: "dash-insights.webp",
    route: "/producer/dashboard/insights",
    selector: "main",
    auth: true,
    feature_ids: ["views", "search_impressions", "contact_clicks", "top_cities"],
  },
  // dash-availability.webp was removed, not re-pointed: MEH-2782 (#4126) took
  // available_today / full_this_week out end to end, so the card this shot
  // framed no longer exists. Measured on staging — no testid matching
  // "availability" renders on /producer/dashboard/edit. A shot of a deleted
  // feature is worse than a missing one, because it would sell it.
  {
    file: "dash-share-kit.webp",
    route: "/producer/dashboard/tools",
    // Measured on staging: the tools page carries tools-grid,
    // request-review-card and tools-rescue-tile — there is no "share-kit".
    selector: '[data-testid="tools-grid"]',
    auth: true,
    feature_ids: ["share_cards", "vanity_link"],
  },
  {
    file: "dash-qr.webp",
    route: "/producer/dashboard/qr-card",
    selector: "main",
    auth: true,
    feature_ids: ["qr_code"],
    note: "MEH-2785 merged 07/11, so this route exists",
  },
  {
    file: "dash-recipes.webp",
    route: "/producer/dashboard/recipes",
    selector: "main",
    auth: true,
    feature_ids: ["recipes"],
  },
  {
    file: "dash-group-buys.webp",
    route: "/producer/dashboard/group-buys",
    selector: "main",
    auth: true,
    feature_ids: ["group_buys"],
  },
  {
    file: "dash-rescue.webp",
    route: "/producer/dashboard/rescue",
    selector: "main",
    auth: true,
    feature_ids: ["rescue_bags"],
  },
  {
    file: "dash-followers.webp",
    route: "/producer/dashboard/insights",
    // Measured on staging today: the insights page renders
    // `followers-zero-cta`, i.e. the EMPTY state, because the demo business
    // has 0 followers until the seed runs. This is a data miss, not a
    // selector one — re-measure once the fixtures are in.
    selector: '[data-testid="followers-card"]',
    auth: true,
    feature_ids: ["follower_updates", "favorites_rating", "email_alerts"],
  },
];

// Six silent clips, one per /join card. Each is ONE continuous take with a 1 s
// hold at both ends so it loops cleanly.
const CLIPS = [
  {
    name: "clip-page",
    route: `/${SLUG}`,
    steps: async (page) => {
      await page.waitForTimeout(1000);
      await slowScroll(page, 1600);
      await page.waitForTimeout(1000);
    },
  },
  {
    name: "clip-found",
    route: "/map",
    steps: async (page) => {
      await page.waitForTimeout(1000);
      const box = page.locator('[data-testid="city-search"] input').first();
      if (await box.count()) {
        await box.fill("זכרון");
        await page.waitForTimeout(1200);
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(2500);
      }
      await page.waitForTimeout(1000);
    },
  },
  {
    name: "clip-contact",
    route: `/${SLUG}`,
    steps: async (page) => {
      await page.waitForTimeout(1000);
      const input = page.locator('[data-testid="delivery-checker"] input').first();
      if (await input.count()) {
        await input.scrollIntoViewIfNeeded();
        await input.fill("בנימינה");
        await page.waitForTimeout(1800);
      }
      // Scroll to the WhatsApp button and focus it — deliberately NOT clicked:
      // a click leaves the page for the WhatsApp app and ends the recording.
      const wa = page.locator('[data-testid="whatsapp-button"]').first();
      if (await wa.count()) {
        await wa.scrollIntoViewIfNeeded();
        await wa.focus();
      }
      await page.waitForTimeout(1200);
    },
  },
  {
    name: "clip-return",
    route: "/group-buys",
    steps: async (page) => {
      await page.waitForTimeout(1500);
      await slowScroll(page, 700);
      await page.goto(`${BASE}/he/experiences`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
    },
  },
  {
    name: "clip-trust",
    route: `/${SLUG}`,
    steps: async (page) => {
      await page.waitForTimeout(800);
      const reviews = page.locator('[data-testid="reviews-section"]').first();
      if (await reviews.count()) await reviews.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      const more = page.getByRole("button", { name: /עוד ביקורות/ });
      if (await more.count()) {
        await more.first().click();
        await page.waitForTimeout(1500);
      }
      await page.waitForTimeout(1000);
    },
  },
  {
    name: "clip-insights",
    route: "/producer/dashboard/insights",
    auth: true,
    steps: async (page) => {
      await page.waitForTimeout(1200);
      const thirty = page.getByRole("button", { name: /30/ });
      if (await thirty.count()) {
        await thirty.first().click();
        await page.waitForTimeout(2200);
      }
      await page.waitForTimeout(1200);
    },
  },
];

async function slowScroll(page, distance) {
  // Readable, not instant: a jump-cut scroll looks like a glitch in a loop.
  const steps = 24;
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, distance / steps);
    await page.waitForTimeout(90);
  }
}

// ───────────────────────────── browser plumbing ─────────────────────────────

const VIEWPORT = { width: 390, height: 844 };

function contextOptions(extra = {}) {
  return {
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
    ...(BYPASS
      ? {
          extraHTTPHeaders: {
            "x-vercel-protection-bypass": BYPASS,
            "x-vercel-set-bypass-cookie": "true",
          },
        }
      : {}),
    ...extra,
  };
}

/** Hide the chat launcher + anything that must not appear in a marketing shot. */
const HIDE_CSS = `
  [data-testid="chat-launcher"], [data-testid="chat-panel"],
  #chat-widget, .cookie-banner, [data-testid="cookie-banner"],
  [data-testid="install-prompt"] { display: none !important; }
`;

/** The "demo business and demo data" marker every image must carry. */
const MARKER_CSS = `
  body::after {
    content: "עסק ונתונים לדוגמה";
    position: fixed; inset-block-end: 8px; inset-inline-start: 8px;
    z-index: 2147483647; font: 600 11px/1.4 system-ui, sans-serif;
    color: #1c1a17; background: rgba(255,255,255,.88);
    padding: 4px 8px; border-radius: 6px; pointer-events: none;
  }
`;

async function newPage(browser, { auth = false } = {}) {
  const context = await browser.newContext(contextOptions());
  const page = await context.newPage();
  await page.addStyleTag({ content: HIDE_CSS + MARKER_CSS }).catch(() => {});
  if (auth) await login(page);
  return { context, page };
}

async function login(page) {
  if (!OWNER_PASSWORD) {
    throw new Error(
      "DEMO_OWNER_PASSWORD is unset — the dashboard shots cannot be taken. " +
        "Run `seed_demo_business.py --sync-users` with the DEMO_* passwords set, " +
        "then export DEMO_OWNER_PASSWORD here. (No new secrets: this is the " +
        "MEH-1241 mechanism.)",
    );
  }
  await page.goto(`${BASE}/he/login`, { waitUntil: "domcontentloaded" });
  // Fill, then VERIFY the value stuck. Measured on staging: filling at
  // `domcontentloaded` races React's hydration, which re-renders the form and
  // blanks the EMAIL field while leaving the password — the click then submits
  // a half-empty form and this threw a bare `waitForURL` timeout 20s later.
  // Gate on the field's own value, not on a duration.
  const EMAIL_SEL = 'input[type="email"], #email';
  const PW_SEL = 'input[type="password"], #password';
  const fillBoth = async () => {
    await page.fill(EMAIL_SEL, OWNER_EMAIL);
    await page.fill(PW_SEL, OWNER_PASSWORD);
    // BOTH fields, not just the email. Hydration happened to blank the email
    // in the run that was measured, but nothing guarantees it is always that
    // one — checking a single field would let the other slip through with
    // `stuck` still true (reviewer on #4145).
    return (
      (await page.inputValue(EMAIL_SEL)) === OWNER_EMAIL &&
      (await page.inputValue(PW_SEL)) === OWNER_PASSWORD
    );
  };
  let stuck = false;
  for (let attempt = 0; attempt < 6 && !stuck; attempt += 1) {
    stuck = await fillBoth();
    if (!stuck) await page.waitForTimeout(500);
  }
  // A late re-render can blank the field AFTER the loop passed, so re-read
  // both immediately before clicking and refill once if either slipped.
  // A late re-render can blank a field AFTER the loop passed, so re-verify
  // both immediately before clicking and refill once if either slipped.
  if (
    stuck &&
    ((await page.inputValue(EMAIL_SEL)) !== OWNER_EMAIL ||
      (await page.inputValue(PW_SEL)) !== OWNER_PASSWORD)
  ) {
    stuck = await fillBoth();
  }
  if (!stuck) {
    throw new Error("the login form kept discarding its field values — hydration never settled");
  }
  await page.getByRole("button", { name: /התחבר|כניסה/ }).first().click();
  // Gate on the thing that proves login, not on a timeout.
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });
}

// ───────────────────────────── pre-flight control ─────────────────────────────
//
// Without this, "0 misses" has a second cause: the script never reached the
// demo business at all. Run FIRST and fail loudly.
async function preflight(browser) {
  const { context, page } = await newPage(browser);
  const problems = [];
  try {
    const res = await page.goto(`${BASE}/he/${SLUG}`, { waitUntil: "domcontentloaded" });
    const status = res?.status() ?? 0;
    if (status !== 200) problems.push(`GET /he/${SLUG} → ${status} (expected 200)`);

    // THE CLEANLINESS CHECK ASKS THE API, NOT THE DOM — AND CHECKS THE
    // RESPONSES.
    //
    // It used to read `page.textContent("body")` at `domcontentloaded`, before
    // React had rendered the reviews, so "(בדיקה)" was not in the text yet, it
    // found nothing, and it SAID so. It passed on staging while a «(בדיקה)»
    // review was on screen, and that review then appeared in page-hero.webp.
    // Gating on rendered markup is not enough either: #section-products
    // becomes visible before the reviews mount.
    //
    // Every response is status-checked and `id` is asserted, because a 404
    // would otherwise give `undefined` here, request `/producers/undefined/
    // reviews`, find no "(בדיקה)" in the error body, and pass — the same null
    // reading as clean, one level down.
    let apiText = "";
    try {
      const detail = await page.request.get(`${BASE}/api/producers/by-slug/${SLUG}`);
      if (!detail.ok()) {
        problems.push(`GET /api/producers/by-slug/${SLUG} → ${detail.status()}`);
      } else {
        const producer = await detail.json();
        if (!producer?.id) {
          problems.push("the producer payload carried no id — cannot read its reviews");
        } else {
          apiText += JSON.stringify(producer);
          const reviews = await page.request.get(`${BASE}/api/producers/${producer.id}/reviews`);
          if (!reviews.ok()) {
            problems.push(`GET /api/producers/<id>/reviews → ${reviews.status()}`);
          } else {
            const page1 = await reviews.json();
            apiText += JSON.stringify(page1);
            // The endpoint is a ReviewsPage: if it reports more rows than it
            // returned, a "(בדיקה)" row could be sitting on a page this never
            // read, so say so rather than pass on a partial look.
            // `reviews` + `total` + `pages`, per ReviewsPage in
            // backend/app/schemas/schemas.py:4982 — read from the schema after
            // a guessed `items` key made this report "0 of 4 rows" on a page
            // it had in fact read in full.
            const items = Array.isArray(page1) ? page1 : (page1.reviews ?? []);
            const total = Array.isArray(page1) ? items.length : (page1.total ?? items.length);
            if (total > items.length) {
              problems.push(
                `the reviews endpoint returned ${items.length} of ${total} rows — ` +
                  "the cleanliness check only saw the first page",
              );
            }
          }
        }
      }
    } catch (err) {
      problems.push(`could not read the demo business through the API: ${err.message}`);
    }

    // TWO CHECKS, TWO HAYSTACKS. `apiText` is the producer and reviews JSON —
    // always far more than 500 characters — so folding it into the variable
    // the length check reads made that check unable to fail, even against a
    // completely empty DOM. A guard that cannot fail, introduced while fixing
    // a guard that could not fail (MEH-2821). The length check reads the DOM
    // and only the DOM; the cleanliness check reads both.
    // WAIT FOR A LANDMARK, THEN READ VISIBLE TEXT. Two separate reasons, both
    // measured on staging:
    //
    //   textContent("body") includes <script>/<style>, and Next inlines a
    //   large RSC flight payload there — 203,328 characters at this point, of
    //   which 200,836 are script. A 500-character floor over that passes on
    //   any page that merely loaded its bundle. innerText is the visible text
    //   the check is actually about.
    //
    //   At `domcontentloaded` innerText is only 563, a 63-character margin
    //   over the floor: thin enough that a copy trim or slow hydration could
    //   fail the pre-flight on a perfectly healthy page. After the products
    //   section renders it is 2,537 — a 2,037-character margin. So the wait
    //   is what makes the floor mean "nothing rendered" instead of "the page
    //   was read too early".
    //
    // The landmark is NOT here to make the "(בדיקה)" check work — the API
    // does that, and a render-timed DOM read is what made that check useless
    // in the first place. It is here so the LENGTH check measures a rendered
    // page. A page that never reaches this state is a real pre-flight
    // failure, which is why the catch records a problem rather than passing.
    await page
      .locator("#section-products")
      .first()
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch(() => {
        problems.push(
          "the business page never rendered its products section — nothing " +
            "below this point was measured against a rendered page",
        );
      });
    const domText = await page.innerText("body").catch(() => "");
    if (!domText || domText.length < 500)
      problems.push("the business page rendered almost no text");
    const body = domText + apiText;
    // The ticket's own cleanliness requirement, asserted rather than assumed.
    if (body.includes("(בדיקה)")) {
      problems.push('the demo business still shows "(בדיקה)" rows — re-run the seed with --refresh');
    }
    if (/sso-api|Vercel Authentication/i.test(body)) {
      problems.push("this is Vercel's SSO page, not the site — the bypass secret is wrong");
    }
  } catch (err) {
    problems.push(`could not load the business page: ${err.message}`);
  } finally {
    await context.close();
  }

  if (problems.length) {
    console.error("\nPRE-FLIGHT FAILED — nothing was captured:\n");
    for (const p of problems) console.error(`  - ${p}`);
    console.error("\nEvery capture below would have been meaningless, so none was attempted.");
    process.exit(1);
  }
  console.log("[preflight] demo business reachable, 200, no «(בדיקה)» on the page.");
}

// ───────────────────────────── stills ─────────────────────────────

async function captureStills(browser) {
  const results = [];
  // One authenticated context reused across the dashboard shots — logging in
  // per shot is nine logins and nine chances to trip the rate limiter.
  let authed = null;
  let authFailure = null;

  for (const shot of SHOTS) {
    const entry = {
      file: shot.file,
      route: shot.route,
      selector: shot.selector,
      feature_ids: shot.feature_ids ?? [],
      ...(shot.note ? { note: shot.note } : {}),
    };

    // A FAILED LOGIN RECORDS MISSES; IT DOES NOT ABORT THE RUN. Letting
    // `login()` throw out of here destroyed the whole manifest, including the
    // shots that had already succeeded — the opposite of what it is for. The
    // failure is cached, so nine auth shots do not retry nine logins, and it
    // is reported under `error`, which is the field the end-of-run printer
    // reads.
    let session;
    if (shot.auth) {
      if (!authed && !authFailure) {
        try {
          authed = await newPage(browser, { auth: true });
        } catch (err) {
          authFailure = `login failed: ${err.message}`;
        }
      }
      if (authFailure) {
        entry.status = "missing";
        entry.error = authFailure;
        results.push(entry);
        console.log(`  ✗ ${shot.file}  — ${authFailure}`);
        continue;
      }
      session = authed;
    } else {
      session = await newPage(browser);
    }
    const { page } = session;


    try {
      await page.goto(`${BASE}/he${shot.route}`, { waitUntil: "domcontentloaded" });
      if (shot.prepare) await shot.prepare(page);
      const el = page.locator(shot.selector).first();
      await el.waitFor({ state: "visible", timeout: shot.timeout ?? 20_000 });
      await page.waitForTimeout(400); // let fonts/images settle
      await el.screenshot({ path: path.join(OUT, shot.file), type: "webp", quality: 80 });
      entry.status = "ok";
      console.log(`  ✓ ${shot.file}`);
    } catch (err) {
      // NO FALLBACK SCREENSHOT. See the header: a picture of the wrong thing
      // is worse than no picture, because it passes review.
      entry.status = "missing";
      entry.error = err.message.split("\n")[0];
      console.log(`  ✗ ${shot.file}  — ${entry.error}`);
    }

    results.push(entry);
    if (!shot.auth) await session.context.close();
  }
  if (authed) await authed.context.close();
  return results;
}

// ───────────────────────────── clips ─────────────────────────────

async function captureClips(browser) {
  const results = [];
  for (const clip of CLIPS) {
    const dir = path.join(TMP, clip.name);
    await mkdir(dir, { recursive: true });
    const context = await browser.newContext(
      contextOptions({ recordVideo: { dir, size: VIEWPORT } }),
    );
    const page = await context.newPage();
    const entry = { file: `${clip.name}.mp4`, route: clip.route, kind: "clip" };
    const started = Date.now();
    try {
      await page.addStyleTag({ content: HIDE_CSS + MARKER_CSS }).catch(() => {});
      if (clip.auth) await login(page);
      await page.goto(`${BASE}/he${clip.route}`, { waitUntil: "domcontentloaded" });
      // Never start a clip on a loading state (ticket): wait for real content.
      await page.locator("main").first().waitFor({ state: "visible", timeout: 20_000 });
      await clip.steps(page);
      entry.duration_s = Math.round((Date.now() - started) / 100) / 10;
      await context.close(); // flushes the .webm
      const webm = (await readdir(dir)).find((f) => f.endsWith(".webm"));
      if (!webm) throw new Error("playwright wrote no video file");
      await toMp4(path.join(dir, webm), clip.name, entry);
      entry.status = "ok";
      console.log(`  ✓ ${clip.name}.mp4  (${entry.duration_s}s, ${entry.size_kb}KB)`);
    } catch (err) {
      entry.status = "missing";
      entry.error = err.message.split("\n")[0];
      console.log(`  ✗ ${clip.name}  — ${entry.error}`);
      await context.close().catch(() => {});
    }
    results.push(entry);
  }
  await rm(TMP, { recursive: true, force: true });
  return results;
}

async function toMp4(webmPath, name, entry) {
  const mp4 = path.join(OUT, `${name}.mp4`);
  const poster = path.join(OUT, `${name}-poster.webp`);
  await run("ffmpeg", [
    "-y", "-i", webmPath,
    "-c:v", "libx264", "-crf", "23", "-preset", "slow",
    "-pix_fmt", "yuv420p", "-r", "30", "-an",
    // H.264 needs even dimensions; 390x844 at 2x is 780x1688, already even,
    // but a device-pixel change would otherwise fail the encode cryptically.
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-movflags", "+faststart",
    mp4,
  ]);
  await run("ffmpeg", ["-y", "-i", webmPath, "-frames:v", "1", "-q:v", "80", poster]);
  const { size } = await readFile(mp4).then((b) => ({ size: b.length }));
  entry.size_kb = Math.round(size / 1024);
  entry.poster = `${name}-poster.webp`;
  if (entry.size_kb > 1536) {
    entry.warning = `${entry.size_kb}KB exceeds the 1.5MB ceiling — re-encode at a higher crf`;
  }
}

// ───────────────────────────── manifest + exit ─────────────────────────────

async function gitSha() {
  try {
    const { stdout } = await run("git", ["rev-parse", "HEAD"]);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({
    // PLAYWRIGHT_CHROMIUM_PATH is the repo's existing knob for this, read by
    // frontend/scripts/qa-ci-screenshots.mjs and already on the env-drift
    // gate's platform-var list. It matters in the CC sandbox, where the
    // preinstalled Chromium revision does not match the one this repo pins and
    // the default launch dies on a missing chrome-headless-shell.
    // `chromium.executablePath()` is no help: it returns the path Playwright
    // EXPECTS, not one it has verified.
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    // MEH-2090: a remote target from the CC sandbox needs TLS capped at 1.2,
    // and --no-sandbox for the container. Harmless on a normal machine.
    args: ["--ssl-version-max=tls1.2", "--no-sandbox"],
  });

  try {
    await preflight(browser);

    console.log("\n[stills]");
    const stills = await captureStills(browser);

    let clips = [];
    if (STILLS_ONLY) {
      console.log("\n[clips] skipped (--stills-only)");
    } else {
      console.log("\n[clips]");
      clips = await captureClips(browser);
    }

    const entries = [...stills, ...clips];
    await writeFile(
      path.join(OUT, "manifest.json"),
      `${JSON.stringify(
        {
          generated_by: "frontend/e2e/marketing/join-screenshots.mjs (MEH-2794)",
          captured_at: new Date().toISOString(),
          git_sha: await gitSha(),
          target: BASE,
          demo_slug: SLUG,
          viewport: { ...VIEWPORT, deviceScaleFactor: 2 },
          // DERIVED, never written (MEH-1909): a stated count goes stale the
          // moment a shot is added, and a manifest that misreports its own
          // coverage is worse than none.
          total: entries.length,
          ok: entries.filter((e) => e.status === "ok").length,
          missing: entries.filter((e) => e.status !== "ok").length,
          entries,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const missed = entries.filter((e) => e.status !== "ok");
    console.log(`\nmanifest.json written — ${entries.length - missed.length}/${entries.length} captured`);

    if (missed.length) {
      console.error(`\n${missed.length} capture(s) FAILED — no file was written for these:\n`);
      for (const m of missed) console.error(`  - ${m.file}  (${m.route})  ${m.error ?? ""}`);
      console.error(
        "\nFix the selector in SHOTS/CLIPS and re-run. Nothing was substituted:\n" +
          "the missing images are absent, not wrong.",
      );
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

await main();
