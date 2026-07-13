import { test, expect } from "@playwright/test";

/**
 * Spec:     manual/legal-pages
 * Purpose:  Converted from docs/MANUAL_TESTING.md § "Legal pages (אפריל 2026)"
 *           (MEH-1171 conversion stage, matrix-approved 13/07). Pins the legal
 *           surfaces' load-bearing content: privacy (תיקון 13 + processors),
 *           terms (רישוי עסקים + 18), accessibility statement, footer legal
 *           links, cookie-banner consent flow, contact-form success state,
 *           and the directory disclaimer on the producer page.
 * Touches:  Read-only pages + a route-MOCKED POST /api/contact (never a real
 *           write — DB row / email / 429 / fail-open are items 4-7, owned by
 *           pytest + the Tier-3 list, not this spec).
 * Does NOT: test the producer-registration declarations gate (item 12 —
 *           coverage check vs 18-producer-register-wizard pending) or the
 *           neighbor grid (item 14 — STALE, route removed per approved matrix).
 * History:  MEH-1171 (creation).
 *
 * Doc-stale notes recorded in docs/qa/conversion-progress.md:
 *   - item 3's toast copy ("תודה! נחזור אליך בקרוב 🌿") predates the current
 *     success block (contact.success_title, emoji removed by Emoji LOCK v2);
 *     assertions use the LIVE copy per the runtime-verification rule.
 *   - item 9 expects 4 footer links incl. קשר — the footer redesign kept 3
 *     legal links (terms/privacy/accessibility); asserted as shipped.
 */

// MANUAL_TESTING § Legal pages item 1
test("privacy policy carries תיקון 13 and the named processors", async ({ page }) => {
  await page.goto("/privacy");
  const main = page.locator("main");
  await expect(main).toContainText("תיקון 13");
  await expect(main).toContainText("Cloudinary");
  await expect(main).toContainText("Google");
});

// MANUAL_TESTING § Legal pages item 2
test("terms carry חוק רישוי עסקים and the 18+ clause", async ({ page }) => {
  await page.goto("/terms");
  const main = page.locator("main");
  await expect(main).toContainText("חוק רישוי עסקים");
  await expect(main).toContainText("18");
});

// MANUAL_TESTING § Legal pages item 3 (POST mocked — success STATE contract only)
test("contact form submit shows the success state", async ({ page }) => {
  await page.route("**/api/contact", (route) =>
    route.fulfill({ status: 200, json: { ok: true } }),
  );
  await page.goto("/contact");
  await page.getByLabel("שם מלא *").fill("בודקת אוטומטית");
  // exact label — the footer newsletter input also matches /אימייל/
  await page.getByLabel("אימייל *", { exact: true }).fill("qa@example.com");
  await page.getByLabel("איך נוכל לעזור? *").fill("בדיקת טופס — התעלמו");
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByText("תודה! קיבלנו את הפנייה.")).toBeVisible();
});

// MANUAL_TESTING § Legal pages item 8
test("accessibility statement carries an update date and the coordinator's contact", async ({ page }) => {
  await page.goto("/accessibility");
  const main = page.locator("main");
  // live copy: "ההצהרה עודכנה לאחרונה: {חודש שנה}" (checklist's "תאריך עדכון" phrasing is the doc's, not the page's)
  await expect(main).toContainText("עודכנה לאחרונה");
  await expect(main).toContainText("ספיר שנפ"); // named coordinator (MEH-1074)
});

// MANUAL_TESTING § Legal pages item 9 (as shipped: 3 legal links; קשר dropped in the footer redesign)
test("footer carries the terms / privacy / accessibility legal links", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "תנאי שימוש" })).toHaveAttribute("href", /\/terms$/);
  await expect(footer.getByRole("link", { name: "פרטיות" })).toHaveAttribute("href", /\/privacy$/);
  await expect(footer.getByRole("link", { name: "הצהרת נגישות" })).toHaveAttribute("href", /\/accessibility$/);
});

// MANUAL_TESTING § Legal pages items 10 + 11
test("cookie banner shows both consent buttons; רק הכרחיים dismisses and persists", async ({ page }) => {
  await page.goto("/");
  const acceptAll = page.getByRole("button", { name: "קבלו הכל" });
  const essentialOnly = page.getByRole("button", { name: "רק הכרחיים" });
  await expect(acceptAll).toBeVisible(); // item 10 — fresh context = private window
  await expect(essentialOnly).toBeVisible();

  await essentialOnly.click(); // item 11
  await expect(essentialOnly).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("cookieConsent")))
    .toBe("essential");

  await page.reload();
  await expect(page.getByRole("button", { name: "קבלו הכל" })).toBeHidden();
});

// MANUAL_TESTING § Legal pages item 13
test("directory disclaimer renders on the producer page above the report action", async ({ page }) => {
  const producers = await (await page.request.get("/api/producers")).json();
  test.skip(!Array.isArray(producers) || producers.length === 0, "no approved producers served");
  await page.goto(`/producer/${producers[0].id}`);
  const disclaimer = page.getByText("היא פלטפורמה", { exact: false }).first();
  await expect(disclaimer).toBeVisible();
  // Disclaimer sits ABOVE the report action in the page flow.
  const report = page.getByRole("button", { name: /דיווח|דווח/ }).first();
  if (await report.count()) {
    const [d, r] = [await disclaimer.boundingBox(), await report.boundingBox()];
    expect(d && r && d.y < r.y).toBe(true);
  }
});
