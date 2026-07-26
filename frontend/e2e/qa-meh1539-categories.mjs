/**
 * MEH-1539 T3 self-QA — owner settings categories card (CategorySelector swap).
 *
 * Drives the REAL /he/producer/dashboard/edit page in Chromium against a
 * `next start` server, with every /api/** call fulfilled from fixtures (the CC
 * sandbox has no backend and cannot reach Railway — CLAUDE.md "Known Bug
 * Patterns"). Captures 375px + 1440px and exercises select → deselect → save,
 * asserting the PUT body is the category_ids contract.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh1539-categories.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

// Repo-root qa-artifacts/ (the path the MEH-1156 size-cap gate scans).
const OUT = "../qa-artifacts/MEH-1539";
const BASE = process.env.QA_BASE_URL || "http://localhost:3100";

const CATEGORIES = [
  { id: 1, name: "חלב וגבינות" },
  { id: 2, name: "לחמים ואפייה" },
  { id: 3, name: "בשר" },
  { id: 4, name: "שמנים" },
  { id: 5, name: "ירקות" },
  { id: 6, name: "סבונים טבעיים" },
  { id: 7, name: "ביצים" },
  { id: 8, name: "פירות" },
  { id: 9, name: "דבש" },
  { id: 10, name: "דגים" },
  { id: 11, name: "מותססים וכבושים" },
  { id: 12, name: "קוסמטיקה טבעית" },
];

const PROFILE = {
  id: 42,
  name: "מאפיית שדה",
  is_approved: true,
  categories: [{ id: 2, name: "לחמים ואפייה" }],
  products: [],
  images: [],
  has_physical_location: true,
  offers_delivery: false,
};

const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה" };

const puts = [];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  // The sandbox ships chromium-1194; this @playwright/test pins 1228. Point at
  // the installed binary rather than downloading (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD).
  const browser = await chromium.launch({
    executablePath:
      process.env.QA_CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });

  for (const [label, width, height] of [["375", 375, 812], ["1440", 1440, 1000]]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      locale: "he-IL",
      timezoneId: "Asia/Jerusalem",
      reducedMotion: "reduce",
    });

    await ctx.route("**/*", async (route) => {
      const req = route.request();
      const url = req.url();
      if (!url.includes("/api/")) return route.continue();
      const path = new URL(url).pathname.replace(/^\/api/, "");

      if (req.method() === "PUT" && path === "/producers/me") {
        puts.push(JSON.parse(req.postData() || "{}"));
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
      // Unknown endpoints default to [] — the dashboard's remaining reads are
      // all collections; an object default trips `o?.map is not a function`.
      const body =
        path === "/auth/me" ? USER
        : path === "/categories" ? CATEGORIES
        : path === "/producers/me" ? PROFILE
        : path === "/producers/me/dashboard" ? { producer: PROFILE }
        : path === "/producers/me/analytics" ? {}
        : [];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });

    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem("token", "qa-fixture-token"));
    // localePrefix: "as-needed" — /he/* redirects to the bare path.
    await page.goto(`${BASE}/producer/dashboard/edit?group=profile`, { waitUntil: "networkidle" });

    // Open the categories accordion.
    await page.getByRole("button", { name: /קטגוריות/ }).first().click();
    await page.getByTestId("category-chip-1").waitFor({ state: "visible" });
    await page.waitForTimeout(400);
    await page.locator("#categories").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/categories-${label}-1-rest.png`, fullPage: false });

    // Search state (proves the MEH-1354 desc lines + filter reached this surface).
    await page.getByPlaceholder("לדוגמה: גבינה, לחם, סבון").fill("דבש");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/categories-${label}-2-search.png`, fullPage: false });
    await page.getByPlaceholder("לדוגמה: גבינה, לחם, סבון").fill("");
    await page.waitForTimeout(300);

    // Select two more → 3/3, cap reached (MEH-1297).
    await page.getByTestId("category-chip-1").click();
    await page.getByTestId("category-chip-5").click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/categories-${label}-3-cap-reached.png`, fullPage: false });

    const counter = (await page.getByTestId("category-counter").textContent())?.trim();
    const capDisabled = await page.getByTestId("category-chip-3").isDisabled();

    // Deselect one, then save.
    await page.getByTestId("category-chip-5").click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "שמירת קטגוריות" }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/categories-${label}-4-saved.png`, fullPage: false });

    console.log(`[${label}] counter=${counter} capDisabledAt3=${capDisabled}`);
    await ctx.close();
  }

  console.log("PUT bodies:", JSON.stringify(puts));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
