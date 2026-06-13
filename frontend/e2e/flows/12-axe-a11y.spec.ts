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
    // Tight predicate: fail loudly if the click lands anywhere but a detail
    // page (error/redirect) instead of silently auditing the wrong route.
    await page.waitForURL((url) => url.pathname.includes("/producer/"), {
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
