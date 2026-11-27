import { test, expect } from "./_cloudinary-stub";

// MEH-3927: the site has no dark mode, so the root declares `color-scheme:
// only light`. That is what stops Chrome's Auto Dark Theme from inverting the
// cream page on a phone in dark mode. The test reads the computed value with
// the browser asking for dark, so it goes red if the declaration is removed
// or overridden anywhere in the cascade.
test.use({ colorScheme: "dark" });

test("the root opts out of forced dark mode", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
  const scheme = await page.evaluate(
    () => getComputedStyle(document.documentElement).colorScheme,
  );
  // Chromium serialises it "light only", the spec's order is "only light":
  // compare the keyword set, not the string.
  expect(scheme.split(/\s+/).sort()).toEqual(["light", "only"]);
});
