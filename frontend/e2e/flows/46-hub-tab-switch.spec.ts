import { test, expect } from "./_cloudinary-stub";
import type { Page } from "@playwright/test";

// MEH-2980: «אירועים» ↔ «חוויות» is one screen with two URLs. The switch used
// to router.push between two force-dynamic routes, so app/[locale]/loading.js
// replaced the WHOLE page (hero + tabs + list) for a beat, the hub remounted,
// and the list was fetched twice — the flash in Sapir's 12/11 screen
// recording. The switch now rewrites the URL in place (history.pushState).
//
// What this pins, without any wall-clock budget (testing.md, MEH-2972):
//   1. the hub DOM survives the switch — a marker set on the tab row before
//      the click is still there after it (a remount drops it);
//   2. the route-level loader never paints in any animation frame sampled
//      across the switch;
//   3. exactly one list request per switch;
//   4. the URL and the selected tab follow the switch, and Back restores both.

const HUB = '[data-testid="listing-hub-tabs"]';
const FRAMES = 90; // ~1.5 s at 60 fps — counted in frames, not milliseconds

async function startSampler(page) {
  await page.evaluate((frames) => {
    const w = window as unknown as { __hubSamples: Array<{ loader: boolean; hub: boolean }>; __hubDone: boolean };
    w.__hubSamples = [];
    w.__hubDone = false;
    let n = 0;
    const tick = () => {
      w.__hubSamples.push({
        loader: !!document.querySelector('[data-testid="route-loading"]'),
        // A hidden copy (see liveHub) must not count as "the row is on screen".
        hub: [...document.querySelectorAll('[data-testid="listing-hub-tabs"]')].some((el) =>
          (el as HTMLElement).checkVisibility()
        ),
      });
      n += 1;
      if (n < frames) requestAnimationFrame(tick);
      else w.__hubDone = true;
    };
    requestAnimationFrame(tick);
  }, FRAMES);
}

async function readSamples(page) {
  await page.waitForFunction(() => (window as unknown as { __hubDone: boolean }).__hubDone === true);
  return page.evaluate(() => (window as unknown as { __hubSamples: Array<{ loader: boolean; hub: boolean }> }).__hubSamples);
}

// The DOM can hold a second, HIDDEN hub row next to the live one (CI runs
// 43283502922 and 43286869935: strict mode found 2 elements, one "hidden",
// and the hidden one could appear after the count had already read 1). The
// user only ever sees one, so every locator and the marker address the
// visible row; nothing here asserts how many hidden copies exist.
const liveHub = (page: Page) => page.locator(HUB).filter({ visible: true });

async function openHub(page: Page, path: string) {
  await page.goto(path);
  const hub = liveHub(page);
  await expect(hub).toHaveCount(1, { timeout: 15_000 });
  return hub;
}

for (const locale of ["he", "en"] as const) {
  const prefix = locale === "en" ? "/en" : "";

  test(`${locale}: events ↔ experiences switches in place — no loader, no remount, one fetch`, async ({ page }) => {
    const hub = await openHub(page, `${prefix}/experiences`);
    await expect(hub.locator('[data-tab-value="experiences"]')).toHaveAttribute("aria-selected", "true");
    // Let the first list load settle before counting.
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });

    // Marker on the live node: survives only if the hub is NOT remounted.
    await page.evaluate((sel) => {
      const live = [...document.querySelectorAll(sel)].find((el) => (el as HTMLElement).checkVisibility());
      (live as HTMLElement).dataset.meh2980 = "kept";
    }, HUB);

    const listCalls: string[] = [];
    page.on("request", (req) => {
      const path = new URL(req.url()).pathname;
      if (/\/api\/events\/?$/.test(path) || /\/api\/experiences\/?$/.test(path)) listCalls.push(path);
    });

    await startSampler(page);
    await hub.locator('[data-tab-value="events"]').click();
    const samples = await readSamples(page);

    await expect(page).toHaveURL(new RegExp(`${prefix}/events$`));
    await expect(hub.locator('[data-tab-value="events"]')).toHaveAttribute("aria-selected", "true");
    expect(samples.length).toBe(FRAMES);
    expect(samples.filter((s) => s.loader), "route loader painted during the switch").toEqual([]);
    expect(samples.filter((s) => !s.hub), "tab row vanished during the switch").toEqual([]);
    await expect(page.locator(`${HUB}[data-meh2980="kept"]`).filter({ visible: true }), "hub remounted on switch").toHaveCount(1);
    await expect.poll(() => listCalls.length).toBe(1);
    expect(listCalls[0]).toMatch(/\/events\/?$/);
    const eventsTitle = await page.title();
    expect(eventsTitle).not.toBe("");

    // Back returns to the experiences tab, still in place.
    await startSampler(page);
    await page.goBack();
    const back = await readSamples(page);
    await expect(page).toHaveURL(new RegExp(`${prefix}/experiences$`));
    await expect(hub.locator('[data-tab-value="experiences"]')).toHaveAttribute("aria-selected", "true");
    expect(back.filter((s) => s.loader), "route loader painted on Back").toEqual([]);
    await expect(page.locator(`${HUB}[data-meh2980="kept"]`).filter({ visible: true }), "hub remounted on Back").toHaveCount(1);
    // One more list request for the Back — read after the 90-frame window, so
    // a late duplicate would already be in the array.
    expect(listCalls.length, "list fetched more than once on Back").toBe(2);
    expect(listCalls[1]).toMatch(/\/experiences\/?$/);
    // The title follows the tab both ways.
    await expect.poll(() => page.title()).not.toBe(eventsTitle);
  });

  test(`${locale}: Back restores the filters the URL carries`, async ({ page }) => {
    const city = "חיפה";
    const hub = await openHub(page, `${prefix}/events?city=${encodeURIComponent(city)}`);
    await expect(page.locator("#events-city")).toHaveValue(city);

    await hub.locator('[data-tab-value="experiences"]').click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/experiences$`));
    // (No input check here: a tab with no rows and no filter hides its filter
    // bar, so the address bar is the witness that the reset happened.)
    expect(new URL(page.url()).search).toBe("");

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${prefix}/events\\?city=`));
    await expect(hub.locator('[data-tab-value="events"]')).toHaveAttribute("aria-selected", "true");
    // The address bar and the list agree: the city filter is back in state.
    await expect(page.locator("#events-city")).toHaveValue(city);
  });

  test(`${locale}: leaving the hub and coming Back lands on the tab the URL names`, async ({ page }) => {
    // Start on /experiences, switch in place to /events, leave through a real
    // router navigation, then Back. Next restores that history entry with the
    // tree it was pushed with (the /experiences page), so the tab must come
    // from the path, not from the mounted route's initialTab.
    const hub = await openHub(page, `${prefix}/experiences`);
    await hub.locator('[data-tab-value="events"]').click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/events$`));

    await page.locator(`a[href="${prefix || "/"}"]`).first().click();
    await expect(page).not.toHaveURL(/\/events$/);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${prefix}/events$`));
    await expect(liveHub(page).locator('[data-tab-value="events"]')).toHaveAttribute("aria-selected", "true", {
      timeout: 15_000,
    });
  });
}

// MEH-2984 pinned that a hub tab of the OTHER group (/group-buys → «אירועים»)
// arrived without the route-level loader: the tab row's Link prefetched the
// ISR route. MEH-3125 split the hub into two nav entries, so /group-buys no
// longer has an events tab and that path is gone. The way across is now the
// «אירועים» nav link, which — like every site-chrome Link — carries
// prefetch={false} on purpose (MEH-2850, +137 KB per page otherwise), so a
// no-loader assertion would test a prefetch that is switched off. What this
// pins instead is the split itself: the link leaves the opportunities group
// and lands in the events group, whose tab row shows events tabs only.
const EVENTS_GROUP = /\/(events|experiences)$/;
for (const locale of ["he", "en"] as const) {
  const prefix = locale === "en" ? "/en" : "";
  test(`${locale}: /group-buys → «אירועים» nav link lands in the events group`, async ({ page }) => {
    const hubFrom = await openHub(page, `${prefix}/group-buys`);
    // The row is drawn and holds its own tab, so the count below is not 0
    // merely because nothing rendered yet.
    await expect(hubFrom.locator('[data-tab-value="groupBuys"]')).toHaveAttribute("aria-selected", "true");
    await expect(hubFrom.locator('[data-tab-value="events"], [data-tab-value="experiences"]')).toHaveCount(0);
    const link = page
      // Header on desktop, the pill on mobile (the header copy is hidden
      // there); the first visible link into the events group either way.
      .locator(`a[href="${prefix}/events"], a[href="${prefix}/experiences"]`)
      .filter({ visible: true })
      .first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.click();

    await expect(page).toHaveURL(EVENTS_GROUP);
    const hub = liveHub(page);
    await expect(hub).toHaveCount(1, { timeout: 15_000 });
    await expect(hub.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    await expect(hub.locator('[data-tab-value="groupBuys"], [data-tab-value="rescue"]')).toHaveCount(0);
    await expect(page.locator("h1")).toBeVisible();
  });
}
