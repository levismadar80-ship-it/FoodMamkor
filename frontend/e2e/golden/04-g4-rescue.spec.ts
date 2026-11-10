import { expect, test, type APIResponse } from "@playwright/test";
import { expectStatus, goldenSession, type GoldenSession } from "./session";

/**
 * Spec:     golden/04-g4-rescue — persona G4, a business with rescue bags.
 * Purpose:  Walk the rescue-bag lifecycle from the action map (state machine
 *           §3): G4 publishes today's bag at her exact pickup point → C1
 *           reserves one → the counter screen lists the reservation → C1
 *           cancels it → G4 cancels the bag.
 * Does NOT: leave an active bag or reservation behind: both are cancelled in
 *           `finally`, and a bag left active by an earlier failed run is
 *           cancelled first (the API allows one active bag per point per day).
 *           Does NOT mark a bag handed or no-show: a no-show counts toward the
 *           customer's two-strike block, which the run could not undo.
 * Runs:     only in the `golden` project, against staging seeded with
 *           `seed_demo_business.py --golden` (MEH-2897).
 *
 * The pilot is behind a flag and a town list (rescue.py `require_rescue_enabled`,
 * `city_in_pilot`). When staging has it off, or G4's town is not on the list,
 * the test SKIPS and says which — that is target configuration, not a product
 * failure, and the reason is printed in the report so it cannot pass as green.
 */

const MINUTE = 60 * 1000;
const NOT_IN_PILOT_TOWN = "סלי הפתעה עדיין לא פתוחים ביישוב הזה"; // rescue.py create_offer
const ALREADY_ACTIVE_TODAY = "יש כבר סל פעיל בנקודה הזאת בתאריך הזה"; // rescue.py create_offer

/** YYYY-MM-DD on the Israel clock — the bag's `date` is the Israel day. */
function israelDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
  }).format(at);
}

async function cancelLeftoverBags(g4: GoldenSession): Promise<void> {
  const res = await g4.api.get("/producers/me/rescue/offers");
  await expectStatus(res, 200, "GET /producers/me/rescue/offers");
  const offers = (await res.json()) as {
    id: string;
    status: string;
    pickup_end: string;
  }[];
  for (const offer of offers) {
    if (
      offer.status === "active" &&
      new Date(offer.pickup_end).getTime() > Date.now()
    ) {
      const cancelled = await g4.api.post(`/rescue/offers/${offer.id}/cancel`);
      await expectStatus(
        cancelled,
        200,
        "POST /rescue/offers/{id}/cancel (leftover)",
      );
    }
  }
}

async function detail(res: APIResponse): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
  return typeof body.detail === "string" ? body.detail : "";
}

test.describe("G4 — business with rescue bags", () => {
  test("publish → C1 reserves → counter lists it → C1 cancels → G4 cancels", async ({
    browser,
    baseURL,
  }) => {
    const g4 = await goldenSession("g4", baseURL!);

    const flag = await g4.api.get("/rescue/offers");
    test.skip(
      flag.status() === 404,
      "the rescue pilot is switched off on this target (rescue.py answers 404) — " +
        "the G4 walk needs it on",
    );
    await expectStatus(flag, 200, "GET /rescue/offers");

    const now = new Date();
    const pickupStart = new Date(now.getTime() + 60 * MINUTE);
    test.skip(
      israelDate(pickupStart) !== israelDate(now),
      "less than an hour of the Israel day is left — a bag published now would " +
        "open tomorrow, and a reservation is only accepted for today's bag",
    );

    await cancelLeftoverBags(g4);
    const locations = await g4.api.get("/producers/me/locations");
    await expectStatus(locations, 200, "GET /producers/me/locations");
    const point = (
      (await locations.json()) as { id: string; is_primary: boolean }[]
    ).find((loc) => loc.is_primary);
    expect(point, "G4 has a primary pickup point (seeded)").toBeTruthy();

    const c1 = await goldenSession("c1", baseURL!);
    let offerId: string | null = null;
    let orderId: string | null = null;
    let orderCancelled = false;
    try {
      const published = await g4.api.post("/rescue/offers", {
        producer_location_id: point!.id,
        date: israelDate(now),
        qty_total: 2,
        price_agorot: 1500,
        value_min_agorot: 3000,
        value_max_agorot: 4500,
        pickup_start: pickupStart.toISOString(),
        pickup_end: new Date(now.getTime() + 120 * MINUTE).toISOString(),
        cancel_until: new Date(now.getTime() + 30 * MINUTE).toISOString(),
      });
      test.skip(
        published.status() === 403 &&
          (await detail(published)) === NOT_IN_PILOT_TOWN,
        "G4's town (זכרון יעקב) is not in this target's RESCUE_BAGS_CITIES",
      );
      // One active bag per point per Israel day (rescue.py). cancelLeftoverBags
      // above clears any leftover whose window is still open; a bag left
      // `active` by an earlier run AFTER its pickup_end can no longer be
      // cancelled (409 «זמן האיסוף חלף»), so today's walk cannot publish.
      test.skip(
        published.status() === 409 &&
          (await detail(published)) === ALREADY_ACTIVE_TODAY,
        "an earlier run left today's bag at G4's point active past its window; " +
          "it cannot be cancelled now, so the walk can publish again tomorrow",
      );
      await expectStatus(published, [200, 201], "POST /rescue/offers");
      offerId = (await published.json()).id;

      const reserved = await c1.api.post("/rescue/orders", {
        offer_id: offerId,
        qty: 1,
      });
      await expectStatus(reserved, 201, "POST /rescue/orders (C1)");
      const order = (await reserved.json()) as {
        id: string;
        pickup_code: string;
      };
      orderId = order.id;
      expect(order.pickup_code, "the buyer gets a pickup code").toBeTruthy();

      const mine = await c1.api.get("/rescue/orders/mine");
      await expectStatus(mine, 200, "GET /rescue/orders/mine (C1)");
      expect(
        ((await mine.json()) as { id: string }[]).map((o) => o.id),
      ).toContain(orderId);

      const counter = await g4.api.get("/producers/me/rescue/orders");
      await expectStatus(counter, 200, "GET /producers/me/rescue/orders");

      const context = await g4.newContext(browser);
      try {
        const page = await context.newPage();
        await page.goto("/producer/dashboard/rescue");
        await expect(page.getByTestId("rescue-dashboard-page")).toBeVisible();
        await expect(
          page.getByTestId("rescue-order-row").first(),
        ).toBeVisible();
      } finally {
        await context.close();
      }

      const cancelOrder = await c1.api.post(`/rescue/orders/${orderId}/cancel`);
      await expectStatus(
        cancelOrder,
        200,
        "POST /rescue/orders/{id}/cancel (C1)",
      );
      orderCancelled = true;
    } finally {
      if (orderId && !orderCancelled) {
        await c1.api.post(`/rescue/orders/${orderId}/cancel`);
      }
      if (offerId) {
        const pulled = await g4.api.post(`/rescue/offers/${offerId}/cancel`);
        await expectStatus(pulled, 200, "POST /rescue/offers/{id}/cancel");
      }
    }
    const after = await g4.api.get("/producers/me/rescue/offers");
    const row = ((await after.json()) as { id: string; status: string }[]).find(
      (o) => o.id === offerId,
    );
    expect(row?.status, "the run's bag ends cancelled").toBe("cancelled");
  });
});
