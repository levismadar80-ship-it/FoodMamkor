/**
 * MEH-1940 — capture the same-town save error at 375 and 1440, each WITH the
 * cookie banner (first-visit state) and without it.
 *
 * LOCAL ONLY: next start + uvicorn + local postgres. Not staging.
 *
 * The banner state is the variable under test, so each combination gets a
 * FRESH browser context — carrying one page across `goto()`s is what makes a
 * "first visit" quietly stop being one.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

const BASE = "http://127.0.0.1:3000";
const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

const results = [];

for (const vp of VIEWPORTS) {
  for (const withBanner of [true, false]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      locale: "he-IL",
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/he/login`, { waitUntil: "networkidle" });
    await page.getByLabel(/אימייל|דוא/i).first().fill("meh1940@example.com");
    await page.locator('input[type="password"]').first().fill("Test12345!");
    await page.getByRole("button", { name: /התחבר|כניסה|היכנס/ }).first().click();
    await page.waitForTimeout(2500);

    await page.goto(`${BASE}/he/producer/dashboard/edit`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // The ONLY difference between the two runs.
    if (!withBanner) {
      const accept = page.getByRole("button", { name: /קבלו הכל/ }).first();
      if (await accept.count()) {
        await accept.click();
        await page.waitForTimeout(600);
      }
    }

    const section = page.getByText("מיקום, משלוחים ושעות").first();
    await section.scrollIntoViewIfNeeded();
    await section.click({ force: withBanner });
    await page.waitForTimeout(1200);
    const sub = page.getByRole("button", { name: /^מיקומים/ }).first();
    await sub.scrollIntoViewIfNeeded();
    await sub.click({ force: withBanner });
    await page.waitForTimeout(1200);

    const addBtn = page
      .getByRole("button", { name: /הוסיפו מיקום|הוספת מיקום|\+ הוסיפו/ })
      .first();
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click({ force: withBanner });
    await page.waitForTimeout(800);

    // Same town as the row that already exists, deliberately WITHOUT a תווית.
    await page.locator('[data-testid="location-city-field"] input').first().fill("זכרון יעקב");
    await page.waitForTimeout(1000);
    await page.keyboard.press("Escape");

    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/producers/me/locations") &&
          r.request().method() === "POST",
      ),
      page.getByTestId("location-save").click({ force: withBanner }),
    ]);
    await page.waitForTimeout(900);

    // The discriminating measurement: is the message INSIDE the form, and is
    // the bottom strip clear? A screenshot alone cannot prove the second half.
    const probe = await page.evaluate(() => {
      const box = document.querySelector('[data-testid="location-form-error"]');
      const form = document.querySelector('[data-testid="location-form"]');
      const banner = [...document.querySelectorAll("*")].find((el) =>
        el.textContent?.includes("אנחנו משתמשים בעוגיות") &&
        el.children.length < 8 &&
        getComputedStyle(el).position === "fixed",
      );
      return {
        inlineErrorPresent: Boolean(box),
        insideForm: Boolean(box && form && form.contains(box)),
        role: box?.getAttribute("role") ?? null,
        text: box?.textContent?.trim().slice(0, 120) ?? null,
        cookieBannerVisible: Boolean(banner),
        // Any toast still rendering would live here.
        toastCount: document.querySelectorAll("[data-sonner-toast]").length,
      };
    });

    const label = `${vp.name}-${withBanner ? "with" : "no"}-cookie-banner`;
    await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: false });
    results.push({ label, status: resp.status(), ...probe });
    await ctx.close();
  }
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
