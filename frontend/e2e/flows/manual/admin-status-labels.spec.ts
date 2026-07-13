import { test, expect, type Page } from "@playwright/test";

/**
 * Spec:     manual/admin-status-labels
 * Purpose:  Converted from docs/MANUAL_TESTING.md § "Producer status labels
 *           (MEH-294)" — the admin producers table renders each producer.status
 *           as a translated chip with a status-specific background, never a raw
 *           code. Guards the `lib/producer-status.js` label+color map end-to-end.
 * Touches:  GET /admin/producers read only (admin-authed). No writes.
 * Auth:     REUSES 20-admin-recipes-queue.spec.ts — SMOKE_ADMIN_* env gating +
 *           browser-side /api/auth/login (the MEH-327 fingerprint/refresh
 *           cookies must land in the browser jar; a bearer-only token 401s) +
 *           desktop-project-only.
 * Approach: per-status find-or-skip — assert the label+bg for each status that
 *           is present in the table (all 5 locally via local-backend.sh §4d;
 *           whatever staging carries in CI). CI-safe against real data.
 * Does NOT: assert the unknown-status raw-code fallback (item 8 — the DB status
 *           column is enum-constrained, can't seed a bogus value; the fallback
 *           is `getProducerStatusLabel(x) ?? x`, unit-territory).
 * History:  MEH-1171 (creation).
 */

const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;

// verbatim from frontend/lib/producer-status.js (PRODUCER_STATUS_LABELS/COLORS)
const STATUS = [
  { label: "ממתינה לאימות WhatsApp", bg: /bg-orange-100/ }, // pending_whatsapp
  { label: "ממתינה לאישור האדמין", bg: /bg-yellow-100/ }, //   pending
  { label: "מאושר", bg: /bg-primary/ }, //                     approved
  { label: "נדחה", bg: /bg-red-100/ }, //                      rejected
  { label: "לא פעילה", bg: /bg-gray-200/ }, //                 inactive
];

const badge = (page: Page, label: string) =>
  page.locator("span.rounded-full", { hasText: label });

test.describe("admin producer status labels (MEH-1171 § MEH-294)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD not set — admin smoke skipped",
  );

  test("each status renders its translated chip with the right background", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "admin table assertions are desktop-project-only (mirrors spec 19/20)");

    // browser-side login → HttpOnly fingerprint/refresh cookies + localStorage token
    await page.goto("/login");
    await page.evaluate(
      async ({ email, password }) => {
        const r = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          credentials: "include",
        });
        if (!r.ok) throw new Error(`login failed: ${r.status}`);
        localStorage.setItem("token", (await r.json()).access_token);
      },
      { email: ADMIN_EMAIL as string, password: ADMIN_PASSWORD as string },
    );

    // default view is status=all (use-admin-producers.js:28) → every chip shows
    await page.goto("/admin/producers");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    // wait for the GET /admin/producers fetch to populate the table before
    // asserting — the empty state renders until the rows land (a status chip
    // matching any of the 5 known labels proves the table has data)
    await expect(
      page.locator("span.rounded-full").filter({
        hasText: /ממתינה לאימות WhatsApp|ממתינה לאישור האדמין|מאושר|נדחה|לא פעילה/,
      }).first(),
    ).toBeVisible({ timeout: 15_000 });

    let asserted = 0;
    for (const { label, bg } of STATUS) {
      const chip = badge(page, label).first();
      if ((await badge(page, label).count()) === 0) continue; // staging may lack this status
      await expect(chip).toBeVisible();
      await expect(chip).toHaveClass(bg); // item 1-5: status-specific background
      asserted++;
    }
    // at least one status chip must have rendered (proves the map is wired,
    // not that the table was empty) — locally all 5 are seeded
    expect(asserted, "no status chips found in the admin table").toBeGreaterThan(0);

    // item 6 — labels are translated, never a raw code
    for (const raw of ["pending_whatsapp", "pending", "approved", "rejected", "inactive"]) {
      await expect(page.locator("span.rounded-full", { hasText: raw })).toHaveCount(0);
    }
  });
});
