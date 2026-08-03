import { test, expect } from "@playwright/test";

/**
 * Module:   28-register-success-state
 * Purpose:  MEH-1814 — the post-submit screen must OWN the render. After a
 *           successful producer upgrade the auth role flips to "producer";
 *           the MEH-1489 mount-gate ("כבר יש לך עמוד עסק במהמקור") must not
 *           replace the success screen the seller just earned.
 * Does NOT: exercise the non-upgrade (guest) path — that lands on the
 *           inbox-check screen and is covered by
 *           flows/18-producer-register-wizard.spec.ts.
 * Touches:  no backend. GET /auth/me, GET /categories and
 *           POST /auth/register/producer are all route-mocked, and the session
 *           token is seeded via addInitScript — so this spec runs on the
 *           DEFAULT CI E2E target (localhost:3000, no storageState fixtures),
 *           unlike flows/25 which needs DEMO_* provisioning.
 * Related:  RegisterProducerClient.jsx (`submitted` gate guard + the
 *           STEP.CONFIRM success screen), __tests__/RegisterProducerClient.test.jsx
 *           (same invariant at the vitest layer, with mocks)
 * History:  MEH-1814 (creation)
 *
 * Locators are data-testid per docs/E2E-LOCATORS.md (MEH-495) so the locked
 * Hebrew copy can change without silently disarming the spec.
 */

const SHOT_DIR = "qa-artifacts/MEH-1814";

// 375px — the narrowest phone we design for; the ticket pins self-QA to it.
test.use({ viewport: { width: 375, height: 812 } });

/**
 * Seeds a logged-in session and mocks every endpoint the page touches.
 * `roleRef.current` is what GET /auth/me reports, so a test can flip the role
 * mid-flight exactly the way the real upgrade does.
 */
async function stubSession(page, roleRef: { current: string }) {
  await page.addInitScript(() => {
    localStorage.setItem("token", "e2e-token");
  });
  await page.route("**/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        email: "seller@mehamakor.online",
        name: "בעלת עסק",
        role: roleRef.current,
      }),
    }),
  );
  // Auth boot calls ensureFavoritesLoaded(); keep it from hitting the network.
  await page.route("**/favorites**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/categories", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      // id 1 mirrors flows/18: a license-required category, so the MEH-952
      // inline license gate is exercised rather than bypassed.
      body: JSON.stringify([
        { id: 1, name: "חלב וגבינות" },
        { id: 2, name: "לחמים ואפייה" },
      ]),
    }),
  );
}

test.describe("MEH-1814 — post-submit success state owns the render", () => {
  test("upgrade submit lands on the success screen, not the early gate", async ({ page }) => {
    // Starts as a consumer: the wizard is legitimately reachable.
    const roleRef = { current: "consumer" };
    await stubSession(page, roleRef);

    await page.route("**/auth/register/producer", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      // THE REGRESSION CONDITION: a successful upgrade flips the role, and the
      // component's refreshUser() re-reads /auth/me. Without the `submitted`
      // guard the gate then outranks the success screen on the next render.
      roleRef.current = "producer";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "upgraded-token", whatsapp_sent: true }),
      });
    });

    await page.goto("/register/producer");
    await page.getByTestId("register-preflight-start").click();

    // Upgrade path skips ACCOUNT — the token puts step at DETAILS.
    await expect(page.getByTestId("register-frame-details")).toBeVisible();
    await page.getByTestId("register-details-name").fill("העסק שלי");
    await page.getByTestId("register-details-phone").fill("0501234567");
    await page.getByTestId("register-details-city").getByRole("combobox").fill("תל אביב");
    await page.getByTestId("register-details-address").fill("הרצל 1");
    await page.getByTestId("register-details-next").click();

    await expect(page.getByTestId("register-frame-category")).toBeVisible();
    await page.getByTestId("category-chip-1").click();
    await page.getByTestId("register-category-license").fill("1234567");
    await page.getByTestId("register-category-next").click();

    await expect(page.getByTestId("register-frame-story")).toBeVisible();
    await page.getByTestId("register-story-tagline").fill("הכי טרי שיש");
    await page.getByTestId("register-referral-source").selectOption("instagram");
    for (const cb of await page.getByTestId("register-frame-story").getByRole("checkbox").all()) {
      await cb.check();
    }
    // The bug produced a *later* render — the one after refreshUser() lands the
    // flipped role — so an assertion that fires the instant CONFIRM mounts could
    // pass on broken code. Arm the waiter BEFORE the click so it resolves on the
    // refreshUser() call specifically (the boot /auth/me has long since
    // resolved), giving a deterministic "the role has now flipped" signal
    // instead of an arbitrary sleep.
    const roleFlipped = page.waitForResponse(
      (r) => r.url().includes("/auth/me") && r.request().method() === "GET",
      { timeout: 15_000 },
    );
    await page.getByTestId("register-story-submit").click();

    // ── The assertion this spec exists for ──
    const success = page.getByTestId("register-success-pending");
    await expect(success).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("register-success-dashboard-cta")).toBeVisible();
    // The gate must be absent, not merely "behind" the success screen.
    await expect(page.getByTestId("register-producer-gate")).toHaveCount(0);

    // Re-assert once the flipped role is provably in the auth context.
    await roleFlipped;
    await expect(success).toBeVisible();
    await expect(page.getByTestId("register-producer-gate")).toHaveCount(0);

    await page.screenshot({ path: `${SHOT_DIR}/success-375.png`, fullPage: true });
  });

  test("existing producer hits the gate at mount and cannot reach the form", async ({ page }) => {
    const roleRef = { current: "producer" };
    await stubSession(page, roleRef);

    await page.goto("/register/producer");

    await expect(page.getByTestId("register-producer-gate")).toBeVisible();
    // Form unreachable: no pre-flight CTA, no wizard frame, no hero pitch.
    await expect(page.getByTestId("register-preflight-start")).toHaveCount(0);
    await expect(page.getByTestId("register-frame-details")).toHaveCount(0);
    await expect(page.getByTestId("register-hero-heading")).toHaveCount(0);

    await page.screenshot({ path: `${SHOT_DIR}/gate-375.png`, fullPage: true });
  });
});
