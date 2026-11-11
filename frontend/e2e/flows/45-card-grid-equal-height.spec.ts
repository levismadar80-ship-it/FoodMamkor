import { test, expect, type Page, type Locator } from "./_cloudinary-stub";

/**
 * Spec:     card-grid-equal-height (MEH-2802)
 * Purpose:  the geometric guard for «Grid card does not fill its cell»
 *           (docs/BUG_PATTERNS.md). A CSS grid stretches every CELL to the
 *           row's height, but a card inside the cell ends where its content
 *           ends unless it fills the cell — so three cards in one row came out
 *           at three heights, the tick and bottom border stopping short, the
 *           chip+price rows on three lines. jsdom has no layout, so only a real
 *           browser can see this; the class half is __tests__/EventEntryRow.test.jsx.
 *
 *           At 1280px on `/`, per visual row of a 3-up grid: the seasonal
 *           ProducerCard grid has equal card height (±1px).
 *
 *           MEH-2859 removed the «אירועים קרובים» case — see the note in the
 *           describe below. The home page no longer renders a 3-up grid of
 *           EventEntryRow compact cards, so that case had no subject left.
 *
 * Skips:    a grid with fewer than 2 cards has nothing to compare, so the test
 *           SKIPS with the reason — never passes. The skip is decided by the
 *           API's answer, not by counting the rendered cards: a guard that
 *           skips when its subject is missing could never go red if the
 *           section itself vanished (testing.md, MEH-1619). When the API says
 *           ≥2, the cards MUST render.
 * Does NOT: mock anything (e2e/CLAUDE.md, MEH-417) — the data is whatever the
 *           target backend holds, which is why the skips exist.
 */

const DESKTOP = { width: 1280, height: 900 };
const TOLERANCE_PX = 1;
const MIN_CARDS = 2;
// HomeSeasonalNow renders only from 3 producers (SEASONAL_MIN_PRODUCERS).
const SEASONAL_MIN = 3;

type Box = { x: number; y: number; width: number; height: number };

async function apiCount(page: Page, path: string): Promise<number> {
  const res = await page.request.get(path);
  if (!res.ok()) return 0;
  const body = await res.json().catch(() => null);
  return Array.isArray(body) ? body.length : 0;
}

async function boxes(loc: Locator): Promise<Box[]> {
  const n = await loc.count();
  const out: Box[] = [];
  for (let i = 0; i < n; i += 1) {
    const b = await loc.nth(i).boundingBox();
    if (b) out.push(b);
  }
  return out;
}

/** Group cards into visual rows by their top edge — a grid row shares it. */
function rowsOf(items: Box[]): Box[][] {
  const rows: Box[][] = [];
  for (const b of [...items].sort((a, c) => a.y - c.y)) {
    const row = rows.find((r) => Math.abs(r[0].y - b.y) <= TOLERANCE_PX);
    if (row) row.push(b);
    else rows.push([b]);
  }
  return rows;
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

test.describe("Home card grids — every card fills its grid cell (MEH-2802)", () => {
  test.use({ viewport: DESKTOP });

  // MEH-2859: the «אירועים קרובים» case that led this describe is gone with its
  // subject. The home page's events-only preview (the one caller that passed
  // EventEntryRow `compact`, and so the only place a 3-up grid of those cards
  // ever rendered) was replaced by the HomeWhatsOn text strip, which is a
  // single-column row list with no grid cell to fill. The class half of the
  // MEH-2802 guard is untouched in __tests__/EventEntryRow.test.jsx, and the
  // seasonal ProducerCard case below still guards the pattern in a real
  // browser. `compact` itself is now caller-less — removing it is a separate
  // card, not this one's business.

  test("seasonal ProducerCard grid: equal card heights", async ({ page }) => {
    const n = await apiCount(page, "/api/producers?in_season=true");
    test.skip(n < SEASONAL_MIN, `only ${n} in-season producer(s) on this backend — the strip renders from ${SEASONAL_MIN}`);

    await page.goto("/");
    const cards = page.locator('[data-testid="home-seasonal-now"] [data-testid="producer-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    await cards.first().scrollIntoViewIfNeeded();

    const rows = rowsOf(await boxes(cards)).filter((r) => r.length >= MIN_CARDS);
    expect(rows.length, "the 3-up grid put ≥2 cards in one row at 1280px").toBeGreaterThan(0);
    for (const row of rows) {
      expect(spread(row.map((b) => b.height)), `card heights ${row.map((b) => b.height)}`).toBeLessThanOrEqual(
        TOLERANCE_PX,
      );
    }
  });
});
