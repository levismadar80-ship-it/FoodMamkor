import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Spec:     manual/register-wizard-upgrade
 * Purpose:  Converted from docs/MANUAL_TESTING.md § "MEH-853 — /register/producer
 *           frame 01 (DETAILS): city + address" (MEH-1171 conversion stage).
 *           Closes the matrix-flagged upgrade-path gap: the vitest layer asserts
 *           the submit body on the NEW-registration path only
 *           (RegisterProducerClient.test.jsx:139) — the shared-body-above-
 *           !isUpgrade claim for logged-in upgraders was trust-the-code.
 * Touches:  GET /cities read only (real). Auth state + the register POST are
 *           route-mocked for WRITE avoidance — registering a real producer on
 *           the CI backend is destructive (same precedent as spec 18's own
 *           register-POST mock; Sapir 13/07: destructive writes never hit
 *           Railway staging).
 * Does NOT: exercise the new-registration path (spec 18's territory) or the
 *           OAuth 409 branch (10-producer-oauth-409's territory).
 * History:  MEH-1171 (creation).
 */

// REUSES: 18-producer-register-wizard.spec.ts — testid walk + category mock
// (id 1 = license-required "חלב וגבינות" so the license gate is exercised too).
const CONSUMER_ME = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "upgrade-e2e@example.com",
  name: "משדרגת בדיקה",
  role: "consumer",
  is_oauth: true, // the checklist leg is "OAuth lands on DETAILS" — an
  // authenticated session, however obtained, must skip the account frame
  is_producer: false,
};

const mockAuthenticatedConsumer = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem("cookieConsent", "essential");
    // step init reads token presence synchronously (RegisterProducerClient.jsx:86-93)
    localStorage.setItem("token", "e2e-upgrade-token");
  });
  await page.route("**/auth/me", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(CONSUMER_ME),
    }),
  );
  // ensureFavoritesLoaded fires right after /auth/me resolves; with a mocked
  // token the real backend would 401 it and the MEH-156 auth:expired
  // interceptor (lib/api.js:39) would null the user mid-test — mock it empty.
  await page.route("**/users/me/favorites", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/categories", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: 1, name: "חלב וגבינות" },
        { id: 2, name: "לחמים ואפייה" },
      ]),
    }),
  );
};

test.describe("/register/producer upgrade path (MEH-853 frame 01)", () => {
  // MANUAL_TESTING § MEH-853 frame 01 item 5 — the OAuth/authenticated
  // regression leg: an existing session lands on DETAILS, never on ACCOUNT
  // (the other two freeze legs — declarations gate + license field — are
  // vitest-covered per the matrix: RegisterProducerClient.test.jsx:199,253)
  test("an authenticated user lands on DETAILS — the account frame is skipped", async ({ page }) => {
    await mockAuthenticatedConsumer(page);
    await page.goto("/register/producer");
    await page.getByTestId("register-preflight-start").click();
    await expect(page.getByTestId("register-frame-details")).toBeVisible();
    await expect(page.getByTestId("register-frame-account")).toHaveCount(0);
  });

  // MANUAL_TESTING § MEH-853 frame 01 item 4 — city+address ride the submit
  // body on the UPGRADE path too (and the account trio must NOT be sent)
  test("upgrade submit body carries city + address and no account fields", async ({ page }) => {
    await mockAuthenticatedConsumer(page);
    let submitBody: Record<string, unknown> | null = null;
    await page.route("**/auth/register/producer", (route: Route) => {
      if (route.request().method() !== "POST") return route.continue();
      submitBody = route.request().postDataJSON();
      // access_token in the response = the genuine upgrade result shape
      // (didUpgrade branches on the response, not the frontend flag — MEH-328 D)
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "e2e-upgraded-token",
          token_type: "bearer",
          whatsapp_sent: true,
        }),
      });
    });

    await page.goto("/register/producer");
    await page.getByTestId("register-preflight-start").click();

    // DETAILS (starts here — upgrade path)
    await page.getByTestId("register-details-name").fill("העסק המשודרג");
    await page.getByTestId("register-details-phone").fill("0501234567");
    await page.getByTestId("register-details-city").getByRole("combobox").fill("תל אביב");
    await page.getByTestId("register-details-address").fill("הרצל 1");
    await page.getByTestId("register-details-next").click();

    // CATEGORY — license-required mock category, fill the gated number
    await page.getByTestId("category-chip-1").click();
    await page.getByTestId("register-category-license").fill("1234567");
    await page.getByTestId("register-category-next").click();

    // STORY — tagline + every shown declaration/ToS checkbox
    await page.getByTestId("register-story-tagline").fill("הכי טרי שיש");
    for (const cb of await page.getByTestId("register-frame-story").getByRole("checkbox").all()) {
      await cb.check();
    }
    await page.getByTestId("register-story-submit").click();

    // register-frame-confirm is the NON-upgrade branch's testid only — the
    // didUpgrade success screen carries no testid (zero-app-edits: can't add
    // one), so assert the upgrade branch by its own heading. This is also the
    // stronger check: it proves the UPGRADE branch rendered (access_token in
    // the response → didUpgrade), not just any confirm screen.
    await expect(
      page.getByRole("heading", { name: "קיבלנו את הפרטים שלך" }),
    ).toBeVisible({ timeout: 10_000 });
    expect(submitBody, "register POST was not captured").not.toBeNull();
    const body = submitBody as unknown as Record<string, unknown>;
    expect(body.city).toBe("תל אביב");
    expect(body.address).toBe("הרצל 1");
    // MEH-143: logged-in users upgrade — account fields must be absent
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("password");
    expect(body).not.toHaveProperty("name");
  });

  // MANUAL_TESTING § MEH-853 frame 01 item 1 — CitySearch contract inside the
  // wizard: dropdown select fills, the ✕ button clears (select-fills is also
  // guarded on /map by manual/city-search.spec.ts; the ✕ leg lives only here)
  test("the city ✕ button clears a dropdown-selected city", async ({ page }) => {
    await mockAuthenticatedConsumer(page);
    await page.goto("/register/producer");
    await page.getByTestId("register-preflight-start").click();

    const city = page.getByTestId("register-details-city").getByRole("combobox");
    await city.fill("זכ");
    await page.getByRole("option", { name: "זכרון יעקב" }).first().click();
    await expect(city).toHaveValue("זכרון יעקב");

    await page.getByTestId("register-details-city").getByRole("button", { name: "נקה עיר" }).click();
    await expect(city).toHaveValue("");
  });
});
