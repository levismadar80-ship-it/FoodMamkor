/**
 * MEH-1655 — loading-state create-CTA jump on the 4 producer manage lists.
 *
 * Drives a local `next start` with routed API stubs (QA harness, not a flow
 * spec — the subject is a loading-window render, unreachable without holding
 * the response open). Auth: localStorage token + stubbed GET /api/auth/me
 * (producer role). Each list endpoint is held open ~2.5s to widen the
 * loading window ("throttled"), then resolves to [] (the jump case).
 *
 * Per page × viewport (375 + 1440) asserts:
 *   1. during load: ZERO create-CTAs (link/button) in the header row
 *   2. after load (empty): EXACTLY 1 create-CTA (EmptyState's; group-buys
 *      unapproved variant keeps its disabled header button — stub returns
 *      approved, so 1 applies there too)
 *   3. header row height identical during load vs after load (no jump)
 *
 * Usage: node e2e/qa-meh1655-loading-cta.mjs [outDir] [baseUrl]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const OUT = process.argv[2] || "../qa-artifacts/MEH-1655";
// REUSES: e2e/qa-meh1632-owner-404.mjs:14-22 — argv override, NOT env vars
// (Env drift gate scans for process.env reads; a one-off harness earns none).
const BASE = process.argv[3] || "http://localhost:3000";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

mkdirSync(OUT, { recursive: true });

const USER = { id: "u1", email: "qa@example.com", name: "QA", role: "producer" };
const DELAY_MS = 2500;

// page path → [list endpoints to hold open], CTA accessible name source
const PAGES = [
  { slug: "events", path: "/producer/dashboard/events", held: ["/api/events/mine"] },
  { slug: "experiences", path: "/producer/dashboard/experiences", held: ["/api/experiences/mine"] },
  { slug: "recipes", path: "/producer/dashboard/recipes", held: ["/api/producers/me/recipes"] },
  { slug: "group-buys", path: "/producer/dashboard/group-buys", held: ["/api/group-buys", "/api/producers/me/dashboard"] },
];

// Create-CTA census: primary-styled links/buttons in/above the list that
// navigate to a create route or toggle the create form. Counted by the
// bg-primary class the four pages share for their create affordance, scoped
// OUT of EmptyState for the "during" count and totalled for "after".
const countCtas = (page) =>
  page.evaluate(() => {
    const els = [...document.querySelectorAll("a.bg-primary, button.bg-primary")];
    // exclude nav/menu primary buttons outside <main>-ish content: the manage
    // pages render inside the dashboard layout; restrict to the page container.
    return els.filter((el) => el.closest("div.max-w-3xl")).length;
  });

const headerRowBox = (page) =>
  page.evaluate(() => {
    const row = document.querySelector("div.max-w-3xl > div.min-h-\\[44px\\], div.max-w-3xl > div[class*='min-h-[44px]']");
    if (!row) return null;
    const r = row.getBoundingClientRect();
    return { h: Math.round(r.height * 100) / 100 };
  });

const results = [];
const record = (pin, pass, detail) => {
  results.push({ pin, verdict: pass ? "PASS" : "FAIL", detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${pin}\n      ${detail}`);
};

const browser = await chromium.launch({
  ...(existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
});

for (const vp of [{ w: 375, h: 812 }, { w: 1440, h: 900 }]) {
  const ctx = await browser.newContext({
    locale: "he-IL",
    viewport: { width: vp.w, height: vp.h },
  });
  await ctx.addInitScript(() => localStorage.setItem("token", "qa-token"));

  for (const pg of PAGES) {
    const page = await ctx.newPage();
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/auth/me") {
        return route.fulfill({ json: USER });
      }
      if (url.pathname === "/api/producers/me/dashboard") {
        await new Promise((r) => setTimeout(r, DELAY_MS));
        return route.fulfill({
          json: { producer: { id: "p1", city: "תל אביב", status: "approved" } },
        });
      }
      if (pg.held.some((h) => url.pathname === h || url.pathname.startsWith(h))) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
        return route.fulfill({ json: [] });
      }
      return route.fulfill({ json: [] });
    });

    await page.goto(`${BASE}${pg.path}`, { waitUntil: "domcontentloaded" });
    // inside the held-open window: the page has hydrated (h1 present) but the
    // list request has not resolved
    await page.waitForSelector("div.max-w-3xl h1", { timeout: 15_000 });
    const duringCtas = await countCtas(page);
    const duringBox = await headerRowBox(page);
    await page.screenshot({ path: `${OUT}/${pg.slug}-${vp.w}-loading.png` });

    // after resolve: EmptyState is up. group-buys loads in TWO sequential
    // rounds (open+dashboard, then funded/cancelled/fulfilled), each held
    // DELAY_MS — poll for the EmptyState CTA instead of a fixed sleep.
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll("a.bg-primary, button.bg-primary")].some(
            (el) => el.closest("div.max-w-3xl"),
          ),
        { timeout: 20_000 },
      )
      .catch(() => {});
    const afterCtas = await countCtas(page);
    const afterBox = await headerRowBox(page);
    await page.screenshot({ path: `${OUT}/${pg.slug}-${vp.w}-empty.png` });

    record(
      `${pg.slug}@${vp.w} loading: 0 create-CTAs`,
      duringCtas === 0,
      `during=${duringCtas}`
    );
    record(
      `${pg.slug}@${vp.w} empty: exactly 1 create-CTA`,
      afterCtas === 1,
      `after=${afterCtas}`
    );
    record(
      `${pg.slug}@${vp.w} header row height stable`,
      duringBox && afterBox && duringBox.h === afterBox.h,
      `during=${JSON.stringify(duringBox)} after=${JSON.stringify(afterBox)}`
    );
    await page.close();
  }
  await ctx.close();
}

await browser.close();

const fails = results.filter((r) => r.verdict === "FAIL");
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
process.exit(fails.length ? 1 : 0);
