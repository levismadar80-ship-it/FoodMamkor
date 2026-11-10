import { expect, test } from "@playwright/test";
import { expectStatus, goldenSession, runTag } from "./session";

/**
 * Spec:     golden/02-g2-events — persona G2, a business with events and
 *           experiences.
 * Purpose:  Walk G2's actions from the action map: create an event, see it on
 *           the events tool, delete it; read the seeded experience and its
 *           sign-up list (the host dashboard).
 * Does NOT: create an experience. A new experience goes to the admin
 *           moderation queue and notifies the admins by email — a write the
 *           run could not undo. The seeded, approved experience covers the
 *           host side read-only. The event the run creates is deleted in
 *           `finally`.
 * Runs:     only in the `golden` project, against staging seeded with
 *           `seed_demo_business.py --golden` (MEH-2897).
 */

test.describe("G2 — business with events and experiences", () => {
  test("event: create, see it on the events tool, delete", async ({
    browser,
    baseURL,
  }) => {
    const g2 = await goldenSession("g2", baseURL!);
    const { api } = g2;
    const tag = runTag();
    const inTenDays = new Date(Date.now() + 10 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    let eventId: string | null = null;
    try {
      const created = await api.post("/events", {
        title: `אירוע ${tag}`,
        event_date: inTenDays,
        event_time: "18:00",
        city: "בנימינה-גבעת עדה",
        category: "אחר",
        price: 0,
      });
      await expectStatus(created, [200, 201], "POST /events");
      eventId = (await created.json()).id;

      const mine = await api.get("/events/mine");
      await expectStatus(mine, 200, "GET /events/mine");
      const ids = ((await mine.json()) as { id: string }[]).map((e) => e.id);
      expect(ids).toContain(eventId);

      const context = await g2.newContext(browser);
      try {
        const page = await context.newPage();
        await page.goto("/producer/dashboard/events");
        // The seeded event plus the run's: at least two rows.
        await expect(page.getByTestId("manage-event-row").nth(1)).toBeVisible();
      } finally {
        await context.close();
      }
    } finally {
      if (eventId) {
        const removed = await api.delete(`/events/${eventId}`);
        await expectStatus(removed, [200, 204], "DELETE /events/{id}");
      }
    }
    const after = await api.get("/events/mine");
    const ids = ((await after.json()) as { id: string }[]).map((e) => e.id);
    expect(ids, "the run's event is gone").not.toContain(eventId);
  });

  test("experience: the host sees her experience and its sign-ups", async ({
    browser,
    baseURL,
  }) => {
    const g2 = await goldenSession("g2", baseURL!);
    const mine = await g2.api.get("/experiences/mine");
    await expectStatus(mine, 200, "GET /experiences/mine");
    const experiences = (await mine.json()) as { id: string; status: string }[];
    const approved = experiences.find((ex) => ex.status === "approved");
    expect(approved, "the seeded experience is approved").toBeTruthy();

    const signups = await g2.api.get(
      `/experiences/${approved!.id}/registrations`,
    );
    await expectStatus(signups, 200, "GET /experiences/{id}/registrations");

    const context = await g2.newContext(browser);
    try {
      const page = await context.newPage();
      await page.goto("/producer/dashboard/experiences");
      await expect(
        page.getByTestId("experience-signup-count").first(),
      ).toBeVisible();
      await page.goto(`/experiences/${approved!.id}`);
      await expect(page.getByTestId("experience-detail")).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
