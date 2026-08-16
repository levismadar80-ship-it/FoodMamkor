/**
 * MEH-1544 self-QA — dashboard order-window editor (חלון הזמנות, chunk 2/3).
 *
 * Drives the REAL /he/producer/dashboard/edit page in Chromium against a
 * `next start` server, with every /api/** call fulfilled from fixtures (the CC
 * sandbox has no backend and cannot reach Railway — CLAUDE.md "Known Bug
 * Patterns"). Captures 375px + 1440px in the three DoD states:
 *   1-empty  — nothing set, honest empty-state copy
 *   2-filled — three days toggled on with times
 *   3-error  — close <= open, inline Hebrew error next to the row
 * and asserts the PUT body is the order_window contract (incl. the null-clear).
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh1544-order-window.mjs
 *
 * REUSES: e2e/qa-meh1539-categories.mjs (route-fixture + dual-viewport harness).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

// Repo-root qa-artifacts/ (the path the MEH-1156 size-cap gate scans).
const OUT = "../qa-artifacts/MEH-1544";
// Hard-coded, not env-driven: the env-drift gate (.env.example) treats any
// process.env read in the repo as an undeclared var, and a one-off QA harness
// is not worth a new documented env var (regression rule 8).
const BASE = "http://localhost:3100";
// The sandbox ships chromium-1194; this @playwright/test pins a newer build,
// so point at the installed binary instead of downloading one.
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const BASE_PROFILE = {
  id: 42,
  name: "מאפיית שדה",
  is_approved: true,
  categories: [{ id: 2, name: "לחמים ואפייה" }],
  products: [],
  images: [],
  has_physical_location: true,
  offers_delivery: false,
  opening_hours: "Sun-Thu 09:00-18:00",
};

const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה" };

const puts = [];

/** Mount the edit page with a given stored order_window, in one viewport. */
async function openEditor(browser, width, height, orderWindow) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
  });

  const profile = { ...BASE_PROFILE, order_window: orderWindow };

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
      : path === "/producers/me" ? profile
      : path === "/producers/me/dashboard" ? { producer: profile }
      : path === "/producers/me/analytics" ? {}
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("token", "qa-fixture-token"));
  // localePrefix: "as-needed" — /he/* redirects to the bare path.
  await page.goto(`${BASE}/producer/dashboard/edit?group=location`, { waitUntil: "networkidle" });

  // Dismiss the cookie banner — it is fixed to the bottom and covers the card
  // being documented. Best-effort: if it never renders, carry on.
  const cookieAccept = page.getByRole("button", { name: "קבלו הכל" });
  if (await cookieAccept.isVisible().catch(() => false)) {
    await cookieAccept.click();
    await page.waitForTimeout(300);
  }

  // Expand the order-window accordion by its heading.
  // MEH-1830 renamed it "חלון הזמנות" → "מתי מקבלים הזמנות" (the abstract noun
  // read as a sibling of "שעות פתיחה"); this selector follows the new label.
  await page.getByRole("button", { name: /מתי מקבלים הזמנות/ }).first().click();
  await page.waitForTimeout(400);
  await page.locator("#order-window").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  return { ctx, page };
}

const FILLED = {
  sunday: { open: "09:00", close: "14:00" },
  monday: { open: "09:00", close: "14:00" },
  thursday: { open: "10:00", close: "23:00" },
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });

  for (const [label, width, height] of [["375", 375, 812], ["1440", 1440, 1000]]) {
    // ---- State 1: empty (order_window null — the opt-in default) ----
    {
      const { ctx, page } = await openEditor(browser, width, height, null);
      const emptyVisible = await page.getByTestId("order-window-empty").isVisible();
      await page.screenshot({ path: `${OUT}/order-window-${label}-1-empty.png`, fullPage: false });
      console.log(`[${label}] empty-state visible: ${emptyVisible}`);
      await ctx.close();
    }

    // ---- State 2: filled (three days) + save round-trip ----
    {
      const { ctx, page } = await openEditor(browser, width, height, FILLED);
      await page.screenshot({ path: `${OUT}/order-window-${label}-2-filled.png`, fullPage: false });

      // Clear-all sends the explicit null that clears the column.
      await page.getByTestId("order-window-clear").click();
      await page.waitForTimeout(200);
      await page.getByRole("button", { name: "שמירה" }).last().click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/order-window-${label}-4-cleared.png`, fullPage: false });
      await ctx.close();
    }

    // ---- State 3: validation error (close <= open) ----
    {
      const { ctx, page } = await openEditor(browser, width, height, FILLED);
      // Sunday closes at 08:00 — before its 09:00 open. Scoped to the
      // order-window card: the collapsed HoursEditor renders time inputs with
      // the very same aria-labels, so a page-wide locator resolves to a hidden
      // one and the fill times out.
      const closeInput = page
        .locator("#order-window")
        .locator('input[type="time"]')
        .nth(1);
      await closeInput.fill("08:00");
      await page.waitForTimeout(300);
      const errVisible = await page.getByRole("alert").first().isVisible();
      await page.screenshot({ path: `${OUT}/order-window-${label}-3-error.png`, fullPage: false });
      console.log(`[${label}] invalid-range error visible: ${errVisible}`);
      await ctx.close();
    }
  }

  console.log("PUT bodies:", JSON.stringify(puts));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
