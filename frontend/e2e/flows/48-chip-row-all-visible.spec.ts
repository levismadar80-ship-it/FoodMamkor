import { test, expect, type Page, type Route } from "./_cloudinary-stub";
// REUSES: lib/israel-date.js — the one owner of "today in Israel" (frontend.md).
import { israelToday } from "../../lib/israel-date";

/**
 * Spec:     48-chip-row-all-visible
 * Purpose:  MEH-3153 part 1 — on /producers, /events and /favorites the «הכל»
 *           chip is inside the chip row's visible box right after load, at the
 *           phone width. Guards the MEH-2823 fix (PR #4157,
 *           components/ChipScrollRow.jsx «pin again when overflow APPEARS»):
 *           iOS WebKit re-snaps an RTL scroll-snap row to its far end after a
 *           layout (bugs.webkit.org/207826), and a mount-only pin lost to it.
 * Does NOT: test the jsdom logic (that is __tests__/ChipScrollRow.test.jsx), or
 *           what any chip does when tapped.
 * Engine:   Playwright's WebKit is the Linux port, not iOS, and it does NOT
 *           reproduce 207826: measured 20/11, all three tests stayed green in
 *           `webkit-iphone13` with the fix reverted. So the spec reproduces the
 *           re-snap itself (emulateRtlResnap below): the moment a chip row's
 *           overflow appears (its end spacer mounts), the row is thrown to its
 *           far end, as iOS does. The fix pulls it back; the pre-fix mount-only
 *           pin does not. Measured 20/11 against a local build, 3 runs each:
 *           with the fix, 9/9 green in webkit-iphone13 and in mobile; with the
 *           MEH-2823 pin reverted (mount-only, no rAF), /events red 3/3 in both
 *           engines («הכל» at x=538–595 in a 16–374 row). /favorites stayed
 *           green with the fix reverted (its row overflows from its first
 *           render, and the mount pin alone covers the emulated re-snap), and
 *           /producers did not overflow on the local data. Both are kept as
 *           coverage of the card's surfaces, not as the red-proof. This is an emulation of the engine bug, not
 *           the bug: only a real iPhone shows the real one.
 * Touches:  /favorites: /api/auth/me, /api/users/me/favorites, /api/users/me/saved*
 *           stubbed (a signed-in visitor with saved items of every type).
 *           /events: GET /api/events stubbed with rows that light every chip.
 *           Both are frontend-state stubs (e2e/CLAUDE.md, MEH-1968): nothing
 *           here asserts what the backend computes, the contracts are pinned by
 *           lib/api-schemas.js, and the stubbed rows are what makes each row
 *           overflow on any dataset (staging's moves).
 *           /producers: no stub — real categories, so whether its row
 *           overflows depends on the data; recorded as an annotation.
 * History:  MEH-3153 (creation).
 */

/** Frames to wait after the row overflows: the fix's own pin runs one rAF
 *  after the overflow flip, and WebKit's re-snap lands within a layout or
 *  two. Counted in frames, not milliseconds (testing.md, MEH-2972). */
const SETTLE_FRAMES = 20;

/** The reset chip: «הכל» on /events and /favorites, «כל הקטגוריות» on
 *  /producers (filters.category_all). Always the row's first chip. */
const ALL_LABEL = /^(הכל|כל הקטגוריות)/;

type RowGeometry = {
  overflow: boolean;
  scrollLeft: number;
  chipStart: number;
  chipEnd: number;
  rowStart: number;
  rowEnd: number;
};

/**
 * Emulate bugs.webkit.org/207826: when a chip row starts to overflow (its end
 * spacer is appended — ChipScrollRow.jsx, `hasOverflow &&` spacer), scroll it to
 * its far (inline-end) end, once, in the same microtask. That lands before any
 * frame the component can schedule, so a fix that re-pins on the overflow flip
 * wins and a mount-only pin loses. Programmatic scrolling fires no pointer or
 * key event, so the component's «the user moved the row» flag stays false.
 */
async function emulateRtlResnap(page: Page) {
  await page.addInitScript(() => {
    // Once per row per trigger: (1) the row is inserted already overflowing,
    // (2) its end spacer is appended (the overflow flip). Nothing else — a
    // re-snap on every chip change would test more than MEH-2823 fixed.
    const seen = { insert: new WeakSet<Element>(), spacer: new WeakSet<Element>() };
    const resnap = (el: Element, kind: "insert" | "spacer") => {
      if (seen[kind].has(el) || !el.querySelector("[data-roving-chip]")) return;
      if (el.scrollWidth - el.clientWidth <= 1) return;
      seen[kind].add(el);
      // dir=rtl: scrollLeft is 0 at the start and negative toward the end.
      const throwToEnd = () => {
        (el as HTMLElement).scrollLeft = -(el.scrollWidth - el.clientWidth);
      };
      // Synchronously, in the mutation's microtask: before any frame. The fix
      // pins again one frame after the flip, so it always lands after this —
      // a rAF here would race that pin and make the spec flaky (measured).
      throwToEnd();
    };
    new MutationObserver((records) => {
      for (const r of records) {
        const t = r.target as Element;
        r.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          // ChipScrollRow's end spacer: the aria-hidden div after the chips.
          if (t.getAttribute?.("role") === "toolbar" && n.getAttribute("aria-hidden") === "true" && !n.hasAttribute("data-roving-chip")) {
            resnap(t, "spacer");
          }
          n.querySelectorAll('[role="toolbar"]').forEach((row) => resnap(row, "insert"));
        });
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

function chipRow(page: Page) {
  return page
    .getByRole("toolbar")
    .filter({ has: page.getByRole("button", { name: ALL_LABEL }) })
    .first();
}

/** Measure «הכל» against the row's own scroll box, after the row settles. */
async function settledGeometry(page: Page): Promise<RowGeometry> {
  const row = chipRow(page);
  await expect(row).toBeVisible();
  return row.evaluate(async (toolbar, frames) => {
    const scroller = /** scroll container = the toolbar or its nearest scrolling ancestor */ (
      (el: HTMLElement | null): HTMLElement => {
        let cur = el;
        while (cur) {
          const s = getComputedStyle(cur);
          if (/(auto|scroll)/.test(s.overflowX)) return cur;
          cur = cur.parentElement;
        }
        return toolbar as HTMLElement;
      }
    )(toolbar as HTMLElement);
    for (let i = 0; i < frames; i++) await new Promise((r) => requestAnimationFrame(r));
    const all = toolbar.querySelector("button[data-roving-chip]") as HTMLElement;
    const c = all.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    return {
      overflow: scroller.scrollWidth > scroller.clientWidth + 1,
      scrollLeft: scroller.scrollLeft,
      chipStart: c.left,
      chipEnd: c.right,
      rowStart: s.left,
      rowEnd: s.right,
    };
  }, SETTLE_FRAMES);
}

function expectAllInside(g: RowGeometry) {
  const where = `chip ${g.chipStart.toFixed(0)}–${g.chipEnd.toFixed(0)}, row ${g.rowStart.toFixed(0)}–${g.rowEnd.toFixed(0)}, scrollLeft ${g.scrollLeft}`;
  // RTL: «הכל» is the inline-start (right-most) chip. Both edges inside the box
  // = fully visible; 1px slack for sub-pixel layout.
  expect(g.chipEnd, `«הכל» is cut off past the row's right edge (${where})`).toBeLessThanOrEqual(g.rowEnd + 1);
  expect(g.chipStart, `«הכל» is scrolled out past the row's left edge (${where})`).toBeGreaterThanOrEqual(g.rowStart - 1);
}

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

function isoDaysFromToday(n: number): string {
  const [y, m, d] = israelToday().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

test.describe("MEH-3153 — «הכל» is visible right after load", () => {
  test.beforeEach(async ({ page }) => {
    await emulateRtlResnap(page);
  });

  test("/producers: «כל הקטגוריות» is in view", async ({ page }) => {
    await page.goto("/producers");
    const g = await settledGeometry(page);
    // Real data (no stub): the row overflows only when the feed holds enough
    // categories. Recorded, not required — /events and /favorites below are
    // stubbed so that they always overflow, and they carry the red-proof.
    test.info().annotations.push({ type: "overflow", description: String(g.overflow) });
    expectAllInside(g);
  });

  test("/events: with every chip lit, «הכל» is in view", async ({ page }) => {
    const cats = ["שוק", "קטיף", "טעימות"];
    // One row per day for a week, cycling the categories → every date shortcut
    // (today / tomorrow / weekend) and every category chip has a result.
    const rows = Array.from({ length: 7 }, (_, i) => ({
      id: `meh3153-${i}`,
      title: `אירוע ${i + 1}`,
      event_date: isoDaysFromToday(i),
      event_time: "10:00",
      category: cats[i % cats.length],
      producer_name: "עסק לדוגמה",
      city: "תל אביב",
      is_active: true,
    }));
    await page.route(/\/api\/events(?:\?|$)/, (route) => json(route, rows));
    await page.goto("/events");
    const g = await settledGeometry(page);
    test.info().annotations.push({ type: "overflow", description: String(g.overflow) });
    expectAllInside(g);
  });

  test("/favorites: with saved items of every type, «הכל» is in view", async ({ page }) => {
    const token = "meh3153-stub-token";
    // Strip the stub token from anything not stubbed below (same reason as
    // flows/31-favorites-journey-d.spec.ts stubSignedIn, MEH-2531).
    await page.route("**/api/**", (route) => {
      const headers = { ...route.request().headers() };
      if (headers.authorization === `Bearer ${token}`) delete headers.authorization;
      return route.continue({ headers });
    });
    await page.addInitScript((t) => window.localStorage.setItem("token", t), token);
    await page.route("**/api/auth/me", (route) =>
      json(route, { id: "meh3153-user", email: "meh3153@example.com", name: "יעל", role: "user", city: null }),
    );
    await page.route(/\/api\/users\/me\/favorites(?:\/|\?|$)/, (route) => json(route, []));
    const future = isoDaysFromToday(10);
    const two = (kind: string) =>
      [1, 2].map((n) => ({ id: `meh3153-${kind}-${n}`, title: `${kind} ${n}`, event_date: future, is_active: true }));
    await page.route(/\/api\/users\/me\/saved(?:\/ids)?(?:\?|$)/, (route) => {
      const isIds = new URL(route.request().url()).pathname.endsWith("/ids");
      return json(
        route,
        isIds
          ? []
          : {
              recipes: [1, 2].map((n) => ({
                id: `meh3153-recipe-${n}`,
                title: `מתכון ${n}`,
                producer_name: "עסק לדוגמה",
              })),
              events: two("event"),
              experiences: two("experience"),
            },
      );
    });
    await page.goto("/favorites");
    const g = await settledGeometry(page);
    test.info().annotations.push({ type: "overflow", description: String(g.overflow) });
    expectAllInside(g);
  });
});
