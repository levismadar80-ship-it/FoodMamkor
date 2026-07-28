/**
 * MEH-1688 self-QA harness — the removal spec's numeric assertions, measured in
 * a real browser. This is a REMOVAL ticket: MEH-1578 is the precedent where a
 * removal spec was executed as an addition and rode a green CI to production,
 * so the assertions are about absence and are counted, not eyeballed.
 *
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1688-new-section-removal.mjs [baseURL] [outSuffix] [chromiumPath]
 *
 * Run it TWICE — once on the pre-removal build, once after — and diff the block
 * counts. An absolute count proves nothing here (see the counting rule below);
 * only the delta does.
 *
 * ── COUNTING RULE (verification_step 1 requires this be stated) ──────────────
 * A "top-level block" is a DIRECT element child of the page root rendered by
 * app/[locale]/page.js, with a non-zero bounding-box height at the sampled
 * viewport. Rationale: zero-height wrappers around a self-hiding module are not
 * blocks a reader can perceive, and the ticket's target is perceived page
 * length. Modals/portals are excluded because they are not children of the page
 * root. This rule is arbitrary but FIXED — both runs use it, so the delta is
 * meaningful even though the absolute number is not comparable to the
 * CHANGELOG critique's never-recorded "13".
 *
 * The ticket's assertions 1 and 2 were corrected on 28/07 after Phase 0 showed
 * the original forms were unreachable: an absolute 12/13 is not reproducible,
 * and `grep = 0` would have required deleting an in-use admin label.
 *
 * REUSES: frontend/e2e/qa-meh1704-badge-parity.mjs (fixture + data-badge
 * counting), frontend/e2e/qa-meh1686-social-proof-strip.mjs (argv baseURL,
 * never process.env — the MEH-491 env-drift gate blocks undocumented env reads).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3400";
const SUFFIX = process.argv[3] || "after"; // "before" | "after"
const OUT = new URL("../../qa-artifacts/MEH-1688", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const PRODUCERS_COLLECTION_RE = /\/api\/producers(?:\?[^#]*)?$/;
const NEW_MAX_DAYS = 30; // lib/badges.js — `new` earns at days_since_created <= 30

const base = (i) => ({
  id: `0000000${i}-1111-4111-8111-11111111111${i}`,
  name: `עסק ${i}`,
  slug: `esek-${i}`,
  city: "ירושלים",
  lat: 31.7683,
  lng: 35.2137,
  categories: [{ id: 4, name: "לחמים ואפייה" }],
  images: ["https://res.cloudinary.com/demo/image/upload/v1/sample.jpg"],
  avg_rating: 4.8,
  reviews_count: 27,
  primary_contact_method: "whatsapp",
  phone: "0501110001",
  delivery_areas: [],
  locations: [],
});

// >= 8 producers: the section being removed was gated on
// `producers.length >= NEW_SECTION_MIN_PRODUCERS` (8). A smaller fixture would
// render no section on the BEFORE build either, so the delta would read 0 and
// "prove" a removal that had not happened — a construction that cannot
// discriminate (MEH-1619). No business name contains the badge word "חדש":
// counting badges off rendered text instead of `data-badge` once made a card's
// NAME satisfy the assertion.
const PRODUCERS = [
  { ...base(1), name: "מאפייה טרייה", days_since_created: 3 },              // earns "new"
  { ...base(2), name: "משק ותיק", days_since_created: 400 },                // earns none
  { ...base(3), name: "גבינות הגבול", days_since_created: NEW_MAX_DAYS },   // boundary: earns
  { ...base(4), name: "כוורת מעבר", days_since_created: NEW_MAX_DAYS + 1 }, // boundary: does not
  ...[5, 6, 7, 8, 9].map((i) => ({ ...base(i), days_since_created: 200 })),
];

const browser = await chromium.launch({
  executablePath: process.argv[4] || "/opt/pw-browsers/chromium",
});

const results = [];
const record = (label, value) => {
  results.push(`${label}: ${JSON.stringify(value)}`);
  console.log(label, value);
};

for (const [name, viewport] of [
  ["375", { width: 375, height: 900 }],
  ["1440", { width: 1440, height: 950 }],
]) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  await page.route(PRODUCERS_COLLECTION_RE, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PRODUCERS) })
  );
  await page.route(/\/stats(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ producers_count: 42, categories_count: 9 }),
    })
  );
  await page.goto(BASE + "/he", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(2200);

  // ── #1 — top-level block count, per the stated rule above
  const blocks = await page.evaluate(() => {
    const main = document.querySelector("main");
    const root = main?.firstElementChild;
    const host = root && root.children.length > 1 ? root : main;
    return [...(host?.children ?? [])]
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        h: Math.round(el.getBoundingClientRect().height),
        head: (el.querySelector("h1,h2")?.textContent ?? "").trim().slice(0, 34),
      }))
      .filter((b) => b.h > 0);
  });
  record(`${SUFFIX}-blocks-${name}-count`, blocks.length);
  record(`${SUFFIX}-blocks-${name}-heads`, blocks.map((b) => b.head || `(${b.tag} h=${b.h})`));

  // Is the removed section present at this build? Its heading was
  // home.new_businesses.heading = "בתי עסק חדשים".
  const sectionPresent = await page.evaluate(() =>
    [...document.querySelectorAll("h2")].some((h) => (h.textContent || "").includes("בתי עסק חדשים"))
  );
  record(`${SUFFIX}-new-section-present-${name}`, sectionPresent);

  // ── #4 + #5 — per-card badges, counted off data-badge (BadgeRow.jsx:126,:247)
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="producer-card"]')].map((el) => ({
      name: (el.querySelector("h2,h3")?.textContent ?? "").trim(),
      badges: [...el.querySelectorAll("[data-badge]")].map((n) => n.dataset.badge),
    }))
  );
  const newCount = (n) => cards.find((c) => c.name === n)?.badges.filter((b) => b === "new").length;
  record(`${SUFFIX}-cards-${name}`, cards);
  record(`${SUFFIX}-new-badge-fresh-${name}`, newCount("מאפייה טרייה"));       // expect 1
  record(`${SUFFIX}-new-badge-old-${name}`, newCount("משק ותיק"));            // expect 0
  record(`${SUFFIX}-new-badge-boundary-in-${name}`, newCount("גבינות הגבול"));  // expect 1
  record(`${SUFFIX}-new-badge-boundary-out-${name}`, newCount("כוורת מעבר"));   // expect 0
  record(`${SUFFIX}-cards-over-cap-${name}`, cards.filter((c) => c.badges.length > 2).map((c) => c.name));

  await page.screenshot({ path: `${OUT}/home-${SUFFIX}-${name}.png`, fullPage: false });
  const fresh = page.locator('[data-testid="producer-card"]').first();
  if (await fresh.count()) await fresh.screenshot({ path: `${OUT}/card-new-${SUFFIX}-${name}.png` });

  await ctx.close();
}

fs.writeFileSync(`${OUT}/probe-${SUFFIX}.txt`, results.join("\n") + "\n");
await browser.close();
