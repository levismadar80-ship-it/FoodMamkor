import { test, type Browser, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// TEMPORARY QA harness (never merged): captures 375/1440 evidence for the
// MEH-2294 / MEH-1430 / MEH-1207 / MEH-1685 PRs from a session without npm.
// Runs only under --update-snapshots (vrt-update.yml dispatch) on the desktop
// project, and writes PNG/JSON into a *-snapshots dir so that workflow's
// commit step carries them back to the branch.
const OUT = path.join(__dirname, "qa-capture.spec.ts-snapshots");
const he = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "messages", "he.json"), "utf-8"));
const LOC = { lat: 32.0853, lng: 34.7818 }; // Tel Aviv

test.beforeEach(({}, testInfo) => {
  const mode = testInfo.config.updateSnapshots;
  test.skip(testInfo.project.name !== "desktop" || (mode !== "all" && mode !== "changed"), "QA capture only under --update-snapshots");
  fs.mkdirSync(OUT, { recursive: true });
});

async function ctx(browser: Browser, baseURL: string, width: number, opts: { loc?: boolean } = {}) {
  const mobile = width < 768;
  const context = await browser.newContext({
    baseURL,
    viewport: { width, height: mobile ? 812 : 900 },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1,
    locale: "he-IL",
  });
  // Skip first-visit chrome (cookie banner etc.) only through real storage keys the app already reads.
  if (opts.loc) {
    await context.addInitScript((l) => {
      window.localStorage.setItem("user_location", JSON.stringify(l));
    }, LOC);
  }
  return context;
}

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, d = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * d) / 2) ** 2 +
    Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(((b.lng - a.lng) * d) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

for (const width of [375, 1440]) {
  test(`qa-capture MEH-2294 producers distance sort @${width}`, async ({ browser }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string;
    // 1) no location fix
    let c = await ctx(browser, baseURL, width);
    let page = await c.newPage();
    await page.goto("/he/producers");
    await page.getByTestId("producers-grid").waitFor();
    await shot(page, `MEH-2294-${width}-1-no-location`);
    await c.close();
    // 2) with a fix: control present, distance enabled; pick it
    c = await ctx(browser, baseURL, width, { loc: true });
    page = await c.newPage();
    const seen: string[] = [];
    await page.route(/\/api\/producers\?/, async (route) => {
      const u = new URL(route.request().url());
      if (u.searchParams.get("sort") !== "distance") return route.continue();
      seen.push(u.search);
      // staging backend predates sort=distance: serve the same page ordered
      // by Haversine from the unsorted list (stand-in, documented in the PR).
      u.searchParams.delete("sort"); u.searchParams.delete("lat"); u.searchParams.delete("lng");
      u.searchParams.set("limit", "100"); u.searchParams.set("offset", "0");
      const res = await route.fetch({ url: u.toString() });
      const rows = (await res.json()) as Array<{ lat?: number; lng?: number }>;
      rows.sort((p, q) => (p.lat == null ? 1e9 : haversine(LOC, p as never)) - (q.lat == null ? 1e9 : haversine(LOC, q as never)));
      await route.fulfill({ status: 200, headers: res.headers(), body: JSON.stringify(rows.slice(0, 24)) });
    });
    await page.goto("/he/producers");
    await page.getByTestId("producers-grid").waitFor();
    const sort = page.getByTestId("producers-sort");
    await sort.waitFor();
    await shot(page, `MEH-2294-${width}-2-with-location`);
    await sort.selectOption("distance");
    await page.waitForURL(/sort=distance/);
    await page.waitForTimeout(1200);
    await shot(page, `MEH-2294-${width}-3-distance-selected`);
    fs.writeFileSync(path.join(OUT, `MEH-2294-${width}-requests.json`), JSON.stringify({ url: page.url(), distanceRequests: seen }, null, 2));
    await c.close();
  });

  test(`qa-capture MEH-1430 location modal @${width}`, async ({ browser }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string;
    // /map: the modal auto-opens ~800ms after mount when no city is saved.
    let c = await ctx(browser, baseURL, width);
    let page = await c.newPage();
    await page.goto("/he/map");
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 15000 });
    await shot(page, `MEH-1430-${width}-1-map-open`);
    // Phase 0 hit-test (card addendum): what receives a tap at the GPS button's centre while the modal is open?
    const gps = page.locator('[aria-label="מרכזו את המפה על המיקום שלי"]:visible, [aria-label="הצגת בתי עסק קרובים למיקום שלי"]:visible').first();
    let hit: unknown = "gps button not found";
    if (await gps.count()) {
      const box = await gps.boundingBox();
      if (box) {
        hit = await page.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          const dlgOverlay = el?.closest(".fixed.inset-0");
          return { x, y, tag: el?.tagName, aria: el?.getAttribute("aria-label"), cls: el?.getAttribute("class")?.slice(0, 120), insideModalOverlay: !!dlgOverlay };
        }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
      }
    }
    fs.writeFileSync(path.join(OUT, `MEH-1430-${width}-gps-hit-test.json`), JSON.stringify(hit, null, 2));
    // geo-denied path: no geolocation permission granted in this context.
    await dialog.getByRole("button", { name: he.modals.location.geo_button }).click();
    await page.getByRole("alert").waitFor({ timeout: 15000 }).catch(() => {});
    await shot(page, `MEH-1430-${width}-2-map-geo-denied`);
    await c.close();
    // homepage banner path
    c = await ctx(browser, baseURL, width);
    page = await c.newPage();
    await page.goto("/he");
    const choose = page.getByRole("button", { name: he.location.banner.choose_city });
    await choose.waitFor({ timeout: 15000 });
    await choose.click();
    await page.getByRole("dialog").waitFor();
    await shot(page, `MEH-1430-${width}-3-home-open`);
    await page.getByRole("dialog").getByRole("button", { name: he.modals.location.geo_button }).click();
    await page.getByRole("alert").waitFor({ timeout: 15000 }).catch(() => {});
    await shot(page, `MEH-1430-${width}-4-home-geo-denied`);
    await c.close();
  });

  test(`qa-capture MEH-1207 producer anchor nav @${width}`, async ({ browser }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string;
    const c = await ctx(browser, baseURL, width);
    const page = await c.newPage();
    const list = await (await page.request.get(`${baseURL}/api/producers?limit=24`)).json();
    // prefer a business with products so the products pill shows
    const pick = list.find((p: { products_count?: number }) => (p.products_count ?? 0) > 0) ?? list[0];
    await page.goto(`/he/producer/${pick.id}`);
    await page.locator("h1").first().waitFor();
    await shot(page, `MEH-1207-${width}-1-top`);
    await page.mouse.wheel(0, 1400);
    await shot(page, `MEH-1207-${width}-2-mid-scroll`);
    const pills = page.getByTestId("section-anchor-nav").locator("a");
    const n = await pills.count();
    const info: Record<string, unknown> = { producer: pick.id, pills: n };
    if (n > 1 && (await pills.nth(1).isVisible())) {
      info.tapped = await pills.nth(1).getAttribute("href");
      await pills.nth(1).click();
      await page.waitForTimeout(900);
      info.activePill = await page.locator('[data-testid="section-anchor-nav"] [aria-current="true"]').getAttribute("href").catch(() => null);
      await shot(page, `MEH-1207-${width}-3-pill-tapped`);
    }
    fs.writeFileSync(path.join(OUT, `MEH-1207-${width}-info.json`), JSON.stringify(info, null, 2));
    await c.close();
  });

  test(`qa-capture MEH-1685 autocomplete @${width}`, async ({ browser }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string;
    const c = await ctx(browser, baseURL, width);
    const page = await c.newPage();
    const list = await (await page.request.get(`${baseURL}/api/producers?limit=5`)).json();
    const term = String(list[0]?.name ?? "דבש").slice(0, 2);
    await page.goto("/he");
    const input = page.getByTestId("hero-search").first();
    await input.waitFor();
    await input.click();
    await input.pressSequentially(term, { delay: 80 });
    await page.getByTestId("hero-search-dropdown").waitFor({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await shot(page, `MEH-1685-${width}-dropdown`);
    fs.writeFileSync(path.join(OUT, `MEH-1685-${width}-info.json`), JSON.stringify({ term }, null, 2));
    await c.close();
  });
}
