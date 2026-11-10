import { expect, test } from "@playwright/test";
import { expectStatus, goldenSession } from "./session";

/**
 * Spec:     golden/06-c1-customer — persona C1, a customer who signed up with
 *           email.
 * Purpose:  Walk C1's own actions from the action map: save a business
 *           (favourite), set its alert preferences, see it on /favorites,
 *           remove it; write a review on G1 through G1's review link, which the
 *           admin (A1) hides and unhides, then delete it. C1's other two
 *           actions are walked with the business that owns them: joining a
 *           group buy in 01-g1, reserving a rescue bag in 04-g4.
 * Does NOT: leave a favourite or a review behind — both are removed in
 *           `finally`. The review is on a golden business only, never a real
 *           one (anchor plan §C.2).
 * Runs:     only in the `golden` project, against staging seeded with
 *           `seed_demo_business.py --golden` (MEH-2897).
 */

test.describe("C1 — customer (email)", () => {
  test("favourite G1, set alerts, see it on /favorites, remove it", async ({
    browser,
    baseURL,
  }) => {
    const g1 = await goldenSession("g1", baseURL!);
    const c1 = await goldenSession("c1", baseURL!);
    const producerId = g1.me.producer_id!;
    let saved = false;
    try {
      const added = await c1.api.post(`/users/me/favorites/${producerId}`);
      await expectStatus(added, [200, 201], "POST /users/me/favorites/{id}");
      saved = true;

      const prefs = await c1.api.put(
        `/users/me/favorites/${producerId}/alerts`,
        {
          notify_new_product: true,
          notify_new_event: false,
          notify_delivery_area: false,
          notify_new_recipe: false,
          notify_new_group_buy: true,
          whatsapp_opt_in: false,
        },
      );
      await expectStatus(prefs, 200, "PUT /users/me/favorites/{id}/alerts");
      const read = await c1.api.get(`/users/me/favorites/${producerId}/alerts`);
      await expectStatus(read, 200, "GET /users/me/favorites/{id}/alerts");
      const out = (await read.json()) as {
        notify_new_event: boolean;
        whatsapp_opt_in: boolean;
      };
      expect(out.notify_new_event).toBe(false);
      expect(out.whatsapp_opt_in).toBe(false);

      const list = await c1.api.get("/users/me/favorites");
      await expectStatus(list, 200, "GET /users/me/favorites");
      expect(JSON.stringify(await list.json())).toContain(producerId);

      const context = await c1.newContext(browser);
      try {
        const page = await context.newPage();
        await page.goto("/favorites");
        await expect(page.getByTestId("favorites-bell").first()).toBeVisible();
      } finally {
        await context.close();
      }
    } finally {
      if (saved) {
        const removed = await c1.api.delete(
          `/users/me/favorites/${producerId}`,
        );
        await expectStatus(
          removed,
          [200, 204],
          "DELETE /users/me/favorites/{id}",
        );
      }
    }
    const after = await c1.api.get("/users/me/favorites");
    expect(JSON.stringify(await after.json())).not.toContain(producerId);
  });

  test("review on G1 via its review link; A1 hides and unhides it; C1 deletes it", async ({
    browser,
    baseURL,
  }) => {
    const g1 = await goldenSession("g1", baseURL!);
    const c1 = await goldenSession("c1", baseURL!);
    const a1 = await goldenSession("a1", baseURL!);
    const producerId = g1.me.producer_id!;

    const link = await g1.api.get("/producers/me/review-link");
    await expectStatus(link, 200, "GET /producers/me/review-link");
    const reviewToken = new URL(
      ((await link.json()) as { url: string }).url,
    ).searchParams.get("rt");
    expect(reviewToken).toBeTruthy();

    let reviewId: string | null = null;
    try {
      const posted = await c1.api.post(`/producers/${producerId}/reviews`, {
        stars: 5,
        body: "ביקורת בדיקה אוטומטית של מהמקור. תימחק בסוף הריצה.",
        review_token: reviewToken,
      });
      await expectStatus(posted, 201, "POST /producers/{id}/reviews (C1)");
      reviewId = (await posted.json()).id;

      const hidden = await a1.api.put(`/admin/reviews/${reviewId}/hide`);
      await expectStatus(hidden, 200, "PUT /admin/reviews/{id}/hide (A1)");
      const shown = await a1.api.put(`/admin/reviews/${reviewId}/unhide`);
      await expectStatus(shown, 200, "PUT /admin/reviews/{id}/unhide (A1)");

      const publicList = await c1.api.get(`/producers/${producerId}/reviews`);
      await expectStatus(publicList, 200, "GET /producers/{id}/reviews");
      expect(JSON.stringify(await publicList.json())).toContain(reviewId!);

      const context = await c1.newContext(browser);
      try {
        const page = await context.newPage();
        await page.goto(`/producer/${producerId}`);
        await expect(page.getByTestId("reviews-summary")).toBeVisible();
      } finally {
        await context.close();
      }
    } finally {
      if (reviewId) {
        const removed = await c1.api.delete(`/reviews/${reviewId}`);
        await expectStatus(removed, [200, 204], "DELETE /reviews/{id} (C1)");
      }
    }
    const after = await c1.api.get(`/producers/${producerId}/reviews`);
    expect(
      JSON.stringify(await after.json()),
      "the run's review is gone",
    ).not.toContain(reviewId!);
  });
});
