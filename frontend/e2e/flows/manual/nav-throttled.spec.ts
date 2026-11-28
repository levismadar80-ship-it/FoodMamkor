import { test, expect, type Page } from "../_cloudinary-stub";
import { layoutSettled } from "../_layout-settled";

/**
 * MEH-3810 — every list, on a slow phone: scroll, open a card, come back.
 *
 * CI's network is fast, so the route loader (app/[locale]/loading.js) is on
 * screen for a frame or two and nothing that goes wrong around it is seen.
 * MEH-3800 was that: after scrolling a list, opening a card showed the footer
 * for up to 19 frames, because the loader painted at the old scroll offset.
 * This spec makes the loader stay up (Chromium CDP: slow 4G + CPU x4) and pins:
 *
 *   (a) in no sampled frame, between the click and the detail page, is the
 *       route loader on screen while the footer is in the viewport;
 *   (b) Back returns to the scroll offset the reader left (±100 px);
 *   (c) MEH-3983: in no sampled frame is the SITE-WIDE loader
 *       (data-testid route-loading) on screen. Its brand mark fades in only
 *       after 0.4 s, so it read as a blank cream flash between a list and the
 *       detail page (prod 28/11: 0.3–0.8 s from home to a business). Each
 *       detail page now has its own page-shaped loading.js, which carries
 *       `data-route-loader` like the site-wide one — so (a) and its control
 *       count either loader, and (c) fails if the blank one comes back.
 *
 * Counted in animation frames, never milliseconds (testing.md, MEH-2972).
 * Control (`expectThrottled`): the detail route's own prefetch waited at
 * least 300 ms for its first byte, so the throttle took effect on the fetches
 * the click depends on. It used to be "the loader painted at least once"; that
 * went red on home and /events in CI once the page was fully prefetched and
 * opened with no loader at all, which is the good outcome, not a broken
 * instrument (MEH-3983).
 *
 * One test per list, so a slow list fails alone, on its own timeout, and
 * does not hide the lists after it. Runs on the mobile project only: MEH-3800
 * was a phone report, and the footer reaching the viewport depends on the
 * phone's short screen; desktop would double a long spec for no new case.
 *
 * The premise "group buys and experiences lose their place on Back" (sweep of
 * 24/11) was an artifact: the sweep's click scrolled the card into view first.
 * Re-measured on staging 24/11 with the card already in view: both restore.
 */

/**
 * `loader`: whether the route loader appears between this list and its
 * detail page, once Next has prefetched that page (the spec waits for the
 * prefetch before the click, see `waitForPrefetch`). Without that wait it was
 * a race, not a property of the list: /experiences painted 0 frames on a click
 * made at once and 21–26 frames on a click made 8 s later, 3/3 each, local
 * production build, mobile, throttled (MEH-3877, 26/11; the 25/11 "never"
 * reading was the fast click). With the wait it may paint on home, /events,
 * /experiences and /producers ("may": 0 frames is fine there, and (a) and (c)
 * hold whatever it paints), and never on /group-buys, where the list stays on
 * screen until the detail page is ready; a loader that starts to paint there
 * turns the row red, and it moves to "may".
 *
 * `cards`: group buys carry a card testid. Event and experience rows
 * (EventEntryRow) carry none, so those two are scoped to `main` and the
 * detail-path prefix; a non-card link under that prefix would also open a
 * detail page, which is what the case needs.
 */
type List = { name: string; path: string; cards: string; loader: "may" | "never"; grows?: boolean };

const LISTS: List[] = [
  { name: "home", path: "/", cards: '[data-testid="producer-card"] a[href]:not([href^="http"])', loader: "may" },
  // `grows`: infinite scroll — the scroll to the last card loads the next page.
  { name: "all businesses", path: "/producers", cards: '[data-testid="producer-card"] a[href]:not([href^="http"])', loader: "may", grows: true },
  { name: "events", path: "/events", cards: 'main a[href^="/events/"]', loader: "may" },
  { name: "experiences", path: "/experiences", cards: 'main a[href^="/experiences/"]', loader: "may" },
  { name: "group buys", path: "/group-buys", cards: 'a[data-testid="group-buy-card"]', loader: "never" },
];

const RESTORE_TOLERANCE_PX = 100;
const SAMPLE_CAP_FRAMES = 1800; // a stop for the sampler only; nothing is timed by it

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

/** Per animation frame: is a route loader mounted (site-wide or a page's own,
 *  both carry data-route-loader), is it the site-wide blank one, is the footer
 *  in the viewport. */
async function startSampler(page: Page) {
  await page.evaluate((cap) => {
    const w = window as unknown as { __nav: Array<{ loader: boolean; blank: boolean; footer: boolean }> };
    w.__nav = [];
    const tick = () => {
      const footer = document.querySelector("footer[data-site-footer]");
      const r = footer?.getBoundingClientRect();
      w.__nav.push({
        loader: !!document.querySelector("[data-route-loader]"),
        blank: !!document.querySelector('[data-testid="route-loading"]'),
        footer: !!r && r.top < innerHeight && r.bottom > 0,
      });
      if (w.__nav.length < cap) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, SAMPLE_CAP_FRAMES);
}

type Sample = { loader: boolean; blank: boolean; footer: boolean };

async function readSamples(page: Page): Promise<Sample[]> {
  return page.evaluate(() => (window as unknown as { __nav: Sample[] }).__nav);
}

/** Frames in which the loader was on screen. */
const loaderFrames = (samples: Sample[]) => samples.filter((s) => s.loader).length;
/** Frames in which the site-wide (blank-looking) loader was on screen (MEH-3983). */
const blankFrames = (samples: Sample[]) => samples.filter((s) => s.blank).length;
/** Frames in which the loader was on screen with the footer in the viewport. */
const flashFrames = (samples: Sample[]) => samples.filter((s) => s.loader && s.footer).length;

/** CDP latency is 400 ms, so a throttled fetch waits at least this long for
 *  its first byte. */
const THROTTLED_TTFB_MS = 300;

/** Control for every check below: the throttle took effect on the very
 *  fetches the click depends on, so the loader had the time to paint that a
 *  slow phone gives it. Counting loader frames cannot be the control: once the
 *  detail route is prefetched, a list may legitimately open it with no loader
 *  at all (CI run 46083059311: home and /events painted 0 frames on both tries). */
function expectThrottled(list: List, log: RscLog, href: string) {
  const want = new URL(href, "http://x").pathname;
  const waits = [...log.waitMs].filter(([p]) => p === want || p.endsWith(want)).map(([, ms]) => ms);
  const slowest = Math.max(-1, ...waits);
  expect(slowest, `${list.name}: the prefetch of ${want} got its first byte after ${slowest} ms — the throttle did not take effect, so every check here would be vacuous`).toBeGreaterThanOrEqual(THROTTLED_TTFB_MS);
}

/** On a "never" list the loader must not paint (see LISTS `loader`). */
function expectNoLoaderWhereNever(list: List, painted: number) {
  if (list.loader !== "never") return;
  expect(painted, `${list.name}: the route loader painted for ${painted} frames on a list measured as "never" — move it to "may" in LISTS`).toBe(0);
}

/** Next router RSC fetches, per pathname (MEH-3983). Next 16's segment cache
 *  prefetches a route in steps: first the route tree (`next-router-segment-
 *  prefetch: /_tree`), then the segments or, for a dynamic route, one request
 *  up to its loading boundary (`next-router-prefetch: 1`); a fully prefetched
 *  route carries no prefetch header at all
 *  (node_modules/next/dist/client/components/segment-cache/cache.js). Waiting
 *  for the first finished prefetch was waiting for the tree only: a click made
 *  then had no page loading.js yet and showed the site-wide loader (CI run
 *  46083059311, shard 4: 15–22 blank frames, not reproduced locally). */
type RscLog = { pending: Map<string, number>; tree: Set<string>; body: Set<string>; waitMs: Map<string, number> };

function recordPrefetches(page: Page): RscLog {
  const log: RscLog = { pending: new Map(), tree: new Set(), body: new Set(), waitMs: new Map() };
  const path = (url: string) => new URL(url).pathname;
  const isRsc = (h: Record<string, string>) => h["rsc"] === "1";
  const bump = (p: string, by: number) => log.pending.set(p, (log.pending.get(p) ?? 0) + by);
  page.on("request", (req) => {
    if (isRsc(req.headers())) bump(path(req.url()), 1);
  });
  const settle = (req: import("@playwright/test").Request, ok: boolean) => {
    const h = req.headers();
    if (!isRsc(h)) return;
    const p = path(req.url());
    bump(p, -1);
    if (!ok) return;
    // Time to first byte, for the throttle control (`expectThrottled`).
    const ttfb = req.timing().responseStart;
    if (ttfb > (log.waitMs.get(p) ?? -1)) log.waitMs.set(p, ttfb);
    if (h["next-router-segment-prefetch"] === "/_tree") log.tree.add(p);
    else log.body.add(p);
  };
  page.on("requestfinished", (req) => settle(req, true));
  page.on("requestfailed", (req) => settle(req, false));
  return log;
}

/** Wait until the card's detail route is prefetched past its route tree: a
 *  request beyond the tree has finished and none is in flight, on two polls
 *  in a row (the segment requests start only after the tree is read).
 *  `href` is locale-less and may carry a query (home: `?from=home`); the
 *  fetch URL carries the locale and `_rsc`, so only the path is compared. */
async function waitForPrefetch(page: Page, log: RscLog, list: List, href: string | null) {
  expect(href, `${list.name}: the card has no href`).toBeTruthy();
  const want = new URL(href as string, page.url()).pathname;
  const match = (p: string) => p === want || p.endsWith(want);
  let readyBefore = false;
  await expect
    .poll(
      () => {
        const body = [...log.body].some(match);
        const inFlight = [...log.pending].some(([p, n]) => match(p) && n > 0);
        const ready = body && !inFlight;
        const stable = ready && readyBefore;
        readyBefore = ready;
        return stable;
      },
      {
        message: `${list.name}: Next never finished prefetching ${want} past its route tree, so the click cannot be made at the moment the loader would show`,
        timeout: 60_000,
      },
    )
    .toBe(true);
}

/** The click has left `fromUrl` and every route loader is gone. */
async function detailLoaded(page: Page, fromUrl: string): Promise<boolean> {
  const left = page.url() !== fromUrl;
  const loaders = await page.locator("[data-route-loader]").count();
  return left && loaders === 0;
}

/** On a `grows` list, wait until the scroll has appended the next page, so
 *  the card opened is one Back must bring back (MEH-3810). A list that stops
 *  growing fails here instead of passing on its first page. */
async function waitForNextPage(list: List, cards: import("@playwright/test").Locator, firstPage: number) {
  if (!list.grows) return;
  await expect
    .poll(() => cards.count(), { message: `${list.name}: scrolling to the last card loaded no next page`, timeout: 60_000 })
    .toBeGreaterThan(firstPage);
}

/** Scroll an element to the middle of the screen. */
async function scrollToMiddle(el: import("@playwright/test").Locator) {
  await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    scrollTo(0, Math.max(0, scrollY + r.top - innerHeight / 2));
  });
}

/** Distance between the current scroll offset and `before`. */
async function offsetFrom(page: Page, before: number): Promise<number> {
  return Math.abs((await page.evaluate(() => scrollY)) - before);
}

test.describe("navigation on a slow phone (MEH-3810)", () => {
  // MEH-3809: the load guard is off here. This spec counts frames on a CPU
  // throttled 4x, and the guard's probe (an init script and a binding call per
  // shift) adds work to every frame it counts. (The 18 loader frames on
  // /experiences once blamed on the guard were the prefetch race above: they
  // came back with the guard off, MEH-3877.)
  // It also scrolls to the end on purpose so /producers loads the next page,
  // which moves the footer (MEH-3874). The other flows specs keep the guard
  // on every page this one opens.
  test.use({ loadGuard: "off" });
  for (const list of LISTS) {
    test(`${list.name}: scroll → open a card → back`, async ({ page, browserName }, testInfo) => {
      // eslint-disable-next-line playwright/no-skipped-test -- gated on the browser engine, which the product cannot move: CDP throttling is Chromium-only
      test.skip(browserName !== "chromium", "CDP network and CPU throttling exist only in Chromium");
      // eslint-disable-next-line playwright/no-skipped-test -- gated on the Playwright project, which the product cannot move: the case is the phone's (see header)
      test.skip(testInfo.project.name !== "mobile", "a phone case; the desktop project would only double the run");
      // A ceiling, not a budget: each wait below has its own 60 s or 30 s bound,
      // and a run that reaches this one is already failing.
      test.setTimeout(180_000);
      await throttle(page);
      const prefetched = recordPrefetches(page);

      await page.goto(list.path);
      const cards = page.locator(list.cards);
      await expect(cards.first(), `${list.name}: no card on ${list.path} — the seeded list is empty`).toBeVisible({
        timeout: 60_000,
      });

      // The last card, scrolled to the middle of the screen: the deepest
      // place the reader can open something from on this list. On an
      // infinite-scroll list (/producers) that scroll loads the next page, so
      // the card is chosen again once the layout settles: a card from the
      // loaded page is the case Back used to lose (MEH-3810: 64 links before,
      // 48 after, 4515 px for a reader who left at 5160, staging 25/11).
      const firstPage = await cards.count();
      await scrollToMiddle(cards.last());
      await waitForNextPage(list, cards, firstPage);
      await layoutSettled(cards.last());
      // Pinned by index: a page landing after this line must not change which
      // card `before` is read for and which is clicked.
      const card = cards.nth((await cards.count()) - 1);
      await card.evaluate((el) => {
        const r = el.getBoundingClientRect();
        scrollTo(0, Math.max(0, scrollY + r.top - innerHeight / 2));
      });
      // A card taller than the lower half of the screen sticks out below
      // it, and Playwright's click would scroll it in first, so the place
      // the reader leaves from is not the place `before` read (group buys
      // on a phone: 11 px read, 241 px left from, 24/11). Let Playwright
      // make its move now, before the offset is read.
      await card.scrollIntoViewIfNeeded();
      await layoutSettled(card);
      const before = await page.evaluate(() => scrollY);
      const fromUrl = page.url();
      // The loader can paint only if Next's viewport prefetch of this card's
      // detail route finished before the click; a click that beats the
      // prefetch keeps the list on screen until the page is ready, with no
      // loader at all (MEH-3877: measured 3/3 each way on /experiences). So the
      // click waits for that prefetch: a reader whose card sat on screen a
      // moment, the case MEH-3800 was, and one the control can count on.
      const href = await card.getAttribute("href");
      await waitForPrefetch(page, prefetched, list, href);
      expectThrottled(list, prefetched, href as string);

      await startSampler(page);
      await card.click();
      await expect
        .poll(() => detailLoaded(page, fromUrl), {
          message: `${list.name}: the detail page never finished loading`,
          timeout: 60_000,
        })
        .toBe(true);
      const samples = await readSamples(page);
      expectNoLoaderWhereNever(list, loaderFrames(samples));
      const flash = flashFrames(samples);
      expect(flash, `${list.name}: footer in view under the route loader for ${flash} of ${samples.length} frames`).toBe(0);
      // (c) Any loader that painted was the detail page's own frame, not the
      // blank site-wide one (MEH-3983).
      const blank = blankFrames(samples);
      expect(blank, `${list.name}: the site-wide blank loader was on screen for ${blank} of ${samples.length} frames — the detail page lost its own loading.js`).toBe(0);

      await page.goBack();
      await expect(cards.last()).toBeVisible({ timeout: 60_000 });
      // Unconditional: a list too short to scroll has before ≈ 0 and must
      // come back to ≈ 0, which is still a real check (MEH-3520 ratchet).
      await expect
        .poll(() => offsetFrom(page, before), {
          message: `${list.name}: Back did not return to ${before}px (±${RESTORE_TOLERANCE_PX})`,
          timeout: 30_000,
        })
        .toBeLessThanOrEqual(RESTORE_TOLERANCE_PX);
    });
  }
});
