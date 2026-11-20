/**
 * MEH-2264 self-QA — dashboard special-hours editor (שעות מיוחדות לחגים,
 * MEH-1889 chunk B) + the public schedule block's special layer.
 *
 * Drives the REAL pages in Chromium against a `next start` server on :3100,
 * with every /api/** call fulfilled from fixtures (the CC sandbox has no
 * backend). Captures 375px + 1440px in the DoD states:
 *   editor-1-empty   — nothing set: empty-state copy + holiday chips
 *   editor-2-chip    — after tapping the first chip: closed rows added, chip taken
 *   editor-3-filled  — stored overrides (one open with hours, one closed with note)
 *   editor-4-error   — duplicate date: inline refusal, no PUT sent
 *   page-schedule    — /producer/[id] schedule block with the special layer
 * and asserts the PUT body is the special_hours contract.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh2264-special-hours.mjs
 *
 * REUSES: e2e/qa-meh1544-order-window.mjs (route-fixture + dual-viewport harness).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2264";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const BASE_PROFILE = {
  id: 42,
  name: "מאפיית שדה",
  slug: "maafiyat-sade",
  status: "approved",
  is_approved: true,
  categories: [{ id: 2, name: "לחמים ואפייה" }],
  products: [],
  images: [],
  has_physical_location: true,
  offers_delivery: false,
  opening_hours: "Sun-Thu 09:00-18:00",
  order_window: {
    sunday: [{ open: "09:00", close: "14:00" }],
    monday: [{ open: "09:00", close: "14:00" }],
    thursday: [{ open: "09:00", close: "14:00" }],
  },
};

const FILLED = {
  "2026-09-11": { ranges: [{ open: "09:00", close: "13:00" }], note: "ערב ראש השנה" },
  "2026-09-21": { ranges: [], note: "יום כיפור" },
  "2026-08-01": { ranges: [] }, // past — must not render anywhere
};

const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה" };

// The public producer page is SERVER-rendered against the backend, so it is
// captured against a real local uvicorn on the test database, seeded with this
// id (see the PR body for the seed statement). Only the id is needed here.
const DETAIL = { id: "2e9aa40f-0000-4000-8000-000000000001" };

const puts = [];
const failures = [];
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

async function newCtx(browser, width, height, specialHours) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
  });
  const profile = { ...BASE_PROFILE, special_hours: specialHours };
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    if (req.method() === "PUT" && path === "/producers/me") {
      puts.push(JSON.parse(req.postData() || "{}"));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(profile) });
    }
    const body =
      path === "/auth/me" ? USER
      : path === "/producers/me" ? profile
      : path === "/producers/me/dashboard" ? { producer: profile }
      : path === "/producers/me/analytics" ? {}
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return ctx;
}

async function openEditor(browser, width, height, specialHours) {
  const ctx = await newCtx(browser, width, height, specialHours);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("token", "qa-fixture-token");
    localStorage.setItem("cookieConsent", "all");
  });
  await page.goto(`${BASE}/producer/dashboard/edit?group=location`, { waitUntil: "load" });
  await page.getByRole("button", { name: /שעות מיוחדות לחגים/ }).first().waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: /שעות מיוחדות לחגים/ }).first().click();
  await page.getByTestId("special-hours-editor").waitFor({ timeout: 10_000 });
  await page.locator("#special-hours").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  return { ctx, page };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });

  for (const [label, width, height] of [["375", 375, 812], ["1440", 1440, 1000]]) {
    // ---- 1: empty ----
    {
      const putsBefore = puts.length;
      const { ctx, page } = await openEditor(browser, width, height, null);
      check(`[${label}] empty state visible`, await page.getByTestId("special-hours-empty").isVisible());
      const chipCount = await page.locator('[data-testid^="special-hours-chip-"]').count();
      check(`[${label}] holiday chips offered`, chipCount > 0, `${chipCount} chips`);
      await page.screenshot({ path: `${OUT}/editor-${label}-1-empty.png` });

      // ---- 2: tap the first chip → rows added, chip taken, nothing saved ----
      const firstChip = page.locator('[data-testid^="special-hours-chip-"]').first();
      const chipName = (await firstChip.textContent())?.trim();
      await firstChip.click();
      await page.waitForTimeout(200);
      const rows = await page.getByTestId("special-hours-row").count();
      check(`[${label}] chip "${chipName}" added rows`, rows > 0, `${rows} rows`);
      check(`[${label}] chip reads taken`, await firstChip.isDisabled());
      check(`[${label}] chip tap did NOT save`, puts.length === putsBefore);
      await page.screenshot({ path: `${OUT}/editor-${label}-2-chip.png` });
      await ctx.close();
    }

    // ---- 3: stored overrides, past date dropped; save round-trip ----
    {
      const { ctx, page } = await openEditor(browser, width, height, FILLED);
      const dates = await page.getByTestId("special-hours-row").evaluateAll((els) => els.map((e) => e.dataset.date));
      check(`[${label}] past date dropped, ascending`, JSON.stringify(dates) === JSON.stringify(["2026-09-11", "2026-09-21"]), dates.join(","));
      check(`[${label}] open row shows its hours`, (await page.locator("#special-hours input[type=time]").count()) === 2);
      await page.screenshot({ path: `${OUT}/editor-${label}-3-filled.png` });

      // Toggle the closed row open → save → PUT carries the contract shape.
      await page.getByTestId("special-hours-closed-1").click();
      await page.waitForTimeout(150);
      await page.getByTestId("special-hours-save").click();
      await page.waitForTimeout(600);
      const last = puts[puts.length - 1];
      check(
        `[${label}] PUT body is the special_hours contract`,
        !!last?.special_hours?.["2026-09-21"] &&
          Array.isArray(last.special_hours["2026-09-21"].ranges) &&
          last.special_hours["2026-09-21"].ranges.length === 1 &&
          last.special_hours["2026-09-21"].note === "יום כיפור" &&
          !("2026-08-01" in last.special_hours),
        JSON.stringify(last),
      );
      check(`[${label}] success confirmation shown`, await page.getByTestId("special-hours-save-success").isVisible());
      await ctx.close();
    }

    // ---- 4: duplicate date → inline refusal, no PUT ----
    {
      const before = puts.length;
      const { ctx, page } = await openEditor(browser, width, height, FILLED);
      await page.getByTestId("special-hours-add-date").click();
      await page.getByTestId("special-hours-date-2").fill("2026-09-21");
      await page.getByTestId("special-hours-save").click();
      await page.waitForTimeout(300);
      check(`[${label}] duplicate date refused inline`, await page.getByRole("alert").first().isVisible());
      check(`[${label}] duplicate date sent no PUT`, puts.length === before);
      await page.screenshot({ path: `${OUT}/editor-${label}-4-error.png` });
      await ctx.close();
    }

    // ---- 5: public producer page — schedule block special layer ----
    // The producer page is rendered on the SERVER (next-start fetches
    // 127.0.0.1:8000 itself), so browser-side route fixtures cannot feed it.
    // This section runs against a REAL local backend (uvicorn :8000 on the
    // test database) seeded with the producer below — no interception.
    {
      const ctx = await browser.newContext({
        viewport: { width, height },
        locale: "he-IL",
        timezoneId: "Asia/Jerusalem",
        reducedMotion: "reduce",
      });
      const page = await ctx.newPage();
      await page.addInitScript(() => localStorage.setItem("cookieConsent", "all"));
      await page.goto(`${BASE}/producer/${DETAIL.id}`, { waitUntil: "load" });
      const block = page.getByTestId("order-window-schedule");
      const blockVisible = await block.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
      check(`[${label}] schedule block rendered`, blockVisible);
      if (blockVisible) {
        const special = page.getByTestId("order-window-special");
        const specialVisible = await special.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
        check(`[${label}] special layer rendered after mount`, specialVisible);
        const specialDates = await page.getByTestId("order-window-special-row").evaluateAll((els) => els.map((e) => e.dataset.date));
        check(`[${label}] special layer lists upcoming only`, JSON.stringify(specialDates) === JSON.stringify(["2026-09-11", "2026-09-21"]), specialDates.join(","));
        await block.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/page-${label}-schedule.png` });
      }
      await ctx.close();
    }
  }

  await browser.close();
  console.log(`\n${failures.length === 0 ? "ALL PASS" : `FAILURES: ${failures.length}`} · ${puts.length} PUT(s) recorded`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
