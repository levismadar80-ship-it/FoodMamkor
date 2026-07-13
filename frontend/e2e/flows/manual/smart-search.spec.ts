import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Spec:     manual/smart-search
 * Purpose:  Converted from docs/MANUAL_TESTING.md § "Smart Search — HeroSearch
 *           + /producers?q= (MEH-99)" (MEH-1171 conversion stage). The existing
 *           02-search-producer.spec.ts covers only the basic submit→/producers
 *           navigation; this closes the untested Smart Search behaviour: the
 *           recent/trending dropdowns, the ≥2-char debounce guard, grouped
 *           autocomplete, keyboard nav, recent-search persistence, and the
 *           /producers?q= results + empty states.
 * Touches:  GET /search, GET /search/trending, GET /producers?q= — reads only
 *           (real backend, MEH-417). ONE exception: /search/trending is a
 *           server-side aggregate of search history (empty on a fresh DB, non-
 *           deterministic in general) — its CONTENT is route-mocked for the
 *           trending-wiring test only, so the dropdown-render assertion is
 *           deterministic. Everything else observes the real backend.
 * Does NOT: re-test the basic submit nav (02-search-producer's territory) or
 *           the bold-highlight segmentation (highlight.test.jsx unit-covers it).
 * History:  MEH-1171 (creation).
 */

const RECENT_KEY = "mehamakor_recent_searches";

const seedRecent = (page: Page, queries: string[]) =>
  page.addInitScript(
    ([key, qs]) => {
      localStorage.setItem("cookieConsent", "essential");
      localStorage.setItem(key as string, JSON.stringify(qs));
    },
    [RECENT_KEY, queries] as const,
  );

// the homepage renders TWO hero-search inputs (responsive desktop + mobile
// wrappers, one visible per breakpoint) — always scope to the visible one
const heroInput = (page: Page) => page.getByTestId("hero-search").locator("visible=true");

const gotoHome = async (page: Page) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await expect(heroInput(page)).toBeVisible({ timeout: 20_000 });
};

test.describe("Smart Search — HeroSearch (MEH-1171 § smart search)", () => {
  // MANUAL_TESTING § Smart Search item 1 — focus with recent searches present
  // → "חיפושים אחרונים" dropdown; clicking one routes to /producers?q=
  test("focusing with recent searches shows the history dropdown and a click searches it", async ({ page }) => {
    await seedRecent(page, ["גבינה", "לחם"]);
    await gotoHome(page);
    await heroInput(page).click();

    const history = page.getByTestId("hero-search-history");
    await expect(history).toBeVisible();
    await expect(history.getByText("חיפושים אחרונים")).toBeVisible();
    await expect(history.getByRole("option", { name: /גבינה/ })).toBeVisible();

    await history.getByRole("option", { name: /גבינה/ }).click();
    await page.waitForURL(/\/producers\?q=/, { timeout: 15_000 });
    expect(decodeURIComponent(page.url())).toContain("q=גבינה");
  });

  // MANUAL_TESTING § Smart Search item 2 — focus with NO recent → trending
  // ("חיפושים פופולריים") from GET /search/trending. Trending is a server
  // aggregate (empty on a fresh DB) — mock its CONTENT to assert the wiring.
  test("focusing with no recent searches shows the trending dropdown", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
    await page.route("**/api/search/trending", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(["עגבניות", "חלב טרי"]),
      }),
    );
    await gotoHome(page);
    await heroInput(page).click();

    const history = page.getByTestId("hero-search-history");
    await expect(history).toBeVisible();
    await expect(history.getByText("חיפושים פופולריים")).toBeVisible();
    await expect(history.getByRole("option", { name: /עגבניות/ })).toBeVisible();
  });

  // MANUAL_TESTING § Smart Search item 3 — a single char fires no autocomplete
  // (the ≥2-char guard: q.length < 2 → no /search request, no results dropdown)
  test("typing a single character does not open the autocomplete dropdown", async ({ page }) => {
    await gotoHome(page);
    let searchCalls = 0;
    page.on("request", (r) => {
      if (/\/api\/search(\?|$)/.test(r.url())) searchCalls++;
    });
    await heroInput(page).fill("ח");
    await page.waitForTimeout(800); // past the 300ms debounce window
    await expect(page.getByTestId("hero-search-dropdown")).toHaveCount(0);
    expect(searchCalls).toBe(0);
  });

  // MANUAL_TESTING § Smart Search item 4 — 2+ chars → grouped autocomplete
  // (בתי עסק / קטגוריות / ערים sections) after the 300ms debounce
  test("typing 2+ chars opens grouped autocomplete results", async ({ page }) => {
    await gotoHome(page);
    await heroInput(page).fill("חלב");
    const dropdown = page.getByTestId("hero-search-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 10_000 });
    // seeded "גבינות הר הגולן" + category "חלב וגבינות" match "חלב"
    await expect(dropdown.getByText("בתי עסק", { exact: false })).toBeVisible();
    await expect(dropdown.getByRole("option").first()).toBeVisible();
  });

  // MANUAL_TESTING § Smart Search item 5 — ArrowDown highlights, Enter selects
  test("keyboard ArrowDown + Enter selects the highlighted autocomplete row", async ({ page }) => {
    await gotoHome(page);
    const input = heroInput(page);
    await input.fill("חלב");
    await expect(page.getByTestId("hero-search-dropdown")).toBeVisible({ timeout: 10_000 });
    await input.press("ArrowDown");
    await input.press("Enter");
    // a producer row navigates to its slug (/golan-cheese); a category/city row
    // searches it (/producers?q=) — either way we leave the homepage
    await page.waitForURL((url) => !/^\/(he|en)?\/?$/.test(new URL(url).pathname), {
      timeout: 15_000,
    });
    expect(new URL(page.url()).pathname).not.toMatch(/^\/(he|en)?\/?$/);
  });

  // MANUAL_TESTING § Smart Search items 7 + 8 — a submitted term persists to
  // recent (localStorage), and GET /search fires at most once per debounce
  // burst (rapid keystrokes don't fire one request per char)
  test("submitting persists to recent; rapid typing debounces the /search calls", async ({ page }) => {
    await gotoHome(page);
    let searchCalls = 0;
    page.on("request", (r) => {
      if (/\/api\/search(\?|$)/.test(r.url())) searchCalls++;
    });
    const input = heroInput(page);
    // rapid burst of keystrokes within one debounce window
    await input.pressSequentially("חלב טרי", { delay: 40 });
    await page.waitForTimeout(1000);
    // one 300ms burst → far fewer /search calls than the 7 keystrokes
    expect(searchCalls).toBeLessThanOrEqual(2);

    await page.getByTestId("hero-search-submit").click();
    await page.waitForURL(/\/producers\?q=/, { timeout: 15_000 });
    const recent = await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k) || "[]"),
      RECENT_KEY,
    );
    expect(recent[0]).toBe("חלב טרי"); // most-recent-first
  });

  // MANUAL_TESTING § Smart Search item 10 — /producers?q= renders the
  // "תוצאות עבור: {q}" heading above the grid
  test("/producers?q= shows the search-results heading with the query", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
    await page.goto("/producers?q=חלב");
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toContainText("תוצאות עבור:");
    await expect(h1).toContainText("חלב");
  });

  // MANUAL_TESTING § Smart Search item 13 — a no-match query shows the empty
  // state (doc-stale: the checklist's "לא נמצאו בתי עסק" is the count line;
  // the empty-state heading is "לא מצאנו בתי עסק עבור {q}")
  test("/producers?q= with no matches shows the empty state", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
    await page.goto("/producers?q=zzxqנוןלאקיים123");
    await expect(page.getByText(/לא מצאנו בתי עסק עבור/)).toBeVisible({ timeout: 15_000 });
  });
});
