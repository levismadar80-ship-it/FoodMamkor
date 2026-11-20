import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * MEH-3473 — the «·» between delivery cities never opens a wrapped line.
 *
 * Sapir 19/11, on a business with 48 delivery cities: at 375 every new line of
 * the compact city list (DeliveryBlock.jsx CompactCities) started with «·",
 * because the separator sat at the START of each item and flex-wrap breaks
 * between items. The fix gives every city a leading separator in a fixed slot
 * and pulls the list past the inline-start edge of an overflow-hidden wrapper,
 * so the first separator of EVERY line is clipped.
 *
 * The assertions are NUMERIC (bounding boxes), not pixels: for each visual line
 * the first item's separator lies wholly outside the clip box and every other
 * separator lies wholly inside it; every city name is wholly inside it. Both
 * the closed (15 + «+ עוד») and the open (48) states, at 375 and 1440.
 *
 * ── Placement + MEH-417 no-mocks EXCEPTION ────────────────────────────────
 * Same carve-out as parity.spec.ts «producer detail» and
 * badge-overflow-collision.spec.ts (frontend/e2e/CLAUDE.md, MEH-1497 §2.4):
 * the subject is layout, the data is noise, and no seeded business carries 48
 * city-only delivery areas. Same mechanics as parity: borrow a real id to clear
 * the middleware existence check, then fulfil the client-side detail fetch from
 * a fixture. DO NOT copy into e2e/flows/.
 */

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "producer-detail-minimal.json"), "utf8"),
);

// 48 real city names of mixed length, so lines break at varied points.
const CITIES = [
  "אור יהודה", "אזור", "אילת", "אלעד", "אריאל", "אשדוד", "אשקלון", "באר יעקב",
  "באר שבע", "בית שאן", "בית שמש", "בני ברק", "בת ים", "גבעת שמואל", "גבעתיים",
  "גדרה", "דימונה", "הוד השרון", "הרצליה", "זכרון יעקב", "חדרה", "חולון",
  "חיפה", "טבריה", "טירת כרמל", "יבנה", "יהוד-מונוסון", "יקנעם עילית",
  "ירושלים", "כפר יונה", "כפר סבא", "כרמיאל", "לוד", "מבשרת ציון",
  "מודיעין-מכבים-רעות", "נהריה", "נס ציונה", "נתניה", "עפולה", "פתח תקווה",
  "צפת", "קריית אונו", "קריית גת", "ראש העין", "ראשון לציון", "רחובות",
  "רמת גן", "תל אביב-יפו",
];

const PRODUCER = {
  ...FIXTURE,
  has_delivery: true,
  offers_delivery: true,
  delivery_nationwide: false,
  delivery_cities: CITIES,
  delivery_areas: CITIES.map((city, i) => ({ id: i + 1, city })),
  delivery_count: CITIES.length,
};

const PRODUCER_DETAIL_RE = /\/api\/producers\/[0-9a-f-]{36}(?:\?|$)/;

type Box = { x: number; y: number; width: number; height: number };
type Item = { sep: Box; city: Box };

async function measure(page: Page): Promise<{ clip: Box; items: Item[]; overflowX: string }> {
  return page.getByTestId("delivery-cities-clip").evaluate((clipEl) => {
    const r = (el: Element) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    };
    const items = [...clipEl.querySelectorAll("li")].map((li) => ({
      sep: r(li.querySelector('[data-testid="delivery-city-sep"]')!),
      city: r(li.lastElementChild!),
    }));
    // The box geometry below is the same with or without the clip, so the
    // clip itself is read from the computed style (fresh-review finding).
    const overflowX = getComputedStyle(clipEl).overflowX;
    return { clip: r(clipEl), items, overflowX };
  });
}

const inside = (b: Box, c: Box) => b.x >= c.x - 0.5 && b.x + b.width <= c.x + c.width + 0.5;
const outside = (b: Box, c: Box) => b.x >= c.x + c.width - 0.5 || b.x + b.width <= c.x + 0.5;

function assertLines({ clip, items, overflowX }: { clip: Box; items: Item[]; overflowX: string }, label: string): number {
  expect(overflowX, `${label}: the wrapper must clip the overhanging separators`).toBe("hidden");
  // Group into visual lines by the city's top edge.
  const lines: Item[][] = [];
  for (const it of items) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].city.y - it.city.y) < 4) last.push(it);
    else lines.push([it]);
  }
  lines.forEach((line, li) => {
    line.forEach((it, i) => {
      expect(inside(it.city, clip), `${label}: line ${li + 1} city ${i + 1} must be fully visible`).toBe(true);
      if (i === 0) {
        expect(outside(it.sep, clip), `${label}: line ${li + 1} must not open with «·»`).toBe(true);
      } else {
        expect(inside(it.sep, clip), `${label}: line ${li + 1} separator ${i + 1} must show`).toBe(true);
      }
    });
  });
  return lines.length;
}

for (const viewport of [
  { label: "375", width: 375, height: 812 },
  { label: "1440", width: 1440, height: 900 },
]) {
  test.describe(`MEH-3473 delivery city separators — ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("no line opens or ends with «·», closed and open", async ({ page }) => {
      await page.route(PRODUCER_DETAIL_RE, (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PRODUCER) }),
      );
      const listRes = await page.request.get("/api/producers", { params: { limit: 1 } });
      const list = listRes.ok() ? await listRes.json().catch(() => []) : [];
      const borrowedId = Array.isArray(list) && list[0]?.id;
      if (!borrowedId) {
        test.skip(true, "No producer on the backend to borrow an id from (parity.spec.ts precedent)");
        return;
      }
      await page.goto(`/producer/${borrowedId}`);
      const listEl = page.getByTestId("delivery-cities");
      await listEl.scrollIntoViewIfNeeded();
      await expect(listEl.locator("li")).toHaveCount(15, { timeout: 20_000 });

      const closedLines = assertLines(await measure(page), `${viewport.label} closed`);
      // The case only discriminates if the list actually wraps.
      expect(closedLines, "closed list must wrap onto 2+ lines").toBeGreaterThan(1);

      await page.getByTestId("delivery-cities-clip").locator("xpath=following-sibling::*[1]").click();
      await expect(listEl.locator("li")).toHaveCount(CITIES.length);
      const openLines = assertLines(await measure(page), `${viewport.label} open`);
      expect(openLines).toBeGreaterThan(closedLines);
    });
  });
}
