import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * MEH-230 (4/7) — axe regression net: ZERO critical/serious on 6 routes
 * (moderate/minor logged, not gated). Gate scope + ignore-rule rationale:
 * docs/audits/2026-06-13-a11y.md + docs/ACCESSIBILITY.md.
 */

const GATE_IMPACTS = ["critical", "serious"] as const;

// Rule IDs reported but NOT gated. `color-contrast` stays ignored while the
// known deferred pairs still trip it on gated routes — the BottomNav inactive
// labels + the dairy map-card (MEH-919 #1/#3, token/palette-traced) and the
// producers image-missing placeholder (MEH-815 #5). Remove "color-contrast"
// once those land.
// `link-in-text-block` was REMOVED from this set (MEH-921 ratchet): #1327 gave
// every flagged inline prose link a persistent underline, and the 2026-06-23
// post-merge axe pass confirmed it is 0 on all gated routes.
const GATE_IGNORE_RULES = new Set(["color-contrast"]);

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
    // MEH-1550: resolve the producer from the API, not from whichever card
    // renders first. The /producers feed is created_at DESC, so "first card"
    // moved onto a different business on every new approval (the MEH-1440
    // first-card-drift class) — and the previous MEH-828 predicate was
    // deliberately permissive, so a 404/redirect passed it. When the drifted
    // business failed to resolve, axe audited Next's error document and
    // reported a misleading `html-has-lang` instead of a navigation failure
    // (run 30197313235, surfaced triaging MEH-1536). Sorting by id keeps the
    // audited page stable across runs; the trade-off is that the audited
    // business is arbitrary rather than newest — stability is the point, and
    // the other gated routes already cover the shared page chrome.
    const res = await page.request.get("/api/producers");
    expect(res.ok(), "GET /producers must respond 2xx").toBeTruthy();
    const producers = (await res.json()) as Array<{ id: string }>;
    if (producers.length === 0) {
      // test.skip(condition, ...) throws to abort the test — no return needed.
      test.skip(true, "No producers in the feed — staging DB may be empty");
    }
    const target = [...producers].sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];

    await page.goto(`/producer/${target.id}`);
    await page.waitForLoadState("domcontentloaded");
    // MEH-1550 guard — MUST precede the h1 assertion and the scan. Next renders
    // its error document as <html id="__next_error__"> WITH its own <h1>, so
    // the h1 check cannot tell a real detail page from a failed navigation.
    // Asserting the error boundary is absent turns that case into an explicit
    // navigation failure instead of a bogus a11y violation.
    await expect(
      page.locator("#__next_error__"),
      `navigation failed — /producer/${target.id} rendered Next's error page, not a producer detail`,
    ).toHaveCount(0);
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
// the contact/landmark/contrast backlog accumulated unguarded). Same gate.
// These routes' remaining serious hits were link-in-text-block (now fixed +
// gated, #1327) + color-contrast (still ignored) + landmark (moderate, not
// gated), so they pass the gate. /contact graduated in the ratchet — its label
// crit (#1322) + link-in-text (#1327) are fixed (post-merge axe = 0).
//
// MEH-1957 — /events and /search GRADUATE into the gate. Both were held out by
// a named open defect; both defects are gone, measured before adding them
// rather than assumed:
//   /events  — held out for `aria-required-children` (critical, MEH-858
//              tablist follow-up). Scanned populated (3 seeded events, 4 tabs,
//              2 tablists rendered): 0 violations, mobile + desktop. Scanning
//              it EMPTY would have proved nothing — an unrendered tablist
//              cannot trip a children rule — so the seeded state is the one
//              that counts.
//   /search  — held out for `document-title` (serious). The route now titles
//              itself «תוצאות חיפוש | מהמקור»: 0 violations, both viewports.
// Both were re-verified red-by-construction (inject the old defect → the gate
// fails; remove it → passes), so this is a graduation on evidence and not a
// lifted quarantine. Runs pasted in the PR body.
const EXTENDED_PUBLIC_ROUTES = [
  "/contact",
  "/events",
  "/search",
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
      // pass silently. A status guard can't catch it yet — see MEH-918:
      // unmatched routes still return 200, so a removed route renders an
      // axe-clean page. Tighten this wait to a hard assert once MEH-918 lands.
      await page
        .locator("h1")
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
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
