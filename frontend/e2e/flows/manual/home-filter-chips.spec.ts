import { test, expect, type Page } from "@playwright/test";

/**
 * Spec:     manual/home-filter-chips
 * Purpose:  Converted from docs/MANUAL_TESTING.md § "Advanced filter chips —
 *           homepage + /map (task 12)" (MEH-1171 conversion stage). The chip
 *           param-mapping is unit-covered (useHomePageDietChipsUrl.test.jsx,
 *           mapChips.test.js) but the REAL wired flow — click a chip → the
 *           live GET /producers fires with the right query param → the toggle
 *           state flips — was never driven end-to-end.
 * Touches:  GET /producers reads only (observed, NOT mocked — MEH-417: real
 *           backend, no stubs). No writes.
 * Does NOT: assert pixel colors (active/inactive chip styling is asserted via
 *           aria-pressed, the functional equivalent) or the /map legend chips
 *           (map-legend.spec.ts territory). gluten_free/vegan/lactose_free
 *           chips render from CHIPS_CONFIG but are not wired into the homepage
 *           chip state (use-home-page.js:78) — only the 4 live keys are driven.
 * History:  MEH-1171 (creation).
 */

const KOSHER = "כשר";
const ORGANIC = "אורגני";

// Record every GET /api/producers call (axios baseURL "/api"). Match ONLY the
// API call — Next.js also fires RSC route prefetches to the /producers PAGE
// (`/producers?category=N&_rsc=…`) which must not be mistaken for the chip
// fetch. Reads stay real (MEH-417: no mocks); we only OBSERVE the requests.
const trackProducers = (page: Page): string[] => {
  const urls: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/producers(\?|$)/.test(r.url())) urls.push(r.url());
  });
  return urls;
};

// after an action, wait for a NEW /api/producers request beyond `since`, then
// return the params of the most recent one (robust to a late-firing initial
// load being captured instead of the click's request)
const paramsAfter = async (page: Page, urls: string[], since: number, action: () => Promise<void>) => {
  await action();
  await expect.poll(() => urls.length, { timeout: 15_000 }).toBeGreaterThan(since);
  return new URL(urls[urls.length - 1]).searchParams;
};

const gotoHome = async (page: Page) => {
  await page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
  await page.goto("/");
  // the chips live in the producers section; wait for its toolbar to render
  await page.getByRole("toolbar").first().waitFor({ timeout: 20_000 });
  // let the initial GET /api/producers settle so it can't be mistaken for a
  // click's request; the counter renders once producers land
  await page.getByTestId("producers-counter").waitFor({ timeout: 20_000 });
};

const chip = (page: Page, name: string) =>
  page.getByRole("toolbar").getByRole("button", { name, exact: true });

test.describe("homepage filter chips (MEH-1171 § advanced filter chips)", () => {
  // MANUAL_TESTING § Advanced filter chips items 5 + 6 — activate כשר: chip
  // flips to pressed AND the live GET /producers carries kosher=true
  test("activating כשר flips it pressed and fires GET /producers?kosher=true", async ({ page }) => {
    const urls = trackProducers(page);
    await gotoHome(page);
    const kosher = chip(page, KOSHER);
    await expect(kosher).toHaveAttribute("aria-pressed", "false"); // item 4: inactive default

    const params = await paramsAfter(page, urls, urls.length, () => kosher.click());
    expect(params.get("kosher")).toBe("true"); // item 6 network assertion
    await expect(kosher).toHaveAttribute("aria-pressed", "true"); // item 5: active
  });

  // MANUAL_TESTING § Advanced filter chips item 7 — deactivate: chip flips
  // back to unpressed and the refetch drops the kosher param
  test("clicking כשר again unpresses it and refetches without the kosher param", async ({ page }) => {
    const urls = trackProducers(page);
    await gotoHome(page);
    const kosher = chip(page, KOSHER);
    await paramsAfter(page, urls, urls.length, () => kosher.click());
    await expect(kosher).toHaveAttribute("aria-pressed", "true");

    const params = await paramsAfter(page, urls, urls.length, () => kosher.click());
    expect(params.has("kosher")).toBe(false);
    await expect(kosher).toHaveAttribute("aria-pressed", "false");
  });

  // MANUAL_TESTING § Advanced filter chips items 8 + 9 — multi-select:
  // כשר + אורגני both active → GET /producers?kosher=true&organic=true (AND)
  test("multi-select כשר + אורגני sends both params in one request", async ({ page }) => {
    const urls = trackProducers(page);
    await gotoHome(page);
    await paramsAfter(page, urls, urls.length, () => chip(page, KOSHER).click());
    // ensure the kosher toggle has committed to state before the second click,
    // else the organic handler reads stale chips and omits kosher (React batch)
    await expect(chip(page, KOSHER)).toHaveAttribute("aria-pressed", "true");

    const params = await paramsAfter(page, urls, urls.length, () => chip(page, ORGANIC).click());
    expect(params.get("kosher")).toBe("true");
    expect(params.get("organic")).toBe("true");
    await expect(chip(page, KOSHER)).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page, ORGANIC)).toHaveAttribute("aria-pressed", "true");
  });

  // MANUAL_TESTING § Advanced filter chips item 3 — the chip row is a single
  // horizontally-scrollable track (no wrap): the toolbar owns overflow-x-auto
  test("the chip row is a horizontally scrollable track, not wrapped", async ({ page }) => {
    await gotoHome(page);
    const toolbar = page.getByRole("toolbar").first();
    await expect(toolbar).toHaveClass(/overflow-x-auto/);
    // no-wrap → scrollWidth can exceed clientWidth without the row growing tall
    const wraps = await toolbar.evaluate((el) => {
      const cs = getComputedStyle(el);
      return cs.flexWrap === "wrap";
    });
    expect(wraps).toBe(false);
  });
});
