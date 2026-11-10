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
// `sharp` IS NOT DECLARED IN package.json — it resolves transitively.
// Measured 2026-11-08: `node_modules/sharp` is 0.35.3, pulled in by Next.js
// (package-lock.json), and `frontend/scripts/compress-qa-screenshots.mjs`
// already imports it the same way. A lockfile or Next change that drops it
// breaks this script at import time, before the pre-flight can report
// anything. The proper fix is an explicit devDependency, which needs Sapir's
// sign-off per regression rule 8 — until then this line is the warning.
import sharp from "sharp";
import { execFile } from "node:child_process";
import { mkdir, writeFile, readFile, rm, readdir, rename } from "node:fs/promises";
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

// THE CLEANLINESS NEEDLE, AND THE SCOPE IT IS ASKED OVER.
//
// Staging carries test businesses whose NAME ends in "(בדיקה)" — e.g. «משק
// הכרמל הירוק (בדיקה)». They are not the demo business and the seed does not
// own them: `grep -rn "הכרמל" backend/scripts/` is empty, and the string is
// absent from both `/api/producers/by-slug/<slug>` and that producer's
// `/reviews`. They appear on the demo page only as neighbour cards in the
// "מצילים מזון" strip.
//
// So "is «(בדיקה)» anywhere in document.body" is the WRONG question, and it
// was asked for one run: measured 2026-11-08 on staging, the card sits at
// y=6670..7088 of an 8073px page, while clip-page films 0..2444 and
// clip-contact ~3912..4756 — in no frame of any shot. The pre-flight failed
// the whole run over it and told the operator to "re-run the seed with
// --refresh", which could never have removed it.
//
// Two questions, two scopes, both asserted below:
//   1. the DEMO BUSINESS's own data — the producer payload and its reviews.
//      That is what the seed owns, so that is the only failure --refresh can
//      fix, and the only one whose message says so.
//   2. what lands INSIDE A FRAME — read from the element each still clips and
//      from the viewport each clip records, because the frame is the
//      deliverable. Stricter than the old check, not looser: it covers every
//      route, the dashboards and the clips, where a one-route body read never
//      looked.
const TEST_ROW = "(בדיקה)";

// A WRITTEN FILE IS NOT A CAPTURED SHOT — ASSERT THE PIXELS.
//
// On 2026-11-08 this script reported «✓ page-hero.webp» five times and wrote
// five files holding a single colour. Measured: every pixel of page-hero,
// page-products, page-contact, reviews and offer was the same grey, while the
// DOM behind them was complete — right text, opacity 1, fonts loaded. The run
// said 19/24 captured; five of those nineteen showed nothing. That is exactly
// what this file's header calls worse than a missing picture, because it
// passes review.
//
// The floor is derived from that run, not guessed — see assertNotFlat below
// for the measured spread on both sides of it. The thinnest real shot
// (dash-qr, a QR code on white) is what sets how low this can go, so it is
// named there rather than left for the next person to rediscover by tripping
// it.
const FLAT_FRAME_STDEV = 2;

// A NOT-FLAT FRAME IS NOT A RENDERED FRAME.
//
// FLAT_FRAME_STDEV catches a frame of one colour. It does not catch a frame
// whose only content is chrome: measured 2026-11-08, dash-qr (empty page
// under the tab bar), dash-insights («טעינת סטטיסטיקות…») and dash-recipes
// (four grey skeleton rows) all cleared the floor at 8.38, 13.10 and 21.80
// and were written and counted as captured. The tab bar and the skeleton
// shapes supply the variance; the subject supplies none.
//
// Both shots gate on `main`, which is visible the instant the route mounts
// while its data is still in flight, so `waitFor({state:"visible"})` is
// satisfied by an empty page. This asks the frame directly whether it is
// still loading.
const LOADING_TEXT = /בטעינה|טעינת|טוען/;
const SKELETON_SELECTOR = '[class*="skeleton"], [class*="animate-pulse"]';

// Throws when the framed element is still a loading state. Runs BEFORE the
// write, for the same reason as assertNotFlat: a loading screen on disk is a
// picture that passes review.
async function assertNotLoading(locator, label) {
  const { skeletons, text } = await locator.evaluate(
    (el, sel) => ({
      skeletons: el.querySelectorAll(sel).length,
      text: (el.innerText || "").trim(),
    }),
    SKELETON_SELECTOR,
  );
  if (skeletons > 0) {
    throw new Error(
      `the frame is still a skeleton — ${skeletons} placeholder element(s) ` +
        `inside it. ${label}`,
    );
  }
  const hit = text.split("\n").map((l) => l.trim()).find((l) => LOADING_TEXT.test(l));
  if (hit) {
    throw new Error(`the frame is still loading — «${hit.slice(0, 50)}». ${label}`);
  }
}

// IT MEASURES THE FRAME ABOVE MARKER_CSS, NOT THE WHOLE FRAME.
//
// MARKER_CSS stamps «עסק ונתונים לדוגמה» into the bottom of every clip frame.
// That label is this script's own ink, and it is enough to clear a floor on
// its own: the four blank posters of 2026-11-08 — white frames carrying
// nothing but the label — measured 5.81 over the whole frame, against 7.71
// for the thinnest real shot. A guard separating 5.81 from 7.71 is a coin
// toss. Measured over the top 85% instead, the same files read 0.00 and the
// thinnest real one 8.38 — the label is excluded, so the number describes the
// page rather than the overlay.
//
//   blank above the marker   clip-page / clip-contact / clip-trust /
//                            clip-found posters: 0.00
//   real                     dash-qr 8.38 · dash-insights 13.10 ·
//                            dash-group-buys 23.28 · dash-share-kit 27.98 ·
//                            rescue-bag 41.07 · recipe 58.15 ·
//                            dash-rescue 65.31 · clip-insights 95.99 ·
//                            group-buy 115.16
//
// `.extract()` must be materialised with `.toBuffer()` before `.stats()`:
// chained onto the same pipeline, `stats()` reads the ORIGINAL image and the
// crop is silently ignored. It returns a plausible number either way — the
// first version of this check measured all 15 files and printed the uncropped
// value for every one of them.
//
// Throws rather than returning a boolean: a caller that forgot to check one
// would write the blank file and report success, which is the defect this
// exists to prevent. It does not catch — if sharp cannot read the file, that
// is a failed capture, not a clean one.
async function assertNotFlat(file, label) {
  const meta = await sharp(file).metadata();
  const height = Math.max(1, Math.floor(meta.height * 0.85));
  const cropped = await sharp(file)
    .extract({ left: 0, top: 0, width: meta.width, height })
    .toBuffer();
  const stats = await sharp(cropped).stats();
  const stdev = Math.max(...stats.channels.map((c) => c.stdev));
  if (stdev < FLAT_FRAME_STDEV) {
    throw new Error(
      `the frame is flat — one colour above the demo marker (max channel ` +
        `stdev ${stdev.toFixed(2)}, floor ${FLAT_FRAME_STDEV}). ${label}`,
    );
  }
}

// Visible text intersecting the viewport right now. `innerText` of the body
// would answer for the whole page, including the strip 4,000px below the last
// frame, which is the false positive TEST_ROW documents.
//
// IT WALKS TEXT NODES AND MEASURES THEM WITH A RANGE, not elements.
// The first version walked elements and skipped any with `children.length`,
// on the theory that leaves carry the text. Measured on staging: the business
// name lives in an `<h3>` that holds BOTH a text node and an element child,
// so it was skipped as a non-leaf and its text was never collected. The
// sampler returned 438 characters with the needle's own rect at top=281 of an
// 844px viewport — on screen, and reported clean. A Range around each text
// node has no such blind spot.
//
// It THROWS rather than returning "" on failure. A sampler whose silence
// reads the same as a clean frame cannot fail, and this one proved it: the
// red run it was built for passed green.
async function viewportText(page) {
  const { text, nodes } = await page.evaluate(() => {
    const out = [];
    let nodes = 0;
    const h = window.innerHeight;
    const w = window.innerWidth;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue?.trim();
      if (!t) continue;
      nodes += 1;
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= h || r.right <= 0 || r.left >= w) continue;
      out.push(t);
    }
    return { text: out.join(" "), nodes };
  });
  // CONTROL. `nodes` counts every non-blank text node in the document, so a
  // page that rendered anything at all puts it in the hundreds. Zero means
  // the walk died, not that the frame is clean, and the caller must not read
  // it as clean.
  if (nodes === 0) {
    throw new Error("the viewport sampler found no text nodes at all — it did not run");
  }
  return text;
}

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
    // The DEMO business's card, named by its producer — not `.first()` of
    // whatever group buy staging lists on top, and not the product word
    // («כוסמין»), which another seeded bakery also uses (seed_data.py:133).
    selector: '[data-testid="group-buy-card"]:has-text("מאפיית רוח השדה")',
    feature_ids: ["group_buys"],
    // Measured 10/11 on staging: the demo group buy is `funded` (the seed's
    // commits meet min_participants=2 on purpose, seed_demo_business.py:329),
    // and `/group-buys` opens on the «פתוחות להצטרפות» tab, which lists status=open
    // only (group_buys.py:120). So the card is one chip away. Click
    // «הגיעו ליעד» (group_buys.list.status_funded) only when it is not on the
    // open tab, so a later re-seed that leaves it open still shoots it there.
    prepare: async (page) => {
      const demo = page.locator('[data-testid="group-buy-card"]:has-text("מאפיית רוח השדה")');
      const onOpenTab = await demo
        .first()
        .waitFor({ state: "visible", timeout: 8_000 })
        .then(() => true, () => false);
      if (!onOpenTab) {
        await page.getByRole("button", { name: "הגיעו ליעד", exact: true }).click();
      }
    },
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
    // RE-MEASURED 2026-11-08, against the seeded business, as the earlier note
    // said to do: `#reviews` is still an empty placeholder — 358x0px, zero
    // children at 390 width — so `waitFor({state:"visible"})` can never fire
    // on it. The rendered review is `review-excerpt`: 358x92, 3 children,
    // «עוגיות השקדים ללא הגלוטן מצוינות…». That is the node a reader sees, so
    // that is the node the shot frames.
    selector: '[data-testid="review-excerpt"]',
    feature_ids: ["reviews_contacted", "review_request"],
  },
  {
    file: "offer.webp",
    route: `/${SLUG}`,
    // `offer-badge` does not exist on the page — measured ABSENT 2026-11-08.
    // The offer renders as `offer-line`: «הטבה בהזמנה ראשונה», 358x20.
    // 20px tall is a sliver, not a marketing still; flagged for a framing
    // decision rather than silently widened to a parent nobody chose.
    selector: '[data-testid="offer-line"]',
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
    // `rescue-card` timed out at 20s on staging — it does not exist. The
    // listing renders `rescue-list` > `rescue-list-rows` > `rescue-bag-row`
    // (enumerated from the live DOM 2026-11-08); the row is the card a reader
    // sees, and it carries pickup, name, where, stock, worth and price.
    //
    // THIS SHOT HAS A DEADLINE. The seeded bag's pickup window is now+1h to
    // now+3h in Israel time (MEH-2808), and /rescue hides a bag once its
    // window has passed — correctly. Measured 2026-11-08: captured fine at
    // 15:00 Israel, and at 18:31 the same selector timed out because the
    // 14:25–16:25 bag was gone. A timeout here usually means the seed is
    // older than three hours, not that the selector is wrong. Re-run the seed
    // and capture again.
    selector: '[data-testid="rescue-bag-row"]',
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
    // MEH-2880/2882 (10/11) moved the share kit (story card + review card)
    // off the dashboard home into «כלים» → «שיתוף»: it is its own node now,
    // `share-kit-section` inside `tools-share-section`. Before that the tools
    // page had no share-kit node and this framed `tools-grid` — a picture of
    // the tool tiles, not of the kit the filename promises.
    selector: '[data-testid="share-kit-section"]',
    auth: true,
    feature_ids: ["share_cards", "vanity_link"],
  },
  {
    file: "dash-qr.webp",
    route: "/producer/dashboard/qr-card",
    // NOT `main`. With `main` this framed the dashboard shell — tab bar on
    // top, empty page under it — and shipped as ✓ on 2026-11-08: no skeleton
    // and no loading text, so assertNotLoading could not see it either. The
    // QR code's own node cannot be satisfied by an empty page.
    selector: '[data-testid="business-qr-print-code"]',
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
    // There is no `followers-card` testid and there never was — this was a
    // guess, and it would have missed even with followers seeded. Since
    // MEH-2884 (10/11) the followers card carries the count AND a «שתפו»
    // button (`followers-share`) whose parent IS the card (asserted in
    // DashboardInsightsFollowersShare.test.jsx). With 0 followers the button
    // sits inside `followers-zero-cta` instead, so its parent is that <p> —
    // still a miss for this shot, correctly: the empty state is not what
    // /join should show (the seed gap is MEH-2839).
    selector: '[data-testid="followers-share"]:not([data-testid="followers-zero-cta"] *) >> xpath=..',
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
      // `whatsapp-button` is absent — measured 2026-11-08. The WhatsApp CTA is
      // `primary-contact-button`: 308x52, «שליחת הודעה בוואטסאפ».
      const wa = page.locator('[data-testid="primary-contact-button"]').first();
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
      // `reviews-section` is absent — measured 2026-11-08, same finding as
      // reviews.webp above. `review-excerpt` is the rendered review.
      const reviews = page.locator('[data-testid="review-excerpt"]').first();
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

// INJECTED PER DOCUMENT, NOT ONCE ON `about:blank`.
//
// Both call sites used to run `addStyleTag` on the fresh page, before any
// `goto`, and swallow the result with `.catch(() => {})`. A style tag added
// to one document does not survive navigation to the next, so the rules were
// gone by the time anything was captured — measured on the 2026-11-08 clips,
// where the cookie banner («אנו משתמשים בעוגיות…», «רק הכרחיים», «קבלו הכל»)
// sits across the bottom of the producer-page poster that HIDE_CSS is
// supposed to remove. The swallowed rejection is why it never said so.
//
// `addInitScript` runs on every document in the page, including the ones
// `clip-return` navigates to mid-recording, and it is not silenced.
async function installOverlayStyles(page) {
  await page.addInitScript((css) => {
    const add = () => {
      const el = document.createElement("style");
      el.textContent = css;
      document.head?.appendChild(el);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", add, { once: true });
    } else {
      add();
    }
  }, HIDE_CSS + MARKER_CSS);
}

// A TALL ELEMENT SHOT IS STITCHED, AND FIXED/STICKY CHROME LANDS MID-IMAGE.
//
// Measured 10/11 on dash-share-kit.webp (716×3018): Playwright captures an
// element taller than the viewport by scrolling, so the sticky site header and
// the sticky dashboard tab bar were painted across the story card, and the
// MARKER_CSS label — `position: fixed` to the VIEWPORT's bottom corner — sat
// clipped in the middle of the picture instead of in a corner of it. Every
// still taller than 844px carried the same defect (dash-insights,
// search-diet, dash-rescue).
//
// For the duration of ONE element screenshot: sticky → static (same flow
// space, so nothing below moves), fixed elements outside the subject hidden
// (visibility, so nothing reflows), the body::after marker suppressed and the
// same label placed in the SUBJECT's own bottom-start corner. Everything is
// put back afterwards, because the authenticated page is reused across shots.
// Clips keep the viewport marker: there the viewport IS the frame.
async function pinChromeForElementShot(el) {
  await el.evaluate((node, label) => {
    const touched = [];
    for (const n of document.querySelectorAll("body *")) {
      if (n === node || node.contains(n) || n.contains(node)) continue;
      const pos = getComputedStyle(n).position;
      if (pos === "sticky") {
        touched.push([n, "position", n.style.getPropertyValue("position"), n.style.getPropertyPriority("position")]);
        n.style.setProperty("position", "static", "important");
      } else if (pos === "fixed") {
        touched.push([n, "visibility", n.style.getPropertyValue("visibility"), n.style.getPropertyPriority("visibility")]);
        n.style.setProperty("visibility", "hidden", "important");
      }
    }
    const off = document.createElement("style");
    off.textContent = "body::after { display: none !important; }";
    document.head.appendChild(off);
    let relativised = false;
    if (getComputedStyle(node).position === "static") {
      node.style.setProperty("position", "relative");
      relativised = true;
    }
    // ITS OWN STRIP, NOT AN OVERLAY. Measured on the first run of this
    // helper: absolutely placed over the subject, the tag covered «שתפו» on
    // dash-followers, the registration pill on event, the QR modules on
    // dash-qr, and on offer (a ~21px strip) the whole line. The subject grows
    // by a strip at its bottom for the shot, and the tag sits in that strip.
    const padBefore = [
      node.style.getPropertyValue("padding-block-end"),
      node.style.getPropertyPriority("padding-block-end"),
    ];
    const padNow = parseFloat(getComputedStyle(node).paddingBlockEnd) || 0;
    node.style.setProperty("padding-block-end", `${padNow + 30}px`, "important");
    const tag = document.createElement("div");
    tag.textContent = label;
    tag.setAttribute(
      "style",
      "position:absolute;inset-block-end:4px;inset-inline-start:8px;z-index:2147483647;" +
        "font:600 11px/1.4 system-ui,sans-serif;color:#1c1a17;background:rgba(255,255,255,.88);" +
        "padding:4px 8px;border-radius:6px;pointer-events:none;",
    );
    node.appendChild(tag);
    window.__joinShotRestore = () => {
      for (const [n, prop, value, prio] of touched) {
        if (value) n.style.setProperty(prop, value, prio);
        else n.style.removeProperty(prop);
      }
      off.remove();
      tag.remove();
      if (relativised) node.style.removeProperty("position");
      if (padBefore[0]) node.style.setProperty("padding-block-end", padBefore[0], padBefore[1]);
      else node.style.removeProperty("padding-block-end");
    };
  }, "עסק ונתונים לדוגמה");
  // Restore through the PAGE: the closure lives on `window`, and re-resolving
  // the locator would wait out its timeout if the subject re-rendered.
  return () =>
    el
      .page()
      .evaluate(() => {
        window.__joinShotRestore?.();
        delete window.__joinShotRestore;
      })
      .catch(() => {});
}

async function newPage(browser, { auth = false } = {}) {
  const context = await browser.newContext(contextOptions());
  const page = await context.newPage();
  await installOverlayStyles(page);
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
  // Non-fatal observations. Printed on success too — a note nobody sees is
  // not a report.
  const notes = [];
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
    // THE TICKET'S CLEANLINESS REQUIREMENT, OVER THE SCOPE THE SEED OWNS.
    // `apiText` is the demo producer's own payload plus its reviews — see
    // TEST_ROW. A hit here IS a seed problem, so this message is the only one
    // that prescribes --refresh.
    if (apiText.includes(TEST_ROW)) {
      problems.push(
        `the demo business's own data still carries "${TEST_ROW}" — re-run the seed with --refresh`,
      );
    }
    // A hit elsewhere on the page is another business's name. It is reported,
    // never fatal here: whether it matters is decided per frame at capture
    // time, which is the only place that can tell.
    if (!apiText.includes(TEST_ROW) && domText.includes(TEST_ROW)) {
      const where = await page
        .evaluate((needle) => {
          const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = w.nextNode())) {
            if (n.nodeValue?.includes(needle)) {
              const card = n.parentElement?.closest("article") ?? n.parentElement;
              const r = card.getBoundingClientRect();
              return {
                text: n.nodeValue.trim().slice(0, 60),
                top: Math.round(r.top + window.scrollY),
                page: document.documentElement.scrollHeight,
              };
            }
          }
          return null;
        }, TEST_ROW)
        .catch(() => null);
      notes.push(
        where
          ? `another business on this page is named «${where.text}» (y=${where.top} of ` +
              `${where.page}px). Not the demo business and not the seed's to remove. ` +
              "Any shot that frames it fails that shot by name."
          : `"${TEST_ROW}" appears somewhere on the page, outside the demo business's own data`,
      );
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
  for (const n of notes) console.log(`[preflight] note: ${n}`);
  console.log(
    `[preflight] demo business reachable, 200, no "${TEST_ROW}" in its own data.`,
  );
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
      // IN-FRAME CLEANLINESS — the subject is the element being clipped, so
      // this asks exactly what the file will show. Checked BEFORE the write,
      // because a contaminated .webp on disk is a picture that passes review.
      // WAIT FOR IT TO FINISH LOADING, THEN INSIST. A dashboard route mounts
      // `main` immediately and fills it a second or two later, so the first
      // look is the wrong moment to judge. Poll until the frame stops being a
      // loading state; only then is a still-loading frame a real miss.
      const loadedBy = Date.now() + (shot.timeout ?? 20_000);
      for (;;) {
        try {
          await assertNotLoading(
            el,
            `${shot.file} gates on \`${shot.selector}\`, which can be visible ` +
              "while its data is still in flight.",
          );
          break;
        } catch (err) {
          if (Date.now() > loadedBy) throw err;
          await page.waitForTimeout(500);
        }
      }
      const framed = await el.innerText().catch(() => "");
      if (framed.includes(TEST_ROW)) {
        const line =
          framed
            .split("\n")
            .map((l) => l.trim())
            .find((l) => l.includes(TEST_ROW)) ?? TEST_ROW;
        throw new Error(`"${TEST_ROW}" is inside the frame: «${line.slice(0, 60)}»`);
      }
      const outFile = path.join(OUT, shot.file);
      const unpin = await pinChromeForElementShot(el);
      try {
        await el.screenshot({ path: outFile, type: "webp", quality: 80 });
      } finally {
        await unpin();
      }
      try {
        await assertNotFlat(
          outFile,
          // THE CAUSE IS NOT ESTABLISHED, AND THE WIDTH THEORY WAS WRONG.
          // On 2026-11-08 the five producer-page stills came back flat for
          // run after run at 390px while 768 and 1440 rendered, through
          // `animations: "disabled"`, `scale: "css"`, reload, resize and
          // `--headless=new`. The obvious read was "it does not raster at
          // mobile width". Later the same day, at the same 390px and on a
          // page that had grown from 8,073 to 8,123px, the same five
          // captured normally with nothing changed in this file. So it is
          // neither width nor height, it is intermittent, and it is silent —
          // which is the whole reason this assertion runs on every write
          // rather than once at the start.
          `the DOM can be complete and the raster still empty — ${shot.route} ` +
            `at ${VIEWPORT.width}px. Cause unestablished; see the note here.`,
        );
      } catch (err) {
        // The blank file does not survive the failure. Left on disk it would
        // be committed by the next person who runs `git add`.
        await rm(outFile, { force: true });
        throw err;
      }
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
      await installOverlayStyles(page);
      if (clip.auth) await login(page);
      await page.goto(`${BASE}/he${clip.route}`, { waitUntil: "domcontentloaded" });
      // Never start a clip on a loading state (ticket): wait for real content.
      await page.locator("main").first().waitFor({ state: "visible", timeout: 20_000 });
      // A clip's deliverable is the scrolling viewport, not the document, so
      // the cleanliness question is asked over what is on screen — sampled at
      // the opening frame and again at the closing one. A body-wide read here
      // would re-create the very false positive TEST_ROW documents.
      // SAMPLED THROUGHOUT, NOT JUST AT THE TWO ENDS.
      // Opening and closing samples alone miss the case that matters most for
      // a scrolling clip: a card that passes through the viewport mid-scroll
      // and is gone by the last frame is in the recorded mp4 and in no
      // sample. The poll runs alongside `steps()` and is stopped in
      // `finally`, so a throwing step cannot leave it running.
      const seen = [await viewportText(page)];
      let polling = true;
      const poll = (async () => {
        while (polling) {
          await page.waitForTimeout(400);
          if (!polling) break;
          seen.push(await viewportText(page).catch(() => ""));
        }
      })();
      try {
        await clip.steps(page);
      } finally {
        polling = false;
        await poll;
      }
      seen.push(await viewportText(page));
      const dirty = seen.find((t) => t.includes(TEST_ROW));
      if (dirty) {
        throw new Error(
          `"${TEST_ROW}" is on screen in this clip — ` +
            `«${dirty.slice(Math.max(0, dirty.indexOf(TEST_ROW) - 40), dirty.indexOf(TEST_ROW) + 20)}»`,
        );
      }
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
      // Nothing is removed from OUT here: a failed clip never wrote there.
      // See toMp4 — the encode lands in TMP and is promoted only once the
      // poster has passed, so a miss leaves whatever was committed intact.
    }
    results.push(entry);
  }
  await rm(TMP, { recursive: true, force: true });
  return results;
}

async function toMp4(webmPath, name, entry) {
  // WRITTEN INTO TMP, PROMOTED INTO OUT ONLY ONCE THE POSTER PASSES.
  // Encoding straight into OUT means a clip that fails its poster check has
  // already replaced the committed file with the output that just failed. The
  // first version of this guard deleted the OUT files on failure instead,
  // which removed clip-return.mp4 and clip-trust.mp4 — committed files this
  // run had never written. A capture that fails must leave what it found.
  const mp4 = path.join(TMP, `${name}.mp4`);
  const poster = path.join(TMP, `${name}-poster.webp`);
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
  // THE POSTER IS THE CLIP'S LAST FRAME, NOT ITS FIRST.
  //
  // Frame 1 is whatever the compositor had produced when recording began,
  // which is often nothing: on 2026-11-08 four posters came out
  // byte-identical at 1,212 bytes, and clip-insights produced a painted
  // poster on one run and a blank one on the next from the same code.
  // Re-seeking to 1.5s only moved the problem — the producer-page poster then
  // showed the loading screen, header and spinner on an empty page, which
  // clears a not-flat floor and is still not a picture of anything.
  //
  // The last frame is the one place the clip is guaranteed to be showing its
  // subject: every `steps()` ends on the state it exists to demonstrate.
  // `-sseof -0.5` seeks relative to the end, so it needs no duration lookup.
  await run("ffmpeg", ["-y", "-sseof", "-0.5", "-i", webmPath, "-frames:v", "1", "-q:v", "80", poster]);
  await assertNotFlat(poster, `poster for ${name}, last frame of the recording`);
  await rename(mp4, path.join(OUT, `${name}.mp4`));
  await rename(poster, path.join(OUT, `${name}-poster.webp`));
  const { size } = await readFile(path.join(OUT, `${name}.mp4`)).then((b) => ({ size: b.length }));
  entry.size_kb = Math.round(size / 1024);
  entry.poster = `${name}-poster.webp`;
  if (entry.size_kb > 1536) {
    entry.warning = `${entry.size_kb}KB exceeds the 1.5MB ceiling — re-encode at a higher crf`;
  }
}

// ───────────────────────────── manifest + exit ─────────────────────────────

// `-dirty` when the tree has uncommitted changes: a manifest that names the
// commit BEFORE the script edit that produced its images is false provenance
// (untracked files do not count: this run is writing its own into OUT)
// (measured on the 10/11 run, which recorded the pre-change base).
async function gitSha() {
  try {
    const { stdout } = await run("git", ["rev-parse", "HEAD"]);
    const { stdout: dirty } = await run("git", ["status", "--porcelain", "--untracked-files=no"]);
    return stdout.trim() + (dirty.trim() ? "-dirty" : "");
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
      // A stills-only run does not touch the clips, so it must not drop them
      // from the manifest either: carry the previous run's clip entries
      // (with their own captured_at) instead of silently shrinking `total`.
      try {
        const prev = JSON.parse(await readFile(path.join(OUT, "manifest.json"), "utf8"));
        clips = (prev.entries ?? [])
          .filter((e) => e.kind === "clip")
          .map((e) => ({ ...e, carried_from: prev.captured_at ?? null }));
        console.log(`  (${clips.length} clip entries carried from the previous manifest)`);
      } catch {
        console.log("  (no previous manifest — no clip entries to carry)");
      }
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
