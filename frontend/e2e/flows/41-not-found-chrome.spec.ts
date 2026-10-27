import { test, expect } from "./_cloudinary-stub";
import he from "../../messages/he.json";
import en from "../../messages/en.json";

// MEH-2422: an unknown URL is served by app/global-not-found.js (MEH-918, a
// real HTTP 404). It used to be a bare standalone document — no header, no
// footer, its own font and background, and an English line under the Hebrew.
// It must keep the 404 status AND look like the rest of the site: the site
// header and footer around the message, in the locale of the path.
// Two segments on purpose: a single unknown segment is a candidate producer
// slug (app/[locale]/[slug]) and needs the API to resolve to a 404.
const cases = [
  { path: "/no-such-section/meh-2422", copy: he.errors.not_found, lang: "he", other: en.errors.not_found },
  { path: "/en/no-such-section/meh-2422", copy: en.errors.not_found, lang: "en", other: he.errors.not_found },
];

for (const c of cases) {
  test(`404 ${c.path}: real 404 status, site chrome, ${c.lang} copy only`, async ({ page }) => {
    const res = await page.goto(c.path);
    expect(res?.status()).toBe(404);
    await expect(page.locator("h1")).toHaveText(c.copy.heading, { timeout: 15_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", c.lang);
    // Site chrome: the shared header (its login link) and the shared footer.
    await expect(page.locator("header").first()).toBeVisible();
    await expect(page.getByTestId("footer-utility-links")).toHaveCount(1);
    // The other locale's sentence must not ride along.
    await expect(page.getByText(c.other.message)).toHaveCount(0);
    // One <main> landmark, and "home" stays in the path's locale.
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByRole("link", { name: c.copy.home })).toHaveAttribute("href", c.lang === "en" ? "/en" : "/");
  });
}
