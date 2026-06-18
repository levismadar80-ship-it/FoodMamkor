import { test, expect } from "@playwright/test";

/**
 * MEH-866 — producer-register wizard end-to-end (the rendered flow).
 *
 * Selectors are `data-testid`-based per docs/E2E-LOCATORS.md (MEH-495):
 * new E2E specs locate via getByTestId so Hebrew copy / i18n sweeps can't
 * silently break them. The matching testids were added to the wizard frames
 * in this same PR (RegisterProducerClient.jsx — testid-only, additive).
 *
 * // MEH-360: this spec RUNS on the Vercel preview deploy (in CI / by Sapir),
 * not in the CC sandbox — envoy denies the preview + *.up.railway.app there.
 *
 * Complements the vitest layer (__tests__/RegisterProducerClient.test.jsx),
 * which pins nav + submit-body shape + char-count with mocks. This spec drives
 * the REAL rendered 5-frame wizard (MEH-847 nav · MEH-853 city/address ·
 * MEH-860 tagline) from ACCOUNT → CONFIRM and asserts the non-upgrade success
 * state. No overlap with MEH-830 (CategorySelector — its card is the one
 * locator kept name-based below: it's a DB seed category, not frozen UI copy,
 * and the component is out of this ticket's scope).
 */

const REGISTER_POST = "**/auth/register/producer";

test.describe("Producer register wizard (5-frame)", () => {
  test.beforeEach(async ({ page }) => {
    // Categories for the CATEGORY frame (CategorySelector → GET /categories).
    await page.route("**/categories", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: 1, name: "חלב וגבינות" },
          { id: 2, name: "לחמים ואפייה" },
        ]),
      }),
    );
    // Non-upgrade ack: 200 with NO access_token → STORY submit → CONFIRM
    // (inbox-check screen, didUpgrade === false).
    await page.route(REGISTER_POST, (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ whatsapp_sent: true }),
      });
    });
  });

  test("ACCOUNT → DETAILS → CATEGORY → STORY → CONFIRM (new-registration path)", async ({ page }) => {
    await page.goto("/register/producer");

    // ── ACCOUNT ──
    await expect(page.getByTestId("register-frame-account")).toBeVisible();
    await page.getByTestId("register-account-name").fill("טסט בדיקה");
    await page.getByTestId("register-account-email").fill(`wizard+${Date.now()}@mehamakor.online`);
    await page.getByTestId("register-account-password").fill("Abcdefgh1234"); // ≥12 (passwordValid)
    await page.getByTestId("register-account-next").click();

    // ── DETAILS (frame 01) — producer_name + phone + city + address ──
    await expect(page.getByTestId("register-frame-details")).toBeVisible();
    await page.getByTestId("register-details-name").fill("העסק שלי");
    await page.getByTestId("register-details-phone").fill("0501234567");
    // city: CitySearch (out of scope) owns the input; testid is on the parent
    // wrapper, so reach the role="combobox" input inside it.
    await page.getByTestId("register-details-city").getByRole("combobox").fill("תל אביב");
    await page.getByTestId("register-details-address").fill("הרצל 1");
    await page.getByTestId("register-details-next").click();

    // ── CATEGORY (frame 02) — pick the first popular card (non-agricultural) ──
    // CategorySelector card is name-based (DB seed category, not UI copy),
    // scoped under the frame testid. MEH-830 owns the component.
    await expect(page.getByTestId("register-frame-category")).toBeVisible();
    await page.getByTestId("register-frame-category").getByText("חלב וגבינות").click();
    await page.getByTestId("register-category-next").click();

    // ── STORY (frame 03) — tagline (short_description) + declarations ──
    await expect(page.getByTestId("register-frame-story")).toBeVisible();
    await page.getByTestId("register-story-tagline").fill("הכי טרי שיש");
    // ToS + binding declaration (non-agri → no farmer checkbox). Check all shown.
    for (const cb of await page.getByTestId("register-frame-story").getByRole("checkbox").all()) {
      await cb.check();
    }
    await page.getByTestId("register-story-submit").click();

    // ── CONFIRM (frame, non-upgrade) — inbox-check success state ──
    // testid assertion (not getByText) so the /בדקי/ heading-vs-body
    // strict-mode ambiguity can't resurface on copy edits.
    await expect(page.getByTestId("register-frame-confirm")).toBeVisible({ timeout: 10_000 });
  });
});
