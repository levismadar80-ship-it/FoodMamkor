import { expect, test } from "@playwright/test";
import { expectStatus, goldenSession, runTag, sweepLeftovers } from "./session";

/**
 * Spec:     golden/01-g1-products — persona G1, a business with products only.
 * Purpose:  Walk G1's actions from the action map (docs/release/action-map.md,
 *           actor "business/organizer"): the dashboard home, the catalogue
 *           (create → edit → delete one product), insights, the review link,
 *           and the group-buy lifecycle (open → a customer joins and leaves →
 *           the business cancels), with the customer persona C1.
 * Does NOT: leave anything behind. The product is deleted and the group buy is
 *           cancelled in `finally`, so a failed assertion still cleans up.
 *           Cancelled is the group buy's terminal state — there is no delete
 *           route, so the row stays, cancelled, under the golden business only.
 * Runs:     only in the `golden` project (`--project=golden`), against staging
 *           seeded by `seed_demo_business.py --golden` (MEH-2897).
 *
 * Why the group buy is here and not under G3: an organizer cannot open one
 * (`POST /group-buys` → 403, MEH-2459) — 03-g3 asserts that refusal.
 */

test.describe("G1 — business with products", () => {
  test("dashboard home, insights and the public page render for G1", async ({
    browser,
    baseURL,
  }) => {
    const g1 = await goldenSession("g1", baseURL!);
    expect(g1.me.producer_kind).toBe("producer");
    const context = await g1.newContext(browser);
    try {
      const page = await context.newPage();
      await page.goto("/producer/dashboard");
      await expect(page.getByTestId("producer-overview")).toBeVisible();
      await expect(page.getByTestId("producer-overview")).toHaveAttribute(
        "data-state-approved",
        "true",
      );
      await expect(page.getByTestId("dashboard-tab-insights")).toBeVisible();

      await page.getByTestId("dashboard-tab-insights").click();
      await expect(
        page
          .getByTestId("insights-period")
          .or(page.getByTestId("insights-zero-state")),
      ).toBeVisible();

      await page.goto(`/producer/${g1.me.producer_id}`);
      await expect(page.getByTestId("producer-detail-root")).toBeVisible();
      await expect(page.getByTestId("contact-card").first()).toBeAttached();
    } finally {
      await context.close();
    }
  });

  test("catalogue: create, edit and delete one product", async ({
    browser,
    baseURL,
  }) => {
    const g1 = await goldenSession("g1", baseURL!);
    const { api } = g1;
    await sweepLeftovers(g1); // an earlier run's product or group buy, if one survived
    const tag = runTag();
    let productId: string | null = null;
    try {
      const created = await api.post("/producers/me/products", {
        name: `מוצר ${tag}`,
        price_min: 20,
      });
      await expectStatus(created, [200, 201], "POST /producers/me/products");
      productId = (await created.json()).id;

      const edited = await api.put(`/producers/me/products/${productId}`, {
        name: `מוצר ${tag} (עודכן)`,
        price_min: 22,
      });
      await expectStatus(edited, 200, "PUT /producers/me/products/{id}");

      const listed = await api.get("/producers/me/products");
      await expectStatus(listed, 200, "GET /producers/me/products");
      const names = (
        (await listed.json()) as { id: string; name: string }[]
      ).map((p) => p.id);
      expect(names).toContain(productId);

      // The public page lists the catalogue: the new product is a product row.
      const context = await g1.newContext(browser);
      try {
        const page = await context.newPage();
        await page.goto(`/producer/${g1.me.producer_id}`);
        // The run's own row (matched by its unique tag), not just any product.
        await expect(
          page.getByTestId("product-row").filter({ hasText: tag }),
        ).toBeVisible();
      } finally {
        await context.close();
      }
    } finally {
      if (productId) {
        const removed = await api.delete(`/producers/me/products/${productId}`);
        await expectStatus(
          removed,
          [200, 204],
          "DELETE /producers/me/products/{id}",
        );
      }
    }
    const after = await api.get("/producers/me/products");
    const ids = ((await after.json()) as { id: string }[]).map((p) => p.id);
    expect(ids, "the run's product is gone").not.toContain(productId);
  });

  test("review link is issued for G1", async ({ baseURL }) => {
    const g1 = await goldenSession("g1", baseURL!);
    const res = await g1.api.get("/producers/me/review-link");
    await expectStatus(res, 200, "GET /producers/me/review-link");
    const { url } = (await res.json()) as { url: string };
    expect(
      new URL(url).searchParams.get("rt"),
      "the link carries a review token",
    ).toBeTruthy();
  });

  test("group buy: open, C1 joins and leaves, G1 cancels", async ({
    browser,
    baseURL,
  }) => {
    const g1 = await goldenSession("g1", baseURL!);
    const c1 = await goldenSession("c1", baseURL!);
    const tag = runTag();
    let groupBuyId: string | null = null;
    let joined = false;
    try {
      const opened = await g1.api.post("/group-buys", {
        title: `קבוצת רכישה ${tag}`,
        product_name: `מוצר ${tag}`,
        unit: "יחידה",
        price_per_unit_regular: 40,
        price_per_unit_group: 30,
        min_participants: 3,
        max_participants: 10,
        deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        fulfillment_note: "איסוף מהעסק בתיאום מראש",
      });
      await expectStatus(opened, [200, 201], "POST /group-buys");
      groupBuyId = (await opened.json()).id;

      const joinRes = await c1.api.post(`/group-buys/${groupBuyId}/commit`, {
        quantity: 1,
      });
      await expectStatus(
        joinRes,
        [200, 201],
        "POST /group-buys/{id}/commit (C1)",
      );
      joined = true;

      // C1 sees the group buy page with its join card.
      const context = await c1.newContext(browser);
      try {
        const page = await context.newPage();
        await page.goto(`/group-buys/${groupBuyId}`);
        await expect(page.getByTestId("group-buy-join-card")).toBeVisible();
        await expect(page.getByTestId("group-buy-progress")).toBeVisible();
      } finally {
        await context.close();
      }

      // The owner sees it on her group-buy tool.
      const ownerContext = await g1.newContext(browser);
      try {
        const page = await ownerContext.newPage();
        await page.goto("/producer/dashboard/group-buys");
        await expect(
          page.getByTestId("manage-group-buy-card").filter({ hasText: tag }),
        ).toBeVisible();
      } finally {
        await ownerContext.close();
      }

      const leave = await c1.api.delete(`/group-buys/${groupBuyId}/commit`);
      await expectStatus(
        leave,
        [200, 204],
        "DELETE /group-buys/{id}/commit (C1)",
      );
      joined = false;
    } finally {
      if (groupBuyId) {
        if (joined) await c1.api.delete(`/group-buys/${groupBuyId}/commit`);
        const cancelled = await g1.api.patch(
          `/group-buys/${groupBuyId}/status`,
          {
            status: "cancelled",
          },
        );
        await expectStatus(
          cancelled,
          200,
          "PATCH /group-buys/{id}/status → cancelled",
        );
      }
    }
    const mine = await g1.api.get("/producers/me/group-buys");
    const row = ((await mine.json()) as { id: string; status: string }[]).find(
      (gb) => gb.id === groupBuyId,
    );
    expect(row?.status, "the run's group buy ends cancelled").toBe("cancelled");
  });
});
