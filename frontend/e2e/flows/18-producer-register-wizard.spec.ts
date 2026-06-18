import { test, expect } from "@playwright/test";

/**
 * MEH-866 — producer-register wizard end-to-end (the rendered flow).
 *
 * // MEH-360: verify on preview — Playwright is blocked in the CC sandbox
 * (envoy denies *.up.railway.app + the Vercel preview). This spec is WRITTEN,
 * not run here; it runs against the Vercel preview deploy in CI / by Sapir.
 *
 * Complements the vitest layer (__tests__/RegisterProducerClient.test.jsx),
 * which already pins nav + submit-body shape + char-count with mocks. This
 * spec drives the REAL rendered 5-frame wizard (MEH-847 nav · MEH-853
 * city/address · MEH-860 tagline) from ACCOUNT → CONFIRM and asserts the
 * non-upgrade success state. No overlap with MEH-830 (CategorySelector).
 *
 * Selectors come from he.json (frozen producer-register strings), queried by
 * placeholder / role — no invented copy, no new production testid.
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
    await page.getByPlaceholder("שם מלא *").fill("טסט בדיקה");
    await page.getByPlaceholder("אימייל *").fill(`wizard+${Date.now()}@mehamakor.online`);
    await page.getByPlaceholder("סיסמה *").fill("Abcdefgh1234"); // ≥12 (passwordValid)
    await page.getByRole("button", { name: "הבא →" }).click();

    // ── DETAILS (frame 01) — producer_name + phone + city + address ──
    await page.getByPlaceholder("שם העסק *").fill("העסק שלי");
    await page.getByPlaceholder("טלפון WhatsApp * (0501234567)").fill("0501234567");
    await page.getByPlaceholder("יישוב").fill("תל אביב"); // CitySearch input
    await page.getByPlaceholder("כתובת").fill("הרצל 1");
    await page.getByRole("button", { name: "הבא →" }).click();

    // ── CATEGORY (frame 02) — pick the first popular card (non-agricultural) ──
    await page.getByText("חלב וגבינות").click();
    await page.getByRole("button", { name: "הבא →" }).click();

    // ── STORY (frame 03) — tagline (short_description) + declarations ──
    await page.getByPlaceholder("מה שהכי חשוב שידעו עליך").fill("הכי טרי שיש");
    // ToS + binding declaration (non-agri → no farmer checkbox). Check all shown.
    for (const cb of await page.getByRole("checkbox").all()) {
      await cb.check();
    }
    await page.getByRole("button", { name: "הצטרפי →" }).click();

    // ── CONFIRM (frame, non-upgrade) — inbox-check success state ──
    await expect(page.getByText(/בדקי/)).toBeVisible({ timeout: 10_000 });
  });
});
