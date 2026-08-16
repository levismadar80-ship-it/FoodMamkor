/**
 * MEH-1845 self-QA — proves the new chalak label reaches a rendered surface.
 *
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1845-chalak-label.mjs [baseURL] [chromiumPath]
 *
 * The label change is a single i18n value, so the risk is not "does the string
 * exist" — vitest already proves that — but whether the MEH-1711/MEH-1745
 * resolver carries it to the surfaces Sapir actually looks at. So this asserts
 * on the PAINTED text, and on both resolver paths at once:
 *
 *   · the card's kosher pill      (BadgeRow `resolveBadgeLabel`, visible row)
 *   · the `+N` overflow panel     (ProducerCard, allBadges().slice(2))
 *
 * Both fixtures carry EXACTLY ONE kashrut code. That matters: the resolver
 * falls back to the locked generic "כשרות מאומתת" on zero or 2+ codes
 * (badges.js), so a two-code fixture would render the fallback and the probe
 * would report the old behaviour as a pass — green for the wrong reason.
 *
 * The old value "חלק" is asserted ABSENT as a whole-word match. A substring
 * check is useless here: the new string CONTAINS the old one ("בשר חלק (גלאט)"),
 * so `includes("חלק")` is true in both the fixed and the broken tree.
 *
 * REUSES: frontend/e2e/qa-meh1704-badge-parity.mjs (argv baseURL + chromiumPath,
 * never process.env — the MEH-491 env-drift gate blocks undocumented env reads).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3300";
const OUT = new URL("../../qa-artifacts/MEH-1845", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const PRODUCERS_COLLECTION_RE = /\/api\/producers(?:\?[^#]*)?$/;

const NEW_LABEL = "בשר חלק (גלאט)";
const OLD_LABEL = "חלק";

const base = (i) => ({
  id: `0000000${i}-1111-4111-8111-11111111111${i}`,
  name: `עסק ${i}`,
  slug: `esek-${i}`,
  city: "ירושלים",
  categories: [{ id: 4, name: "לחמים ואפייה" }],
  images: ["https://res.cloudinary.com/demo/image/upload/v1/sample.jpg"],
  avg_rating: 4.8,
  reviews_count: 27,
  primary_contact_method: "whatsapp",
  phone: "0501110001",
  delivery_areas: [],
  locations: [],
  // Exactly ONE code — see the header note on the 2+ fallback.
  kashrut_badges: ["chalak"],
  kashrut_verified_at: "2026-07-01T00:00:00Z",
  kashrut_expires_at: "2027-07-01T00:00:00Z",
});

const PRODUCERS = [
  // Visible-pill path: kosher is the only badge, so it cannot be truncated.
  { ...base(1), name: "משק בקר חלק" },
  // Overflow path: 4 higher-priority badges push kosher past the max-2 cut,
  // so its label is resolved inside the `+N` popover instead.
  {
    ...base(2),
    name: "משק בקר עם תגים",
    verification_tier: "verified",
    is_recommended: true,
    days_since_created: 3,
    products_count: 12,
  },
];

const browser = await chromium.launch({
  executablePath: process.argv[3] || "/opt/pw-browsers/chromium",
});

const results = [];
let failures = 0;
const assert = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  results.push(`${ok ? "PASS" : "FAIL"} ${label}: ${JSON.stringify({ actual, expected })}`);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`, { actual, expected });
};

for (const [name, viewport] of [
  ["375", { width: 375, height: 900 }],
  ["1440", { width: 1440, height: 950 }],
]) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  await page.route(PRODUCERS_COLLECTION_RE, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PRODUCERS),
    }),
  );
  await page.route(/\/stats(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ producers_count: 42, categories_count: 9 }),
    }),
  );
  await page.goto(BASE + "/he", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(2000);

  // ── 1. visible pill ───────────────────────────────────────────────────────
  const pill = await page.evaluate(
    ({ newLabel, oldLabel }) => {
      const card = [...document.querySelectorAll('[data-testid="producer-card"]')].find(
        (el) => el.textContent.includes("משק בקר חלק"),
      );
      if (!card) return { found: false };
      const badges = [...card.querySelectorAll("[data-badge]")].map((n) => ({
        key: n.dataset.badge,
        text: n.textContent.trim(),
      }));
      const kosher = badges.find((b) => b.key === "kosher");
      return {
        found: true,
        badges,
        kosherText: kosher?.text ?? null,
        isNew: kosher?.text === newLabel,
        // whole-word, NOT substring — the new label contains the old one
        isBareOld: kosher?.text === oldLabel,
      };
    },
    { newLabel: NEW_LABEL, oldLabel: OLD_LABEL },
  );
  console.log(`pill-${name}`, pill);
  assert(`card-pill-shows-new-label-${name}`, pill.kosherText, NEW_LABEL);
  assert(`card-pill-not-bare-old-${name}`, pill.isBareOld, false);

  // ── 2. `+N` overflow panel (the surface Sapir screenshotted) ──────────────
  const listItems = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[role="listitem"]')].map((n) => n.textContent.trim()),
    );
  const overflowBtn = page
    .locator('[data-testid="producer-card"]')
    .filter({ hasText: "משק בקר עם תגים" })
    .locator('[data-testid="badge-overflow"]');
  let overflowRows = null;
  if (await overflowBtn.count()) {
    // BEFORE/AFTER diff: BadgeRow marks the VISIBLE badge row role="list" too,
    // and the popover portals to <body>, so a global scan cannot be scoped to
    // the card. Diffing isolates the rows the popover actually added.
    const before = await listItems();
    await overflowBtn.first().click();
    await page.waitForTimeout(400);
    const after = await listItems();
    const rest = [...before];
    overflowRows = after.filter((t) => {
      const i = rest.indexOf(t);
      if (i === -1) return true;
      rest.splice(i, 1);
      return false;
    });
  }
  console.log(`overflow-rows-${name}`, overflowRows);
  assert(
    `overflow-panel-contains-new-label-${name}`,
    (overflowRows ?? []).includes(NEW_LABEL),
    true,
  );
  assert(
    `overflow-panel-has-no-bare-old-label-${name}`,
    (overflowRows ?? []).includes(OLD_LABEL),
    false,
  );

  await page.screenshot({ path: `${OUT}/home-${name}.png`, fullPage: false });
  const overflowCard = page
    .locator('[data-testid="producer-card"]')
    .filter({ hasText: "משק בקר עם תגים" })
    .first();
  if (await overflowCard.count())
    await overflowCard.screenshot({ path: `${OUT}/card-overflow-open-${name}.png` });

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(200);
  const pillCard = page
    .locator('[data-testid="producer-card"]')
    .filter({ hasText: "משק בקר חלק" })
    .first();
  if (await pillCard.count())
    await pillCard.screenshot({ path: `${OUT}/card-kosher-pill-${name}.png` });

  await ctx.close();
}

results.push(`FAILURES: ${failures}`);
fs.writeFileSync(`${OUT}/probe-results.txt`, results.join("\n") + "\n");
await browser.close();
console.log("FAILURES", failures);
process.exit(failures === 0 ? 0 : 1);
