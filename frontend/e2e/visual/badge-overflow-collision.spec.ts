import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * MEH-1592 — the ProducerCard "+N" badge-overflow Popover must not collide.
 *
 * MEH-1547 turned the +N counter from a dead <span> into a Popover trigger.
 * The panel it opened was anchored `top-full` (downward) inside a badge strip
 * that is pinned to the photo's BOTTOM edge, so it opened straight onto the
 * card body — measured 47.9x24.1px of overlap with the card title at 1440px —
 * and onto any sibling pill that had wrapped below it (Sapir's QA screenshot:
 * the "+1" panel over "מובילת קהילה" + the rating row). MEH-1592 moved the
 * lg-and-up presentation to the Popover's `overlay` mode.
 *
 * The assertions here are NUMERIC, not visual: the panel's bounding box must
 * have exactly ZERO intersections with every sibling pill in the strip and
 * with the card's title/rating row, and must sit fully inside the viewport,
 * at 375px AND 1440px.
 *
 * ── Placement + MEH-417 no-mocks EXCEPTION ────────────────────────────────
 * This spec lives under e2e/visual/ and uses page.route(). frontend/e2e/
 * CLAUDE.md:25 forbids mocks in FUNCTIONAL specs ("mocks hid real backend
 * bugs for 8 CI cycles") and scopes the exception to e2e/visual/** , where
 * "the subject is layout/pixels and the data is noise" — which is exactly
 * this spec: the subject is geometry, and which business renders is noise.
 * It is also a hard requirement, not a convenience: the CI E2E job runs
 * `next start` against localhost with NO backend (e2e.yml:158), so a card
 * earning 3+ badges cannot exist unmocked. DO NOT copy this into e2e/flows/.
 *
 * The route target is /search: it client-fetches GET /producers
 * (app/[locale]/search/SearchClient.jsx:80) and renders ProducerCard, so
 * page.route intercepts it. /producers cannot be used — it SSR-seeds its
 * first page (app/[locale]/producers/page.jsx:25), which page.route cannot
 * reach (same constraint parity.spec.ts:302-307 documents for /[slug]).
 */

// Sapir's reported case: badge priority is verified > license > … > kosher,
// so visible = verified + license and hidden = kosher → a "+1" disclosing
// "כשר", beside a tier-4 TrustBadge ("מובילת קהילה").
const SAPIR_CASE = {
  id: 1,
  name: "מאפיית לחם וזמן",
  city: "תל אביב",
  verification_tier: "verified",
  has_producer_license: true,
  kashrut_verified_at: "2026-01-01T00:00:00Z",
  trust_tier: 4,
  avg_rating: 4.8,
  reviews_count: 12,
  products_count: 1,
};

// Stress case: 5 badges → a taller disclosure list (more room to collide).
const STRESS_CASE = {
  ...SAPIR_CASE,
  id: 2,
  name: "חוות הרי גליל",
  grass_fed: true,
  has_gluten_free_products: true,
  has_delivery: true,
  products_count: 8,
};

const PRODUCERS = [SAPIR_CASE, STRESS_CASE];
const SEARCH_URL = `/search?q=${encodeURIComponent("לחם")}`;

type Box = { x: number; y: number; width: number; height: number };

/** Overlap in px, or null when the boxes are disjoint. Sub-pixel AA noise
 *  (<0.5px on either axis) is not an overlap. */
function overlap(a: Box, b: Box): { w: number; h: number } | null {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0.5 && h > 0.5 ? { w, h } : null;
}

async function mockProducers(page: Page) {
  // Playwright matches routes in REVERSE registration order, so the catch-all
  // is registered FIRST and the specific handlers after it.
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/api/search*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ products: [] }),
    }),
  );
  await page.route("**/api/producers*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "x-total-count": String(PRODUCERS.length) },
      body: JSON.stringify(PRODUCERS),
    }),
  );
}

/** Every sibling element in the +N chip's badge strip, plus the card's title
 *  and rating row — i.e. everything the panel is forbidden to touch. */
async function collisionTargets(chip: Locator): Promise<{ name: string; box: Box }[]> {
  const card = chip.locator("xpath=ancestor::article[1]");
  const strip = chip.locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]");
  const targets: { name: string; box: Box }[] = [];

  const pills = strip.locator("button[data-badge], [aria-label]");
  for (let i = 0; i < (await pills.count()); i++) {
    const pill = pills.nth(i);
    // Skip the +N trigger itself — a popover may touch its own trigger.
    if ((await pill.getAttribute("data-testid")) === "badge-overflow") continue;
    const box = await pill.boundingBox();
    if (box) targets.push({ name: (await pill.getAttribute("aria-label")) ?? "pill", box });
  }

  for (const [name, locator] of [
    ["card-rating", card.locator('[data-testid="card-rating"]')],
    ["card-title", card.locator("h3")],
  ] as const) {
    if (await locator.count()) {
      const box = await locator.boundingBox();
      if (box) targets.push({ name, box });
    }
  }
  return targets;
}

for (const viewport of [
  { width: 1440, height: 900, label: "desktop 1440px" },
  { width: 375, height: 812, label: "mobile 375px" },
]) {
  test.describe(`MEH-1592 +N popover collision — ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("panel has 0 intersections with siblings and stays in the viewport", async ({ page }) => {
      await mockProducers(page);
      await page.goto(SEARCH_URL);

      const chips = page.locator('[data-testid="badge-overflow"]');
      await expect(chips.first()).toBeVisible();
      const chipCount = await chips.count();
      expect(chipCount).toBe(PRODUCERS.length);

      for (let i = 0; i < chipCount; i++) {
        const chip = chips.nth(i);
        await chip.scrollIntoViewIfNeeded();
        await chip.click();

        const panel = page.locator('[data-testid="badge-overflow-popover"]');
        await expect(panel).toBeVisible();
        const panelBox = (await panel.boundingBox())!;
        expect(panelBox, `card ${i}: panel has no box`).toBeTruthy();

        // ── exactly 0 intersections ──────────────────────────────────────
        const hits = (await collisionTargets(chip))
          .map((target) => ({ name: target.name, hit: overlap(panelBox, target.box) }))
          .filter((entry) => entry.hit);
        expect(
          hits.map((entry) => `${entry.name} (${entry.hit!.w.toFixed(1)}x${entry.hit!.h.toFixed(1)}px)`),
          `card ${i} "${PRODUCERS[i].name}": popover must not overlap any sibling pill or the title/rating row`,
        ).toEqual([]);

        // ── still ANCHORED to its own trigger ────────────────────────────
        // "0 intersections" alone is satisfiable by flinging the panel to the
        // far side of the screen — which is exactly what a direction misread
        // did during MEH-1592 development (panel measured 982px from its
        // trigger at 1440px, both other assertions still green). On the sheet
        // presentation (<lg) the panel is deliberately full-width, so the
        // anchor check only applies to the anchored/overlay presentation.
        const triggerBox = (await chip.boundingBox())!;
        const isFullWidthSheet = panelBox.width >= viewport.width - 1;
        if (!isFullWidthSheet) {
          const inlineGap = Math.min(
            Math.abs(triggerBox.x - panelBox.x),
            Math.abs(triggerBox.x + triggerBox.width - (panelBox.x + panelBox.width)),
          );
          expect(inlineGap, `card ${i}: popover is not anchored to its own +N chip`)
            .toBeLessThanOrEqual(80);
        }

        // ── fully inside the viewport (no clipping, flip/shift worked) ────
        expect(panelBox.x, `card ${i}: clipped at inline edge`).toBeGreaterThanOrEqual(-0.5);
        expect(panelBox.y, `card ${i}: clipped at top`).toBeGreaterThanOrEqual(-0.5);
        expect(panelBox.x + panelBox.width, `card ${i}: clipped at opposite inline edge`)
          .toBeLessThanOrEqual(viewport.width + 0.5);
        expect(panelBox.y + panelBox.height, `card ${i}: clipped at bottom`)
          .toBeLessThanOrEqual(viewport.height + 0.5);

        await page.keyboard.press("Escape");
        await expect(panel).toHaveCount(0);
      }
    });
  });
}

test.describe("MEH-1592 +N popover — one-at-a-time + tap guard", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // Desktop only: below lg the +N presents as the MEH-1334 bottom sheet, whose
  // modal backdrop makes "two open at once" structurally impossible (a tap
  // aimed at a badge lands on the backdrop and dismisses the sheet instead).
  test("opening +N closes an open badge popover, and vice versa", async ({ page }) => {
    await mockProducers(page);
    await page.goto(SEARCH_URL);

    const chip = page.locator('[data-testid="badge-overflow"]').first();
    await expect(chip).toBeVisible();
    const card = chip.locator("xpath=ancestor::article[1]");
    // `[aria-haspopup]` is load-bearing, not decoration: on the CARD surface the
    // verified seal renders WITHOUT a Popover when it has no tooltip content
    // (BadgeRow.jsx:185-199 — the "cosmetics" branch), so `button[data-badge]`
    // alone can resolve to a chip that opens nothing.
    const badge = card.locator("button[data-badge][aria-haspopup]").first();
    const anyPanel = page.locator(
      '[data-testid="badge-overflow-popover"], [data-testid^="badge-tooltip-"]',
    );

    // badge → +N
    await badge.click();
    await expect(anyPanel).toHaveCount(1);
    await chip.click();
    await expect(anyPanel).toHaveCount(1);
    await expect(page.locator('[data-testid="badge-overflow-popover"]')).toHaveCount(1);

    // +N → badge
    await badge.click();
    await expect(anyPanel).toHaveCount(1);
    await expect(page.locator('[data-testid="badge-overflow-popover"]')).toHaveCount(0);
  });

  test("tapping +N discloses the hidden badges without navigating the card", async ({ page }) => {
    await mockProducers(page);
    await page.goto(SEARCH_URL);

    const chip = page.locator('[data-testid="badge-overflow"]').first();
    await expect(chip).toBeVisible();
    await chip.click();

    // Hidden badge for SAPIR_CASE (visible = verified + license) is kosher.
    await expect(page.locator('[data-testid="badge-overflow-popover"]')).toContainText("כשר");
    // The card Link must not have fired.
    await expect(page).toHaveURL(new RegExp("/search"));

    // Outside-click dismissal still works with the portalled panel.
    await page.locator("h1").first().click({ force: true });
    await expect(page.locator('[data-testid="badge-overflow-popover"]')).toHaveCount(0);
  });
});
