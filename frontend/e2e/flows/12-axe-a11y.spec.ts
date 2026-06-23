import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * MEH-230 (4/7) — axe regression net: ZERO critical/serious on 6 routes
 * (moderate/minor logged, not gated). Gate scope + ignore-rule rationale:
 * docs/audits/2026-06-13-a11y.md + docs/ACCESSIBILITY.md.
 */

const GATE_IMPACTS = ["critical", "serious"] as const;

// Rule IDs reported but NOT gated. axe rates these "serious", but they are the
// site-wide contrast/brand-palette backlog the audit classifies MODERATE and
// explicitly defers (brand-color change is out of scope — see
// docs/audits/2026-06-13-a11y.md Vector 5/6 + docs/ACCESSIBILITY.md "Tightening
// the gate later"). The footer's low-contrast links/copy trip these on every
// route, so gating them would make the net red on day one and mask genuine new
// critical/serious regressions. TODO(MEH-230 follow-up): remove "color-contrast"
// once the Vector 5 sites in docs/audits/2026-06-13-a11y.md reach 0 (text-accent,
// text-honey, green-300, footer placeholder, home-hero cta_subpitch); remove
// "link-in-text-block" once the login/register inline links carry a non-color
// affordance (underline). Each removal re-tightens the gate for that rule.
const GATE_IGNORE_RULES = new Set(["color-contrast", "link-in-text-block"]);

type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;

async function analyze(page: Page): Promise<AxeResults> {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Leaflet markers render as role=button divIcons with no accessible name
    // (aria-command-name, serious), on / and /map. Deferred to a MapComponent
    // sub-MEH (wire each business name into the marker aria-label); excluded
    // from the scan so the net stays green and still catches every OTHER map
    // a11y issue. Audit: docs/audits/2026-06-13-a11y.md (Vector 1 — map markers).
    .exclude(".leaflet-marker-icon")
    .analyze();
}

function gateViolations(results: AxeResults) {
  return results.violations.filter(
    (v) =>
      (GATE_IMPACTS as readonly string[]).includes(v.impact ?? "") &&
      !GATE_IGNORE_RULES.has(v.id),
  );
}

function summarize(routeLabel: string, results: AxeResults) {
  const byImpact = results.violations.reduce<Record<string, number>>((acc, v) => {
    const k = v.impact ?? "unknown";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  // Visible in the Playwright `list` reporter output — useful for triaging the
  // moderate/minor backlog without failing the run.
  console.log(`[axe] ${routeLabel} →`, JSON.stringify(byImpact));
  for (const v of gateViolations(results)) {
    console.log(
      `[axe][GATE] ${routeLabel} ${v.impact} ${v.id}: ${v.help} (${v.nodes.length} node(s)) ${v.helpUrl}`,
    );
  }
}

test.describe("axe a11y net (critical/serious = 0)", () => {
  test("/", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
    const results = await analyze(page);
    summarize("/", results);
    expect(gateViolations(results), "critical/serious axe violations on /").toEqual([]);
  });

  test("/producers", async ({ page }) => {
    await page.goto("/producers");
    await page.waitForLoadState("domcontentloaded");
    // Let client-fetched cards render so axe scans the loaded state, not an
    // empty shell. Graceful: continue if the staging DB has no producers.
    await page
      .locator('[data-testid="producer-card"]')
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => {});
    const results = await analyze(page);
    summarize("/producers", results);
    expect(gateViolations(results), "critical/serious axe violations on /producers").toEqual([]);
  });

  test("/producer/[id]", async ({ page }) => {
    // Resolve a real producer the same way 03-view-producer-detail does:
    // navigate to /producers and open the first card. Graceful skip if the
    // staging DB has no producers (no synthetic id — that would 404 and audit
    // an error page, not a real detail page).
    await page.goto("/producers");
    await page.waitForLoadState("domcontentloaded");
    const firstCard = page.locator('[data-testid="producer-card"]').first();
    if ((await firstCard.count()) === 0) {
      // test.skip(condition, ...) throws to abort the test — no return needed.
      test.skip(true, "No producer cards found — staging DB may be empty");
    }
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.click();
    // MEH-828: accept slug-routed detail pages too. Slug producers (e.g.
    // /teva-pure) never hit /producer/{id}, so includes("/producer/") timed
    // out and the axe scan silently never ran. Mirror 03-view-producer-detail:
    // anything off the /producers listing is a detail page. Trade-off (vs the
    // old "fail loudly on error/redirect" predicate): this is permissive — a
    // redirect/404 would also pass — accepted deliberately to match 03; the
    // h1 assertion below still guards against auditing a blank/unrendered page.
    await page.waitForURL((url) => !url.pathname.startsWith("/producers"), {
      timeout: 20_000,
    });
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
    const results = await analyze(page);
    summarize("/producer/[id]", results);
    expect(gateViolations(results), "critical/serious axe violations on /producer/[id]").toEqual([]);
  });

  test("/map", async ({ page }) => {
    await page.goto("/map");
    await page.waitForLoadState("domcontentloaded");
    // Leaflet builds the map container in a useEffect; wait for it so axe scans
    // the rendered map, not an empty container. Graceful on slow init.
    await page
      .waitForSelector(".leaflet-container", { timeout: 20_000 })
      .catch(() => {});
    const results = await analyze(page);
    summarize("/map", results);
    expect(gateViolations(results), "critical/serious axe violations on /map").toEqual([]);
  });

  test("/login", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
    const results = await analyze(page);
    summarize("/login", results);
    expect(gateViolations(results), "critical/serious axe violations on /login").toEqual([]);
  });

  test("/register", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
    const results = await analyze(page);
    summarize("/register", results);
    expect(gateViolations(results), "critical/serious axe violations on /register").toEqual([]);
  });
});

// MEH-921 — extend the MEH-230 net to the public guest routes surfaced by
// the 2026-06-23 staging axe audit (the net previously covered only 6 routes, so
// the contact/landmark/contrast backlog accumulated unguarded). Same gate +
// GATE_IGNORE_RULES. These routes' only serious hits are color-contrast +
// link-in-text-block (both ignored) + landmark (moderate, not gated), so they
// pass the gate today. Routes still red-gated by an open fix are listed below
// and added once their fix lands (the ratchet):
//   /contact — `label` critical (MEH-916 / PR #1322)
//   /events  — `aria-required-children` critical (MEH-858 tablist follow-up)
//   /search  — `document-title` serious (not in GATE_IGNORE_RULES)
const EXTENDED_PUBLIC_ROUTES = [
  "/about",
  "/about/process",
  "/about/for-businesses",
  "/about/for-businesses/guides",
  "/about/for-businesses/guides/business-story",
  "/accessibility",
  "/terms",
  "/privacy",
  "/group-buys",
  "/experiences",
  "/forgot-password",
  "/register/producer",
];

test.describe("axe a11y net — extended public routes (MEH-921)", () => {
  for (const route of EXTENDED_PUBLIC_ROUTES) {
    test(route, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      // Graceful readiness: wait for an h1 if the route has one, but don't
      // hard-fail as a 20s timeout when it doesn't (e.g. a form page) — axe
      // still scans the rendered DOM, and a real failure reads as an axe
      // violation, not a misleading locator timeout. Mirrors the /producers
      // wait above.
      // Conscious trade-off (vs the hard expect() on the 6 original routes):
      // if one of these routes is removed it falls through to [slug] →
      // notFound(), which today soft-404s to an axe-clean page (200) and would
      // pass silently. A status guard can't catch it until MEH-918 makes
      // unmatched routes return a real 404 — tighten this wait to a hard
      // assert once that lands.
      await page
        .locator("h1")
        .first()
        .waitFor({ state: "visible", timeout: 15_000 })
        .catch(() => {});
      const results = await analyze(page);
      summarize(route, results);
      expect(
        gateViolations(results),
        `critical/serious axe violations on ${route}`,
      ).toEqual([]);
    });
  }
});
