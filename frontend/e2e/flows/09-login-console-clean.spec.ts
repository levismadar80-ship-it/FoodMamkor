import { test, expect } from "@playwright/test";

/**
 * MEH-274 regression guard — /login page must load without:
 *   1. Any POST to /auth/register/producer/oauth (producer endpoint leaked onto consumer page)
 *   2. GSI_LOGGER "initialize() called multiple times" warning
 *   3. apple-mobile-web-app-capable deprecation warning
 *
 * Root cause: GoogleAuthButton and ProducerOAuthButtons each called
 * google.accounts.id.initialize() independently. Fixed by useGoogleSignIn hook.
 */
test.describe("Login page console clean (MEH-274)", () => {
  test("no producer OAuth call on page load", async ({ page }) => {
    const producerOAuthCalls: string[] = [];

    page.on("request", (req) => {
      if (req.url().includes("/auth/register/producer/oauth")) {
        producerOAuthCalls.push(req.url());
      }
    });

    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    // Give GSI scripts a moment to fire any auto-triggers
    await page.waitForTimeout(2000);

    expect(producerOAuthCalls).toHaveLength(0);
  });

  test("no GSI double-init warning in console", async ({ page }) => {
    const gsiWarnings: string[] = [];

    page.on("console", (msg) => {
      if (
        msg.type() === "warning" &&
        msg.text().includes("initialize") &&
        msg.text().includes("multiple times")
      ) {
        gsiWarnings.push(msg.text());
      }
    });

    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    expect(gsiWarnings).toHaveLength(0);
  });

  test("no apple-mobile-web-app-capable deprecation warning", async ({ page }) => {
    const deprecationWarnings: string[] = [];

    page.on("console", (msg) => {
      if (msg.text().includes("apple-mobile-web-app-capable")) {
        deprecationWarnings.push(msg.text());
      }
    });

    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    expect(deprecationWarnings).toHaveLength(0);
  });
});
