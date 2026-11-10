import { expect, test } from "@playwright/test";
import { expectStatus, goldenSession } from "./session";

/**
 * Spec:     golden/07-a1-admin — persona A1, an admin.
 * Purpose:  Walk the admin's read side from the action map: the admin home and
 *           its queues, the producers queue and one golden business's admin
 *           record, the group buys, kashrut, experiences, recipes, reviews and
 *           WhatsApp-failure queues, the users list and the stats. A1's writes
 *           are walked with the persona they act on: hide / unhide a review in
 *           06-c1-customer.
 * Does NOT: approve, reject or change anything here. Approve / reject →
 *           resubmit needs a business in `pending`, and moving a golden
 *           business out of `approved` would break every other golden spec;
 *           that lifecycle stays covered by flows/40-rejected-resubmit-loop.
 * Runs:     only in the `golden` project, against staging seeded with
 *           `seed_demo_business.py --golden` (MEH-2897).
 */

const ADMIN_READS = [
  "/admin/stats",
  "/admin/dashboard",
  "/admin/producers/pending",
  "/admin/group-buys",
  "/admin/kashrut",
  "/admin/experiences",
  "/admin/recipes/pending",
  "/admin/reviews",
  "/admin/whatsapp/failed",
  "/admin/users",
] as const;

test.describe("A1 — admin", () => {
  test("every admin queue answers for the admin", async ({ baseURL }) => {
    const a1 = await goldenSession("a1", baseURL!);
    // One request at a time, and every status reported: a red names the queue.
    for (const path of ADMIN_READS) {
      await expectStatus(await a1.api.get(path), 200, `GET ${path}`);
    }
  });

  test("the admin sees a golden business's admin record", async ({
    baseURL,
  }) => {
    const g5 = await goldenSession("g5", baseURL!);
    const a1 = await goldenSession("a1", baseURL!);
    const res = await a1.api.get(`/admin/producers/${g5.me.producer_id}`);
    await expectStatus(res, 200, "GET /admin/producers/{id}");
    const row = (await res.json()) as { slug: string; status: string };
    expect(row.slug).toBe(g5.persona.slug);
    expect(row.status).toBe("approved");
  });

  test("admin pages render for the admin, and a business is denied them", async ({
    browser,
    baseURL,
  }) => {
    const a1 = await goldenSession("a1", baseURL!);
    const context = await a1.newContext(browser);
    try {
      const page = await context.newPage();
      await page.goto("/admin");
      await expect(page.getByTestId("admin-home-queues")).toBeVisible();
      await page.goto("/admin/reviews");
      await expect(page.getByTestId("review-ai-flag-filter")).toBeVisible();
      await page.goto("/admin/recipes");
      await expect(page.getByTestId("admin-recipes-title")).toBeVisible();
      await expect(page.getByTestId("access-denied")).toHaveCount(0);
    } finally {
      await context.close();
    }

    // The negative cell: a business persona's valid login is denied /admin in
    // place (MEH-1599), by role.
    const g1 = await goldenSession("g1", baseURL!);
    const ownerContext = await g1.newContext(browser);
    try {
      const page = await ownerContext.newPage();
      await page.goto("/admin");
      await expect(page.getByTestId("access-denied")).toBeVisible();
    } finally {
      await ownerContext.close();
    }
    const refused = await g1.api.get("/admin/stats");
    await expectStatus(refused, 403, "GET /admin/stats as a business");
  });
});
