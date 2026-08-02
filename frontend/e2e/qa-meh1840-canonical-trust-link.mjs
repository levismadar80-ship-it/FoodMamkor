/**
 * MEH-1840 — self-QA for the canonical trust link.
 *
 * The verified-seal popover is duplicated across TWO components that both
 * render on the producer page (BadgeRow.jsx hero branch, ImageGallery.jsx
 * imageless-masthead branch). MEH-1840 retargets both from /about#verification
 * to /about/process, so this harness drives a real Chromium against a local
 * `next start` and asserts on the LIVE DOM that:
 *
 *   1. the masthead seal (imageless producer) opens a popover whose link
 *      points at /about/process — and NOT at the old anchor;
 *   2. the BadgeRow hero seal (producer WITH images) does the same, so the two
 *      surfaces cannot have diverged;
 *   3. clicking the link actually LANDS on /about/process (not just an href —
 *      an href assertion alone cannot tell a working route from a 404);
 *   4. /about still defines the #verification anchor (deep-links stay valid)
 *      and now carries the in-section teaser link to /about/process.
 *
 * Route regexes are anchored the same way as qa-meh1611-producer-locations.mjs
 * — a `**​/producers?*` glob would also swallow the collection endpoint.
 *
 * Run: node e2e/qa-meh1840-canonical-trust-link.mjs   (needs `next start` on :3000)
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "../qa-artifacts/MEH-1840");
const BASE = process.argv[3] || "http://127.0.0.1:3000";
// CC-sandbox only: the container ships Chromium at this fixed path, which may
// not match the revision this repo's @playwright/test pins. Absent elsewhere —
// the launch below falls back to Playwright's own resolution when it does not.
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const CANONICAL = "/about/process";
const OLD_TARGET = "/about#verification";

// UUID-shaped: the detail route matches a uuid segment.
const IMAGELESS_ID = "1a1a1a1a-1111-4111-8111-111111111111";
const IMAGED_ID = "2b2b2b2b-2222-4222-8222-222222222222";

// verification_tier "verified" is what gates BOTH seals (badges.js:140 for the
// BadgeRow chip, ProducerDetail's `verified` prop for the masthead) — a
// non-verified producer renders neither, so the popover could never be opened.
const baseProducer = {
  name: "מאפיית הדגמה",
  slug: "demo-bakery",
  city: "זכרון יעקב",
  description: "עסק הדגמה לבדיקת קישור האמון",
  categories: [{ id: 4, name: "לחמים ואפייה" }],
  lat: 32.5732,
  lng: 34.9519,
  locations: [],
  primary_contact_method: "whatsapp",
  phone: "0501110001",
  delivery_areas: [],
  avg_rating: 4.8,
  reviews_count: 27,
  plan: "free",
  verification_tier: "verified",
  verification_doc_type: "license",
  verified_at: "2026-06-01",
};

// images: [] → the Tinted Masthead branch renders, carrying the masthead seal.
const imagelessProducer = { ...baseProducer, id: IMAGELESS_ID, images: [] };
// images present → the masthead branch returns early and the header BadgeRow
// hero seal is the one on screen. Same popover copy, different component.
const imagedProducer = {
  ...baseProducer,
  id: IMAGED_ID,
  name: "מאפייה עם תמונות",
  slug: "demo-bakery-imaged",
  images: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
};

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/** Read the popover's link as the DOM sees it (absolute href → pathname+hash). */
const readPopoverLink = (page) =>
  page.evaluate(() => {
    const pop = document.querySelector('[data-testid="badge-tooltip-verified"]');
    if (!pop) return { present: false };
    const a = pop.querySelector("a");
    if (!a) return { present: true, link: null };
    const u = new URL(a.getAttribute("href"), location.origin);
    return { present: true, link: u.pathname + u.hash, text: a.textContent.trim() };
  });

async function run(width, height, label) {
  const browser = await chromium.launch({
    args: ["--ssl-version-max=tls1.2"],
    ...(fs.existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
  });
  const page = await browser.newPage({ viewport: { width, height } });

  const serve = (producer) => (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(producer),
    });

  await page.route(new RegExp(`/api/producers/${IMAGELESS_ID}(?:\\?[^#]*)?$`), serve(imagelessProducer));
  await page.route(new RegExp(`/api/producers/${IMAGED_ID}(?:\\?[^#]*)?$`), serve(imagedProducer));
  // Everything else the page fans out to (reviews, similar, products…) → empty.
  await page.route(/\/api\/(reviews|producers\/[^/]+\/(products|events|recipes|experiences))/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  // ── 1. masthead seal (ImageGallery.jsx, imageless branch) ─────────────────
  await page.goto(`${BASE}/producer/${IMAGELESS_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="masthead-verified"]', { timeout: 30_000 });
  await page.click('[data-testid="masthead-verified"]');
  await page.waitForSelector('[data-testid="badge-tooltip-verified"]', { timeout: 10_000 });
  await page.waitForTimeout(500);

  const masthead = await readPopoverLink(page);
  check(`[${label}] masthead popover links to ${CANONICAL}`,
    masthead.link === CANONICAL, `link=${masthead.link}`);
  check(`[${label}] masthead popover no longer points at ${OLD_TARGET}`,
    masthead.link !== OLD_TARGET, `link=${masthead.link}`);
  await page.screenshot({ path: path.join(OUT, `${label}-01-masthead-popover.png`) });

  // Click-through: an href is a claim, a landing is the fact.
  await page.click('[data-testid="badge-tooltip-verified"] a');
  await page.waitForURL(/\/about\/process$/, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(800);
  const landedMasthead = new URL(page.url()).pathname;
  check(`[${label}] masthead link CLICK lands on ${CANONICAL}`,
    landedMasthead === CANONICAL, `url=${landedMasthead}`);
  // h1 present ⇒ the route really rendered, not a 404 shell at the right path.
  const processH1 = await page.locator("h1").first().textContent().catch(() => null);
  check(`[${label}] /about/process renders an h1`, Boolean(processH1?.trim()),
    `h1=${processH1?.trim()?.slice(0, 40) ?? "(none)"}`);
  await page.screenshot({ path: path.join(OUT, `${label}-02-lands-on-process.png`) });

  // ── 2. BadgeRow hero seal (producer WITH images) ──────────────────────────
  await page.goto(`${BASE}/producer/${IMAGED_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const heroSeal = page.locator('[data-badge="verified"]').first();
  await heroSeal.scrollIntoViewIfNeeded();
  await heroSeal.click();
  await page.waitForSelector('[data-testid="badge-tooltip-verified"]', { timeout: 10_000 });
  await page.waitForTimeout(500);

  const hero = await readPopoverLink(page);
  check(`[${label}] BadgeRow hero popover links to ${CANONICAL}`,
    hero.link === CANONICAL, `link=${hero.link}`);
  check(`[${label}] both seals agree on one destination`,
    hero.link === masthead.link, `hero=${hero.link} masthead=${masthead.link}`);
  await page.screenshot({ path: path.join(OUT, `${label}-03-badgerow-popover.png`) });

  // ── 3. /about — anchor still defined + in-section teaser link ─────────────
  await page.goto(`${BASE}${OLD_TARGET}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const about = await page.evaluate(() => {
    const sec = document.getElementById("verification");
    const teaser = document.querySelector('[data-testid="verification-process-link"]');
    return {
      anchorPresent: !!sec,
      teaserPresent: !!teaser,
      teaserInsideSection: !!(sec && teaser && sec.contains(teaser)),
      teaserHref: teaser ? new URL(teaser.getAttribute("href"), location.origin).pathname : null,
      teaserText: teaser?.textContent.trim() ?? null,
    };
  });
  check(`[${label}] /about still defines #verification (deep-links stay valid)`,
    about.anchorPresent);
  check(`[${label}] teaser link exists INSIDE the verification section`,
    about.teaserInsideSection, `present=${about.teaserPresent} inside=${about.teaserInsideSection}`);
  check(`[${label}] teaser link points at ${CANONICAL}`,
    about.teaserHref === CANONICAL, `href=${about.teaserHref}`);

  const section = page.locator("#verification");
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await section.screenshot({ path: path.join(OUT, `${label}-04-about-verification-section.png`) });

  await browser.close();
}

fs.mkdirSync(OUT, { recursive: true });
await run(375, 812, "mobile-375");
await run(1440, 900, "desktop-1440");

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
