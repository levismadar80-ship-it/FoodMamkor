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
 *           engines («הכל» at x=538–595 in a 16–374 row), and /events is now
 *           required to overflow before it measures, so a row that never
 *           overflowed cannot pass silently. /favorites stayed green with the
 *           fix reverted because its row does not overflow at 390 px (its
 *           chips fit), and /producers did not overflow on the local data. Both are kept as
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

/** Measure «הכל» against the row's own scroll box, after the row settles.
 *  `mustOverflow`: the stubbed pages wait for the row to overflow first. A
 *  row measured before it overflows never meets the emulated re-snap, and
 *  would pass with the fix reverted (rule MEH-1619: a guard that can't fail). */
async function settledGeometry(page: Page, mustOverflow = false): Promise<RowGeometry> {
  const row = chipRow(page);
  await expect(row).toBeVisible();
  if (mustOverflow) {
    await expect
      // ChipScrollRow mounts its end spacer only when it measured overflow.
      .poll(() => row.evaluate((el) => !!el.querySelector(':scope > [aria-hidden="true"]:not([data-roving-chip])')), {
        message: "the chip row never overflowed, so this run proves nothing about the re-snap",
      })
      .toBe(true);
  }
  return row.evaluate(async (toolbar, [frames, label]) => {
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
    // The reset chip by its name, not "the first chip": a reorder would
    // otherwise measure another chip and stay green.
    const re = new RegExp(label);
    const all = Array.from(toolbar.querySelectorAll<HTMLElement>("button[data-roving-chip]")).find((b) =>
      re.test((b.textContent || "").trim()),
    );
    if (!all) throw new Error(`no chip matching ${label} in the row`);
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
  }, [SETTLE_FRAMES, ALL_LABEL.source] as const);
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

  // The overflow precondition needs a phone-width row: in the 1440px
  // `desktop` project every /events chip fits and the poll is red by design
  // (CI shard 1/4 on 9670cb7). The bug is a phone bug, so this proof runs at
  // 390×844 in every project.
  test.describe("phone width", () => {
    // MEH-3847: the stub below answers only the browser's read, so the server
    // HTML still holds the real list and the client swaps it for the stub —
    // a shift no visitor sees, made by the test. Errors stay guarded.
    test.use({ viewport: { width: 390, height: 844 }, loadGuard: "errors" });

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
      const g = await settledGeometry(page, true);
      test.info().annotations.push({ type: "overflow", description: String(g.overflow) });
      expectAllInside(g);
    });
  });

  test("/favorites: with saved items of every type, «הכל» is in view", async ({ page }) => {
    const token = "example-stub-token-meh3153"; // placeholder, not a credential
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
    // Rows the generated schema accepts (lib/generated/api.zod.js,
    // GetSavedUsersMeSavedGetResponse): since #4998 a row that fails it is
    // dropped, and a page of dropped rows is the empty state with no chips.
    const future = isoDaysFromToday(10);
    const stamp = `${isoDaysFromToday(0)}T09:00:00`;
    const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const producer = uuid(99);
    await page.route(/\/api\/users\/me\/saved(?:\/ids)?(?:\?|$)/, (route) => {
      const isIds = new URL(route.request().url()).pathname.endsWith("/ids");
      return json(
        route,
        isIds
          ? []
          : {
              recipes: [1, 2].map((n) => ({
                id: uuid(n),
                title: `מתכון ${n}`,
                producer_name: "עסק לדוגמה",
                producer_slug: "example-business",
                saved_at: stamp,
              })),
              events: [3, 4].map((n) => ({
                id: uuid(n),
                title: `אירוע ${n}`,
                category: "workshop",
                created_at: stamp,
                event_date: future,
                is_active: true,
                price: 0,
                producer_id: producer,
                saved_at: stamp,
              })),
              experiences: [5, 6].map((n) => ({
                id: uuid(n),
                title: `חוויה ${n}`,
                description: "תיאור",
                created_at: stamp,
                event_date: future,
                location_type: "on_site",
                status: "active",
                saved_at: stamp,
              })),
            },
      );
    });
    await page.goto("/favorites");
    // Not required to overflow: measured 20/11 after the review, its five
    // filter chips fit the 390 px row, so this is coverage, not red-proof.
    const g = await settledGeometry(page);
    test.info().annotations.push({ type: "overflow", description: String(g.overflow) });
    expectAllInside(g);
  });
});
