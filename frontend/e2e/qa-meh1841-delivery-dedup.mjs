/**
 * MEH-1841 self-QA harness — counts the delivery-related chips actually RENDERED
 * on a producer card, in a real browser.
 *
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1841-delivery-dedup.mjs [baseURL] [chromiumPath]
 *
 * The fixture is a DISCRIMINATING PAIR — the vitest guard proves `allBadges`
 * drops the key, this proves the card paints one chip instead of two:
 *   · delivery-only  (has_physical_location=false, offers_delivery=true) —
 *     the case the ticket is about. Before the fix: "משלוח" badge + "משלוחים
 *     בלבד" pill = 2. After: the pill only = 1.
 *   · physical+delivery — the control. Renders the generic "משלוח" badge and
 *     NO pill, on both trees. A probe that only counted "is there a delivery
 *     chip" reports 1 for both cards on the BROKEN tree too, so it cannot tell
 *     the fix from the bug; counting which chip, per card, is what does.
 *   · delivery-only + 4 other badges — drives the `+N` overflow popover, whose
 *     rows come from allBadges().slice(2). A suppression that missed the count
 *     would re-surface "משלוח" inside the popover with the card still looking
 *     right when closed.
 *
 * The generic badge is counted off `data-badge` (BadgeRow.jsx:247), never off
 * rendered text. The "משלוחים בלבד" pill has no testid (ProducerCard.jsx:382),
 * so it is matched on its exact string — the one place a text match is the only
 * option, and it is disambiguated from the generic badge by the badge count
 * being read separately.
 *
 * REUSES: frontend/e2e/qa-meh1704-badge-parity.mjs (argv baseURL + chromiumPath,
 * never process.env — the MEH-491 env-drift gate blocks undocumented env reads;
 * route-fulfil fixture shape; per-viewport context loop).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3300";
const OUT = new URL("../../qa-artifacts/MEH-1841", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const PRODUCERS_COLLECTION_RE = /\/api\/producers(?:\?[^#]*)?$/;

const DELIVERY_ONLY_PILL = "משלוחים בלבד";

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
  // Both delivery signals set on every fixture: `earnsBadge("delivery")` is an
  // OR over the two, so setting only one would leave the other path unprobed.
  has_delivery: true,
  delivery_count: 4,
});

const PRODUCERS = [
  {
    ...base(1),
    name: "משלוחים בלבד",
    has_physical_location: false,
    offers_delivery: true,
  },
  {
    ...base(2),
    name: "חנות עם משלוח",
    has_physical_location: true,
    offers_delivery: true,
    lat: 31.7683,
    lng: 35.2137,
  },
  {
    ...base(3),
    name: "משלוחים בלבד עם תגים",
    has_physical_location: false,
    offers_delivery: true,
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
const record = (label, value) => {
  results.push(`${label}: ${JSON.stringify(value)}`);
  console.log(label, value);
};

let failures = 0;
const assert = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  record(`${ok ? "PASS" : "FAIL"} ${label}`, { actual, expected });
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

  const cards = await page.evaluate((pillText) => {
    return [...document.querySelectorAll('[data-testid="producer-card"]')].map(
      (el) => {
        const badges = [...el.querySelectorAll("[data-badge]")].map(
          (n) => n.dataset.badge,
        );
        const pills = [...el.querySelectorAll("span")].filter(
          (n) => n.textContent.trim() === pillText,
        ).length;
        const genericDelivery = badges.filter((b) => b === "delivery").length;
        return {
          name: (el.querySelector("h2,h3")?.textContent ?? "").trim(),
          badges,
          genericDelivery,
          deliveryOnlyPill: pills,
          // The numeric assertion the ticket asks for.
          deliveryChipTotal: genericDelivery + pills,
          overflow:
            el
              .querySelector('[data-testid="badge-overflow"]')
              ?.textContent.trim() ?? null,
        };
      },
    );
  }, DELIVERY_ONLY_PILL);
  record(`cards-${name}`, cards);

  const byName = Object.fromEntries(cards.map((c) => [c.name, c]));
  const only = byName["משלוחים בלבד"];
  const physical = byName["חנות עם משלוח"];
  const onlyMany = byName["משלוחים בלבד עם תגים"];

  // (a) delivery-only card: exactly ONE delivery chip, and it is the pill.
  assert(`delivery-only-chip-total-${name}`, only?.deliveryChipTotal, 1);
  assert(`delivery-only-generic-badge-${name}`, only?.genericDelivery, 0);
  assert(`delivery-only-pill-${name}`, only?.deliveryOnlyPill, 1);

  // (b) physical+delivery card: generic badge present, no pill.
  assert(`physical-generic-badge-${name}`, physical?.genericDelivery, 1);
  assert(`physical-no-pill-${name}`, physical?.deliveryOnlyPill, 0);

  // (c) the `+N` overflow path — open the popover and read its rows. A stale
  // badgeCount would put "משלוח" back here with the closed card still correct.
  //
  // The rows are read as a BEFORE/AFTER DIFF, not by a global `[role="listitem"]`
  // scan. The popover portals to document.body (ui/Popover.jsx:315) so it cannot
  // be scoped to the card element — and BadgeRow marks the VISIBLE badge row
  // role="list" too (BadgeRow.jsx:100), so a global scan sweeps up every card's
  // painted badges. The first run of this probe did exactly that and reported
  // "משלוח" inside the popover; the string was card 2's own visible delivery
  // badge, which is the correct render. Diffing is what tells the two apart.
  const listItems = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[role="listitem"]')].map((n) =>
        n.textContent.trim(),
      ),
    );
  let overflowRows = null;
  const overflowBtn = page
    .locator('[data-testid="producer-card"]')
    .filter({ hasText: "משלוחים בלבד עם תגים" })
    .locator('[data-testid="badge-overflow"]');
  if (await overflowBtn.count()) {
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
    record(`overflow-listitems-before-${name}`, before);
    record(`overflow-listitems-after-${name}`, after);
  }
  record(`overflow-rows-${name}`, overflowRows);
  record(`overflow-label-${name}`, onlyMany?.overflow ?? null);
  // Discriminating on the broken tree: without the suppression card 3 earns
  // [verified, recommended, new, delivery, products], so slice(2) is a THREE-row
  // popover reading "+3". Asserting the exact pair catches both the row and the
  // count; asserting merely "no משלוח row" would not catch a stale count.
  assert(`overflow-rows-${name}`, overflowRows, ["חדש", "מוצרים"]);
  assert(`overflow-label-value-${name}`, onlyMany?.overflow, "+2");

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(200);

  await page.screenshot({ path: `${OUT}/home-${name}.png`, fullPage: false });
  const cardLoc = (text) =>
    page.locator('[data-testid="producer-card"]').filter({ hasText: text });
  if (await cardLoc("משלוחים בלבד").first().count())
    await cardLoc("משלוחים בלבד")
      .first()
      .screenshot({ path: `${OUT}/card-delivery-only-${name}.png` });
  if (await cardLoc("חנות עם משלוח").first().count())
    await cardLoc("חנות עם משלוח")
      .first()
      .screenshot({ path: `${OUT}/card-physical-delivery-${name}.png` });

  await ctx.close();
}

record("FAILURES", failures);
fs.writeFileSync(`${OUT}/probe-results.txt`, results.join("\n") + "\n");
await browser.close();
process.exit(failures === 0 ? 0 : 1);
