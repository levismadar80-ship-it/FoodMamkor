import { expect, test } from "@playwright/test";
import { expectStatus, goldenSession } from "./session";

/**
 * Spec:     golden/03-g3-organizer — persona G3, a market organizer
 *           (`kind='organizer'`, ADR-036).
 * Purpose:  Walk the organizer's dashboard and pages: three tabs and no
 *           insights tab (MEH-2460), her markets on the events tool and on her
 *           public organizer page (MEH-2461), and the guard that an organizer
 *           cannot open a group buy (`POST /group-buys` → 403, MEH-2459).
 * Does NOT: write anything. The 403 is the only "write", and it is refused.
 * Runs:     only in the `golden` project, against staging seeded with
 *           `seed_demo_business.py --golden` (MEH-2897).
 *
 * The card (MEH-2897) says "organizer with group buys". The code refuses that
 * on purpose, so this persona carries markets and proves the refusal; the
 * group-buy lifecycle is walked by G1 (01-g1-products).
 */

test.describe("G3 — organizer", () => {
  test("dashboard has the organizer tabs and no insights tab", async ({
    browser,
    baseURL,
  }) => {
    const g3 = await goldenSession("g3", baseURL!);
    expect(g3.me.producer_kind).toBe("organizer");
    const context = await g3.newContext(browser);
    try {
      const page = await context.newPage();
      await page.goto("/producer/dashboard");
      await expect(page.getByTestId("producer-overview")).toBeVisible();
      await expect(
        page.getByTestId("dashboard-tab-organizer_events"),
      ).toBeVisible();
      await expect(page.getByTestId("dashboard-tab-edit")).toBeVisible();
      // Gate on the organizer tab rendering first (above), so a zero count here
      // means "no insights tab", not "the nav has not rendered yet".
      await expect(page.getByTestId("dashboard-tab-insights")).toHaveCount(0);
      await expect(page.getByTestId("dashboard-tab-tools")).toHaveCount(0);

      await page.getByTestId("dashboard-tab-organizer_events").click();
      await expect(page.getByTestId("manage-event-row").first()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("her markets are on her public organizer page", async ({
    browser,
    baseURL,
  }) => {
    const g3 = await goldenSession("g3", baseURL!);
    const mine = await g3.api.get("/events/mine");
    await expectStatus(mine, 200, "GET /events/mine");
    expect(((await mine.json()) as unknown[]).length).toBeGreaterThanOrEqual(1);

    const context = await g3.newContext(browser);
    try {
      const page = await context.newPage();
      await page.goto(`/organizers/${g3.persona.slug}`);
      await expect(page.getByTestId("organizer-page")).toBeVisible();
      await expect(page.getByTestId("organizer-event").first()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("an organizer cannot open a group buy (403)", async ({ baseURL }) => {
    const g3 = await goldenSession("g3", baseURL!);
    const refused = await g3.api.post("/group-buys", {
      title: "קבוצת רכישה של מארגנת",
      product_name: "מוצר",
      price_per_unit_regular: 40,
      price_per_unit_group: 30,
      min_participants: 3,
      deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      fulfillment_note: "איסוף בתיאום מראש",
    });
    await expectStatus(refused, 403, "POST /group-buys as an organizer");
    // And nothing was opened under her.
    const mine = await g3.api.get("/producers/me/group-buys");
    await expectStatus(mine, 200, "GET /producers/me/group-buys");
    expect(await mine.json()).toEqual([]);
  });
});
