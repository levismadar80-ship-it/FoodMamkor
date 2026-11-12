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
        hub: !!document.querySelector('[data-testid="listing-hub-tabs"]'),
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

// A streamed page briefly holds TWO hub rows: React parks the resolved segment
// in a hidden node before it swaps it in (seen on CI, run 43283502922: strict
// mode found 2 elements, one "hidden"). Wait for the swap to finish so every
// locator and the marker below address the one live row.
async function openHub(page: Page, path: string) {
  await page.goto(path);
  const hub = page.locator(HUB);
  await expect(hub).toHaveCount(1, { timeout: 15_000 });
  await expect(hub).toBeVisible();
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
      (document.querySelector(sel) as HTMLElement).dataset.meh2980 = "kept";
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
    await expect(page.locator(`${HUB}[data-meh2980="kept"]`), "hub remounted on switch").toHaveCount(1);
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
    await expect(page.locator(`${HUB}[data-meh2980="kept"]`), "hub remounted on Back").toHaveCount(1);
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
    await expect(page.locator(HUB).locator('[data-tab-value="events"]')).toHaveAttribute("aria-selected", "true", {
      timeout: 15_000,
    });
  });
}
