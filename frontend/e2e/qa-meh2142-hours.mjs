/**
 * MEH-2142 self-QA — store hours move to the primary location (batch B3).
 *
 * Drives the REAL pages in Chromium against a `next start` server, with every
 * /api/** call fulfilled from fixtures (the CC sandbox has no backend and
 * cannot reach Railway — CLAUDE.md "Known Bug Patterns"). Captures 375px +
 * 1440px for the two surfaces the change touches:
 *
 *   business-page  1-from-location : primary location HAS hours → they render
 *                  2-fallback      : primary has none → legacy column renders
 *   dashboard      3-no-hours-card : the hours accordion is GONE from the
 *                                    location group; order-window remains
 *
 * The two business-page states are the point of the diff, so they are captured
 * as a PAIR: one screenshot showing hours could be either world.
 *
 * CONTROL — run first and read it. The harness asserts the expected string is
 * actually on the page in state 1; if the fixture never reached the component,
 * both captures would show an hours-less page and look like a clean result.
 * A capture harness that photographs an error boundary and exits 0 is a
 * documented failure of this repo's (PR #2786), so the assertions below are
 * what make the PNGs worth looking at.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh2142-hours.mjs
 *
 * REUSES: e2e/qa-meh1544-order-window.mjs (route-fixture + dual-viewport harness).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2142";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const LOCATION_HOURS = "Sun-Thu 08:00-16:00";
const LEGACY_HOURS = "Sun-Thu 09:00-18:00";

const USER = { id: 7, email: "demo-owner@example.com", role: "producer", name: "דנה" };

const BASE_PRODUCER = {
  id: 42,
  slug: "maafiat-sade",
  name: "מאפיית שדה",
  description: "מאפייה שכונתית",
  short_description: "לחם מחמצת",
  city: "חיפה",
  lat: 32.794,
  lng: 34.9896,
  status: "approved",
  is_approved: true,
  images: [],
  products: [],
  categories: [{ id: 2, name: "לחמים ואפייה" }],
  has_physical_location: true,
  offers_delivery: false,
  order_window: null,
};

function producerWith({ locationHours, legacyHours }) {
  return {
    ...BASE_PRODUCER,
    opening_hours: legacyHours,
    locations: [
      {
        kind: "branch",
        is_primary: true,
        city: "חיפה",
        lat: 32.794,
        lng: 34.9896,
        opening_hours: locationHours,
        phone: null,
        precision: "exact",
      },
    ],
  };
}

function routeApi(ctx, payloadFor) {
  return ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const body = payloadFor(path, req);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body ?? []),
    });
  });
}

async function newCtx(browser, width, height) {
  return browser.newContext({
    viewport: { width, height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
  });
}

async function dismissCookies(page) {
  const accept = page.getByRole("button", { name: "קבלו הכל" });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await page.waitForTimeout(300);
  }
}

/** Business page in one viewport, with a given hours arrangement. */
async function openBusinessPage(browser, width, height, arrangement) {
  const ctx = await newCtx(browser, width, height);
  const producer = producerWith(arrangement);
  await routeApi(ctx, (path) =>
    path === "/auth/me"
      ? USER
      : path.startsWith("/producers/") && !path.includes("/recipes")
        ? producer
        : [],
  );
  const page = await ctx.newPage();
  await page.goto(`${BASE}/producer/${producer.slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await dismissCookies(page);
  const section = page.locator("#section-location");
  await section.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);

  // EXPAND the weekly table before asserting or capturing.
  //
  // Not cosmetic — this is the fix for a real harness bug. `OpeningHours`
  // collapsed shows only TODAY's row (OpeningHours.jsx:72-79). The first run
  // of this harness fell on a FRIDAY and the fixture hours are "Sun-Thu …", so
  // the collapsed row correctly read «סגור» and BOTH states looked hours-less.
  // The assertions failed and the app was fine — exactly the "validate the
  // probe before trusting its red" case in .claude/rules/testing.md.
  //
  // Expanding also makes the screenshot worth reviewing: the whole week is the
  // thing a reader needs to see to tell the two states apart.
  const toggle = page.getByTestId("hours-toggle");
  if ((await toggle.count()) > 0) {
    await toggle.first().click();
    await page.waitForTimeout(300);
  }
  return { ctx, page };
}

/** Dashboard edit page, location group. */
async function openEditor(browser, width, height) {
  const ctx = await newCtx(browser, width, height);
  const profile = { ...BASE_PRODUCER, opening_hours: LEGACY_HOURS, locations: [] };
  await routeApi(ctx, (path) =>
    path === "/auth/me"
      ? USER
      : path === "/producers/me"
        ? profile
        : path === "/producers/me/dashboard"
          ? { producer: profile }
          : path === "/producers/me/analytics"
            ? {}
            : [],
  );
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("token", "qa-fixture-token"));
  await page.goto(`${BASE}/producer/dashboard/edit?group=location`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1500);
  await dismissCookies(page);
  return { ctx, page };
}

const failures = [];
const ran = [];

function check(name, condition, detail) {
  ran.push(name);
  if (!condition) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });

  for (const [label, width, height] of [
    ["375", 375, 812],
    ["1440", 1440, 1000],
  ]) {
    console.log(`\n=== ${label}px ===`);

    // ---- State 1: the primary location HAS hours → those render ----
    {
      const { ctx, page } = await openBusinessPage(browser, width, height, {
        locationHours: LOCATION_HOURS,
        legacyHours: LEGACY_HOURS,
      });
      const text = await page.locator("body").innerText();
      // CONTROL: if this is false the fixture never reached the component and
      // every other reading in this run is void.
      check(
        `[${label}] CONTROL: the location section rendered`,
        (await page.locator("#section-location").count()) > 0,
        "if this fails, ignore every result below",
      );
      // Second control, added after the Friday miss: the weekly table must be
      // OPEN. A collapsed card shows one day and can hide either fixture, so a
      // reading taken against it means nothing in either direction.
      check(
        `[${label}] CONTROL: the weekly hours table is expanded`,
        (await page.getByTestId("hours-week").count()) > 0,
        "collapsed shows today only — readings below would be void",
      );
      // 08:00–16:00 comes from the LOCATION; 09:00–18:00 only from the column.
      check(`[${label}] shows the location's 16:00 close`, text.includes("16:00"));
      check(
        `[${label}] does NOT show the legacy 18:00 close`,
        !text.includes("18:00"),
        "the legacy column must not win when the primary has hours",
      );
      await page.screenshot({
        path: `${OUT}/business-page-${label}-1-from-location.png`,
        fullPage: false,
      });
      await ctx.close();
    }

    // ---- State 2: the primary has NO hours → legacy column falls back ----
    {
      const { ctx, page } = await openBusinessPage(browser, width, height, {
        locationHours: null,
        legacyHours: LEGACY_HOURS,
      });
      const text = await page.locator("body").innerText();
      check(`[${label}] fallback shows the legacy 18:00 close`, text.includes("18:00"));
      check(
        `[${label}] fallback does NOT show the location's 16:00`,
        !text.includes("16:00"),
      );
      await page.screenshot({
        path: `${OUT}/business-page-${label}-2-fallback.png`,
        fullPage: false,
      });
      await ctx.close();
    }

    // ---- State 3: the dashboard hours card is gone ----
    {
      const { ctx, page } = await openEditor(browser, width, height);
      check(
        `[${label}] CONTROL: the location group rendered`,
        await page.getByTestId("group-location").count() > 0,
        "if this fails, ignore the absence assertion below",
      );
      // CONTROL for the absence: a card that DOES still exist in this group.
      // Without it, "no hours card" is satisfied by a page that rendered nothing.
      check(
        `[${label}] CONTROL: the order-window card is still present`,
        await page.getByRole("button", { name: /מתי מקבלים הזמנות/ }).count() > 0,
      );
      check(
        `[${label}] the hours accordion is GONE`,
        (await page.getByTestId("accordion-hours").count()) === 0,
      );
      check(
        `[${label}] no «שעות פתיחה» heading in the editor`,
        !(await page.locator("body").innerText()).includes("שעות פתיחה"),
      );
      await page.screenshot({
        path: `${OUT}/dashboard-edit-${label}-3-no-hours-card.png`,
        fullPage: false,
      });
      await ctx.close();
    }
  }

  await browser.close();

  console.log(`\n${ran.length} checks ran, ${failures.length} failed.`);
  if (failures.length) {
    console.error("FAILED:\n  " + failures.join("\n  "));
    process.exit(1);
  }
  if (ran.length === 0) {
    console.error("NO CHECKS RAN — the harness is not measuring anything.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
