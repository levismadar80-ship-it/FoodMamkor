import { test, expect } from "./_cloudinary-stub";

/**
 * MEH-3858 — what a returning visitor has stored in this browser never moves
 * the page after the load.
 *
 * Every other spec starts with empty storage, so a component that reads
 * localStorage / sessionStorage after the first paint and changes the layout
 * was invisible to the whole suite. Measured 25/11 on a local production
 * build: the home page shifted CLS 0.14 (phone) / 0.17 (desktop) for a
 * visitor whose favorites-strip hint outlived her session, 0.008 without it.
 * Sentry's real-user p75 for home was 0.35 the same day.
 *
 * The storage below is what a visitor leaves by browsing and clicking:
 * recently viewed businesses, the nav-link caches, dismissed banners, the
 * saved city, a past visit count, a favorites-strip hint whose session ended.
 * Each page then loads with it, and the layout shift summed over the whole
 * load (stricter than CLS's session window) must stay at or under 0.1.
 *
 * NO MOCKS (e2e/CLAUDE.md): real backend; the business ids come from it.
 * CLS is Chromium-only (WebKit has no `layout-shift` entries), so on WebKit
 * this spec measures nothing and says so by skipping.
 */

const LIMIT = 0.1;
/** Frames with no new shift before the load counts as settled (frames, not ms: MEH-2972). */
const STILL_FRAMES = 90;
const MAX_FRAMES = 900;

type Stored = { local: Record<string, string>; session: Record<string, string> };

function returningVisitor(ids: string[]): Stored {
  const now = Date.now();
  const cache = (extra: object) => JSON.stringify({ ...extra, at: now });
  return {
    local: {
      recently_viewed: JSON.stringify(ids.map((id, i) => ({ id, viewedAt: now - i * 60_000 }))),
      user_city: "חיפה",
      favorite_hint_shown: "1",
      chatWasOpened: "true",
      mehamakor_recent_searches: JSON.stringify(["לחם", "גבינות"]),
      pwa_visits: "5",
      // A place she picked for distances («מרחק מ…»), MEH-2506.
      user_location: JSON.stringify({ lat: 32.794, lng: 34.989, source: "city", city: "חיפה" }),
      // The session ended (api.js removes `token`, keeps this): the case
      // that moved the home page.
      fav_strip_hint: "1",
      // She contacted the first business (its page reads these after the load).
      [`wa_clicked_${ids[0]}`]: "1",
      [`contacted_${ids[0]}`]: "phone",
      // Thursday 18:00 to Friday 14:00 every visitor is in Friday mode; the
      // override puts this run there whatever the clock says. It moved home
      // 0.13 / 0.29 after the load until MEH-3860.
      friday_mode_override: "1",
    },
    session: {
      meh_group_buys_any: cache({ any: true }),
      meh_events_upcoming_any: cache({ any: true }),
      meh_experiences_count: cache({ count: 5 }),
      home_visible_count: "8",
      location_banner_dismissed: "1",
      "verify-banner-dismissed": "1",
    },
  };
}

/** Hours of the week that change what a page shows (Israel, winter time). */
const CLOCKS: Array<[string, string]> = [
  ["Thursday 19:00 (Friday mode)", "2026-11-26T19:00:00+02:00"],
  ["Friday 10:00 (Friday mode, before Shabbat)", "2026-11-27T10:00:00+02:00"],
  ["Saturday 12:00 (Shabbat)", "2026-11-28T12:00:00+02:00"],
  ["Sunday 03:00 (night, everything closed)", "2026-11-29T03:00:00+02:00"],
];
const CLOCK_PAGES = ["/", "/producers", "/group-buys", "/events", "/producer"];

// /favorites with no session token is the guest redirect to /login: what a
// signed-out returning visitor gets there, so it is measured as such.
// /rescue is left out: it is behind a flag and answers 404 where it is off.
const PAGES = ["/", "/producers", "/group-buys", "/events", "/experiences", "/favorites", "/recommend", "/about"];

async function loadShift(page: import("@playwright/test").Page, path: string, stored: Stored) {
  await page.addInitScript((s) => {
    try {
      // Seed once per tab, so the page's own writes after this are kept.
      if (!sessionStorage.getItem("__meh3858_seeded")) {
        for (const [k, v] of Object.entries(s.local)) localStorage.setItem(k, v);
        for (const [k, v] of Object.entries(s.session)) sessionStorage.setItem(k, v);
        sessionStorage.setItem("__meh3858_seeded", "1");
      }
    } catch {
      /* storage blocked: the seeded check below fails the test */
    }
    const w = window as unknown as { __meh3858: { sum: number; n: number; observed: boolean } };
    w.__meh3858 = { sum: 0, n: 0, observed: false };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        if (e.hadRecentInput) continue;
        w.__meh3858.sum += e.value;
        w.__meh3858.n += 1;
      }
    }).observe({ type: "layout-shift", buffered: true });
    w.__meh3858.observed = true;
  }, stored);
  const res = await page.goto(path);
  expect(res?.ok(), `${path} must load 2xx`).toBeTruthy();
  return page.evaluate(
    ({ still, max }) =>
      new Promise<{ sum: number; observed: boolean; seeded: string | null }>((resolve) => {
        const w = window as unknown as { __meh3858: { sum: number; n: number; observed: boolean } };
        let last = w.__meh3858.n;
        let quiet = 0;
        let frames = 0;
        const tick = () => {
          frames += 1;
          quiet = w.__meh3858.n === last ? quiet + 1 : 0;
          last = w.__meh3858.n;
          if (quiet >= still || frames >= max) {
            resolve({ sum: w.__meh3858.sum, observed: w.__meh3858.observed, seeded: sessionStorage.getItem("__meh3858_seeded") });
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { still: STILL_FRAMES, max: MAX_FRAMES },
  );
}

test.describe("MEH-3858 a returning visitor's stored state does not move the page", () => {
  // eslint-disable-next-line playwright/no-skipped-test -- gated on the engine, which the product cannot move: WebKit reports no layout-shift entries, so the measurement would read 0
  test.skip(({ browserName }) => browserName !== "chromium", "layout-shift entries are Chromium-only");

  let ids: string[] = [];
  test.beforeAll(async ({ request }) => {
    const res = await request.get("/api/producers");
    expect(res.ok(), "GET /producers must respond 2xx").toBeTruthy();
    const rows = (await res.json()) as Array<{ id: string }>;
    ids = rows.slice(0, 3).map((r) => String(r.id));
    expect(ids.length, "the seeded backend must list businesses").toBeGreaterThan(0);
  });

  for (const path of PAGES) {
    test(`${path}: layout shift over the load stays at or under ${LIMIT}`, async ({ page }) => {
      const r = await loadShift(page, path, returningVisitor(ids));
      expect(r.observed, "the layout-shift observer must be installed").toBe(true);
      expect(r.seeded, "the stored state must be in place").not.toBeNull();
      expect(r.sum).toBeLessThanOrEqual(LIMIT);
    });
  }

  // MEH-3860: what depends on the hour (Friday mode, open now, a holiday, an
  // order window) is painted by the server at ITS time and by the browser at
  // the visitor's. The browser's clock is pinned to hours that change what a
  // page shows, while the server keeps its own: any part the client re-decides
  // from the clock after the load then moves here, whatever day CI runs.
  for (const [label, at] of CLOCKS) {
    for (const path of CLOCK_PAGES) {
      test(`${path} at ${label}: layout shift over the load stays at or under ${LIMIT}`, async ({ page }) => {
        await page.clock.setFixedTime(new Date(at));
        const target = path === "/producer" ? `/producer/${ids[0]}` : path;
        const r = await loadShift(page, target, returningVisitor(ids));
        expect(r.observed).toBe(true);
        expect(r.seeded).not.toBeNull();
        expect(r.sum).toBeLessThanOrEqual(LIMIT);
      });
    }
  }

  test("business page: layout shift over the load stays at or under the limit", async ({ page }) => {
    const r = await loadShift(page, `/producer/${ids[0]}`, returningVisitor(ids));
    expect(r.observed).toBe(true);
    expect(r.seeded).not.toBeNull();
    expect(r.sum).toBeLessThanOrEqual(LIMIT);
  });
});
