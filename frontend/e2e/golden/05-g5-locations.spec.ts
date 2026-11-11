import { expect, test } from "@playwright/test";
import { expectStatus, goldenSession } from "./session";

/**
 * Spec:     golden/05-g5-locations — persona G5, a business with several
 *           locations and an approved kashrut badge.
 * Purpose:  Walk G5's actions read-only: her locations (one primary branch plus
 *           pickup points) through the API and the edit screen, her kashrut
 *           request history (approved, with a certificate), and the badge on
 *           her public page.
 * Does NOT: file a new kashrut request or add a location. A kashrut request
 *           has no delete route, so the run could not undo it; the admin side
 *           of kashrut is walked read-only by 07-a1-admin.
 * Runs:     only in the `golden` project, against staging seeded with
 *           `seed_demo_business.py --golden` (MEH-2897).
 */

const SEEDED_LOCATIONS = 3; // primary branch + GOLDEN_PICKUPS (2), seed_demo_business.py

test.describe("G5 — several locations and kashrut", () => {
  test("locations: one primary, the rest pickup points, all on the edit screen", async ({
    browser,
    baseURL,
  }) => {
    const g5 = await goldenSession("g5", baseURL!);
    const res = await g5.api.get("/producers/me/locations");
    await expectStatus(res, 200, "GET /producers/me/locations");
    const rows = (await res.json()) as { is_primary: boolean; kind: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(SEEDED_LOCATIONS);
    expect(rows.filter((r) => r.is_primary)).toHaveLength(1);
    expect(
      rows.filter((r) => r.kind === "pickup").length,
    ).toBeGreaterThanOrEqual(2);

    const context = await g5.newContext(browser);
    try {
      const page = await context.newPage();
      await page.goto("/producer/dashboard/edit?group=location");
      await expect(page.getByTestId("locations-editor")).toBeVisible();
      await expect(page.getByTestId("location-row")).toHaveCount(rows.length);
    } finally {
      await context.close();
    }
  });

  test("kashrut: the approved request carries a certificate and the badge is public", async ({
    browser,
    baseURL,
  }) => {
    const g5 = await goldenSession("g5", baseURL!);
    const res = await g5.api.get("/producers/me/kashrut-requests");
    await expectStatus(res, 200, "GET /producers/me/kashrut-requests");
    const requests = (await res.json()) as {
      status: string;
      cert_url?: string | null;
    }[];
    const approved = requests.find((r) => r.status === "approved");
    expect(approved, "the seeded request is approved").toBeTruthy();
    expect(approved!.cert_url, "and carries a certificate").toBeTruthy();

    const context = await g5.newContext(browser);
    try {
      const page = await context.newPage();
      await page.goto(`/producer/${g5.me.producer_id}`);
      await expect(page.getByTestId("producer-detail-root")).toBeVisible();
      await expect(page.getByTestId("producer-header-tags")).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
